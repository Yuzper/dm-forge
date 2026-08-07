// path: electron/main/appMenu.ts
import { app, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'

// The app ran with Electron's default menu until now, which bound Ctrl+W to
// "Close Window" and Ctrl+Q to Quit. Neither is wanted: Ctrl+W belongs to the
// tab system, and closing the app by keyboard is not a thing this app needs —
// the window's own close button covers it.
//
// Exit is therefore a plain click handler rather than `role: 'quit'`. A role
// re-attaches its default accelerator unless you explicitly displace it, and
// `registerAccelerator: false` would still *display* a shortcut that does
// nothing. No role, no accelerator, nothing registered.
//
// Chords already owned by the renderer are left out entirely: Ctrl+S is the
// search palette (GlobalSearch.tsx) and Ctrl+F is the find bar (FindBar.tsx).
// A menu accelerator would win over their keydown handlers.

export function buildAppMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: '&File',
      submenu: [
        { label: 'Exit', click: () => app.quit() },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '&View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '&Window',
      submenu: [
        { role: 'minimize' },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
