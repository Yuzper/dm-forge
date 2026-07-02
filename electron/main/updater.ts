// path: electron/main/updater.ts
import { BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

export function initUpdater(mainWindow: BrowserWindow) {
  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('updater:available', { version: info.version })
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('updater:downloaded', { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    log.error('Updater error:', err)
  })

  autoUpdater.checkForUpdates()
  setInterval(() => autoUpdater.checkForUpdates(), 1000 * 60 * 60 * 4)

  ipcMain.handle('updater:check',   () => autoUpdater.checkForUpdates())
  ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall())
}
