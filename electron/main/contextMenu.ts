// path: electron/main/contextMenu.ts
import { Menu } from 'electron'
import type { BrowserWindow, ContextMenuParams, MenuItemConstructorOptions } from 'electron'

// Native context menus for text. Until now this handler early-returned unless
// Chromium reported a misspelled word, so right-clicking an input gave nothing
// at all — no cut/copy/paste/select-all anywhere in the app.
//
// Everything here uses Electron *roles* rather than hand-rolled handlers, which
// is what makes Paste possible: the renderer cannot read the clipboard from a
// menu without extra plumbing, but a role runs in the browser process.
//
// This is the fallback layer. A renderer-side entity menu (wiki card, map POI,
// relations node…) claims a right-click by calling preventDefault() on the DOM
// event, which suppresses this event entirely — verified against Electron 29,
// so the two layers cannot both fire for one click and need no coordination.

function spellcheckItems(win: BrowserWindow, params: ContextMenuParams): MenuItemConstructorOptions[] {
  if (!params.misspelledWord) return []
  return [
    ...(params.dictionarySuggestions ?? []).map(word => ({
      label: word,
      click: () => win.webContents.replaceMisspelling(word),
    })),
    ...((params.dictionarySuggestions ?? []).length > 0 ? [{ type: 'separator' as const }] : []),
    {
      label: 'Add to dictionary',
      click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
    },
    { type: 'separator' as const },
  ]
}

function editingItems(params: ContextMenuParams): MenuItemConstructorOptions[] {
  const f = params.editFlags
  return [
    { role: 'undo',  enabled: f.canUndo },
    { role: 'redo',  enabled: f.canRedo },
    { type: 'separator' },
    { role: 'cut',   enabled: f.canCut },
    { role: 'copy',  enabled: f.canCopy },
    { role: 'paste', enabled: f.canPaste },
    // Pasting styled text into the rich editor usually wants the surrounding
    // style, not the source's.
    { role: 'pasteAndMatchStyle', enabled: f.canPaste },
    { type: 'separator' },
    { role: 'selectAll', enabled: f.canSelectAll },
  ]
}

function selectionItems(params: ContextMenuParams): MenuItemConstructorOptions[] {
  if (!params.selectionText.trim()) return []
  return [{ role: 'copy', enabled: params.editFlags.canCopy }]
}

export function registerContextMenu(win: BrowserWindow) {
  win.webContents.on('context-menu', (_e, params) => {
    const template: MenuItemConstructorOptions[] = [
      ...spellcheckItems(win, params),
      ...(params.isEditable ? editingItems(params) : selectionItems(params)),
    ]

    // Read-only area with nothing selected: no menu, same as before. Entity
    // menus will fill this space from the renderer side.
    if (template.length === 0) return

    Menu.buildFromTemplate(template).popup({ window: win })
  })
}
