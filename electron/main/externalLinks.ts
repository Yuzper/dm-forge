// path: electron/main/externalLinks.ts
// Everything to do with leaving the app for a web browser.
//
// Two halves that have to agree:
//   • `shell:open-external` — the renderer asking, on the user's click, for a
//     link in their notes to open in their own browser.
//   • The window guards — a real <a href> inside the editor would otherwise
//     navigate the app window itself to YouTube, and the app would be gone
//     (there is no back button). `webSecurity: false` makes that worse, so the
//     guards are not optional.
//
// Both go through one allowlist. `shell.openExternal` hands the string to the
// OS, which will happily run whatever is registered for an exotic scheme, so
// only the three schemes a note can legitimately contain are let through — and
// never a file:// path, which is how a stray link could reach local files.

import { BrowserWindow, ipcMain, shell } from 'electron'

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/** The url if it is safe to hand to the OS, otherwise null. */
export function safeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null
  let parsed: URL
  try { parsed = new URL(raw) } catch { return null }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null
  return parsed.toString()
}

export function registerExternalLinkIPC() {
  ipcMain.handle('shell:open-external', async (_e, url: string) => {
    const safe = safeExternalUrl(url)
    if (!safe) return false
    await shell.openExternal(safe)
    return true
  })
}

/**
 * Keeps the app window on the app. Anything that tries to navigate it
 * elsewhere — a clicked link the renderer didn't intercept, a target=_blank,
 * a window.open — is turned into "open in the user's browser" instead, and
 * refused outright if it isn't a web address.
 */
export function guardWindowNavigation(win: BrowserWindow) {
  const isAppUrl = (url: string) =>
    url.startsWith('file://') || (!!process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL))

  win.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return            // the app loading itself, or HMR in dev
    event.preventDefault()
    const safe = safeExternalUrl(url)
    if (safe) void shell.openExternal(safe)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    const safe = safeExternalUrl(url)
    if (safe) void shell.openExternal(safe)
    return { action: 'deny' }            // never a second Electron window
  })
}
