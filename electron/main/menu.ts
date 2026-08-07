// path: electron/main/menu.ts
// One generic channel for every renderer-built context menu. The renderer sends
// a serializable template — labels, types, enabled flags, nothing callable — and
// gets back the id of whatever the user picked. All the actual behaviour stays
// in the renderer where the store is, so main never learns what an "article" is.
//
// Why a round trip at all, rather than a styled div: native menus sit above
// everything, dismiss on the OS's rules, and get keyboard nav and edge-flipping
// for free. The cost is that they're OS chrome — light on Windows, no icons, no
// colour swatches. Accepted; a menu that genuinely needs a swatch can still fall
// back to the existing `.menu-item` pattern.
import { ipcMain, Menu, BrowserWindow } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'

export interface MenuTemplateItem {
  /** Absent on separators. Echoed back when the item is chosen. */
  id?: string
  label?: string
  type?: 'normal' | 'separator' | 'checkbox'
  enabled?: boolean
  checked?: boolean
  /** Display only — see registerAccelerator below. */
  accelerator?: string
  submenu?: MenuTemplateItem[]
}

function build(items: MenuTemplateItem[], onPick: (id: string) => void): MenuItemConstructorOptions[] {
  return items.map(item => ({
    label: item.label,
    // A submenu item must not declare type: 'normal', or Electron ignores the
    // submenu entirely.
    type: item.submenu ? undefined : item.type,
    enabled: item.enabled,
    checked: item.checked,
    accelerator: item.accelerator,
    // The chord belongs to the renderer's keydown handlers (or to nothing at
    // all). Registering it here would let a *shown* menu swallow the real one,
    // and would fight the deliberately-unbound Ctrl+W from the app menu.
    registerAccelerator: false,
    submenu: item.submenu ? build(item.submenu, onPick) : undefined,
    click: item.id ? () => onPick(item.id!) : undefined,
  }))
}

export function registerMenuIPC() {
  ipcMain.handle('menu:popup', (e, template: MenuTemplateItem[]) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win || !Array.isArray(template) || template.length === 0) return null

    return new Promise<string | null>(resolve => {
      // The two ways this settles race each other, and which wins is not
      // guaranteed: `popup`'s callback can fire *before* the chosen item's own
      // click handler. Resolving from both sides makes the order irrelevant —
      // a promise settles once, so whichever arrives first is the answer, and
      // the deferred dismissal only reports null when no click ever landed.
      let chosen: string | null = null
      const menu = Menu.buildFromTemplate(build(template, id => { chosen = id; resolve(id) }))
      menu.popup({
        window: win,
        callback: () => setTimeout(() => resolve(chosen), 0),
      })
    })
  })
}
