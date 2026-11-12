// path: electron/main/vtt.ts
// The table window: a second, player-facing BrowserWindow meant for a TV lying
// flat on the table, with physical minis standing on it.
//
// Placement. With a second display attached we create the window at that
// display's bounds and go fullscreen once it is ready to show. Constructing
// with `fullscreen: true` straight away is unreliable on Windows — the window
// can claim the primary display instead — so the two steps stay separate. With
// only one display we still open the window, just windowed, and say so in the
// result: the DM drags it across and presses F11. Neither path touches
// anything that would need elevation.
//
// Relay. This module does not know what a scene is. It forwards opaque cast
// messages from the DM window to the table window and keeps the last one of
// each type, so a table window opened (or reopened) after the fact catches up
// instead of showing an empty screen. That cache is what keeps the transport
// swappable: when the Raspberry Pi tracker arrives and this becomes a
// WebSocket, only the two ends change, not the projection or the view.
import { BrowserWindow, ipcMain, screen } from 'electron'
import path from 'path'

export interface DisplayInfo {
  id: number
  label: string
  /** DIP bounds — what BrowserWindow positioning uses. */
  bounds: { x: number; y: number; width: number; height: number }
  /** Physical pixels per DIP. 1 on most TVs. */
  scaleFactor: number
  primary: boolean
}

export type TableOpenMode = 'secondary-fullscreen' | 'primary-windowed'

export interface TableStatus {
  open: boolean
  displayId: number | null
  mode: TableOpenMode | null
  fullscreen: boolean
  /**
   * The table window's own inner size in CSS px, as reported by the view
   * itself. The DM's minimap needs it to know how much map fits on the table,
   * and only the table can say: a windowed fallback is not the display's size,
   * and going fullscreen changes it.
   */
  screen: { w: number; h: number } | null
}

let tableWindow: BrowserWindow | null = null
let openMode: TableOpenMode | null = null
let openDisplayId: number | null = null
let tableScreen: { w: number; h: number } | null = null

/** Last message of each `type`, replayed to a table window when it loads. */
const lastByType = new Map<string, unknown>()

export function listDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label || `Display ${i + 1}`,
    bounds: { x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height },
    scaleFactor: d.scaleFactor,
    primary: d.id === primaryId,
  }))
}

/**
 * The display we would put the table on by default: the first one that is not
 * primary. Null when the laptop is the only screen.
 */
function defaultTableDisplay() {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().find(d => d.id !== primaryId) ?? null
}

export function tableStatus(): TableStatus {
  if (!tableWindow || tableWindow.isDestroyed()) {
    return { open: false, displayId: null, mode: null, fullscreen: false, screen: null }
  }
  return {
    open: true,
    displayId: openDisplayId,
    mode: openMode,
    fullscreen: tableWindow.isFullScreen(),
    screen: tableScreen,
  }
}

function send(msg: Record<string, unknown>) {
  if (!tableWindow || tableWindow.isDestroyed()) return
  tableWindow.webContents.send('vtt:message', msg)
}

export function openTableWindow(displayId?: number | null): TableStatus {
  if (tableWindow && !tableWindow.isDestroyed()) {
    tableWindow.focus()
    return tableStatus()
  }

  const displays = screen.getAllDisplays()
  const requested = displayId != null ? displays.find(d => d.id === displayId) ?? null : null
  const target = requested ?? defaultTableDisplay()
  const onSecondary = target !== null
  const bounds = (target ?? screen.getPrimaryDisplay()).bounds

  openMode = onSecondary ? 'secondary-fullscreen' : 'primary-windowed'
  openDisplayId = target?.id ?? screen.getPrimaryDisplay().id

  tableWindow = new BrowserWindow({
    // Windowed on a single-display setup: a window that opened fullscreen over
    // the laptop would cover DM-Forge itself, leaving nothing to drag it with.
    x: onSecondary ? bounds.x : bounds.x + 60,
    y: onSecondary ? bounds.y : bounds.y + 60,
    width: onSecondary ? bounds.width : Math.min(1280, bounds.width - 120),
    height: onSecondary ? bounds.height : Math.min(800, bounds.height - 120),
    title: 'DM-Forge — Table',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      // The table must keep rendering while the DM works in the other window.
      backgroundThrottling: false,
    },
  })

  tableWindow.once('ready-to-show', () => {
    if (!tableWindow || tableWindow.isDestroyed()) return
    if (onSecondary) tableWindow.setFullScreen(true)
    tableWindow.show()
  })

  // The table window has no menu bar, so the usual fullscreen accelerators are
  // not bound. F11 toggles; Escape only ever leaves fullscreen — closing the
  // players' view on a stray keypress would be worse than useless.
  tableWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown' || !tableWindow || tableWindow.isDestroyed()) return
    if (input.key === 'F11') tableWindow.setFullScreen(!tableWindow.isFullScreen())
    else if (input.key === 'Escape' && tableWindow.isFullScreen()) tableWindow.setFullScreen(false)
  })

  // Replay the cached state once the view is live, so opening the table
  // mid-session shows the current scene rather than the idle screen.
  tableWindow.webContents.on('did-finish-load', () => {
    for (const msg of lastByType.values()) send(msg as Record<string, unknown>)
  })

  tableWindow.on('closed', () => {
    tableWindow = null
    openMode = null
    openDisplayId = null
    tableScreen = null
    notifyStatus()
  })
  const notify = () => notifyStatus()
  tableWindow.on('enter-full-screen', notify)
  tableWindow.on('leave-full-screen', notify)

  if (process.env.ELECTRON_RENDERER_URL) {
    tableWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}?mode=vtt`)
  } else {
    tableWindow.loadFile(path.join(__dirname, '../renderer/index.html'), { query: { mode: 'vtt' } })
  }

  return tableStatus()
}

export function closeTableWindow() {
  if (tableWindow && !tableWindow.isDestroyed()) tableWindow.close()
}

/** Tell every other window that the table's state changed, so UI can follow. */
function notifyStatus() {
  const status = tableStatus()
  for (const w of BrowserWindow.getAllWindows()) {
    if (w === tableWindow || w.isDestroyed()) continue
    w.webContents.send('vtt:status', status)
  }
}

export function registerVTTIPC() {
  ipcMain.handle('vtt:list-displays', () => listDisplays())
  ipcMain.handle('vtt:status', () => tableStatus())
  ipcMain.handle('vtt:open', (_e, displayId?: number | null) => {
    const status = openTableWindow(displayId)
    notifyStatus()
    return status
  })
  ipcMain.handle('vtt:close', () => { closeTableWindow(); return tableStatus() })
  ipcMain.handle('vtt:set-fullscreen', (_e, on: boolean) => {
    if (tableWindow && !tableWindow.isDestroyed()) tableWindow.setFullScreen(on)
    return tableStatus()
  })

  // The one door state goes through. Opaque by design — see the file header.
  ipcMain.handle('vtt:cast', (_e, msg: { type?: string }) => {
    if (!msg || typeof msg.type !== 'string') return false
    lastByType.set(msg.type, msg)
    send(msg as Record<string, unknown>)
    return true
  })

  // A table window that reloads itself (dev HMR, or a crash) asks for the
  // current state rather than waiting for the DM to touch something.
  ipcMain.handle('vtt:resend', () => {
    for (const msg of lastByType.values()) send(msg as Record<string, unknown>)
    return true
  })

  // The one message that travels the other way: the table telling the DM how
  // big it is. Kept on the status rather than given a channel of its own, so
  // the DM learns it through the subscription it already has.
  ipcMain.handle('vtt:report-size', (_e, size: { w: number; h: number }) => {
    if (!size || !Number.isFinite(size.w) || !Number.isFinite(size.h)) return false
    tableScreen = { w: size.w, h: size.h }
    notifyStatus()
    return true
  })
}
