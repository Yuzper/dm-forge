// path: electron/main/index.ts
import { app, BrowserWindow } from 'electron'
import { db, initDatabase } from './db'
import { createWindow, getMainWindow } from './window'
import { initUpdater } from './updater'
import { syncTerritoryWeb } from './relationsSync'
import { registerCampaignIPC } from './ipc/campaigns'
import { registerSessionIPC } from './ipc/sessions'
import { registerMapIPC } from './ipc/maps'
import { registerArticleIPC } from './ipc/articles'
import { registerCombatIPC } from './ipc/combat'
import { registerFileIPC } from './ipc/files'
import { registerDMNotesIPC } from './ipc/dmNotes'
import { registerLootTableIPC } from './ipc/lootTables'
import { registerRelationIPC } from './ipc/relations'
import { registerSoundIPC } from './ipc/sounds'
import { registerSearchIPC } from './ipc/search'
import { registerBackupIPC } from './ipc/backup'
import { registerClockIPC } from './ipc/clocks'

function registerIPC(imagesPath: string) {
  registerCampaignIPC()
  registerSessionIPC()
  registerMapIPC(imagesPath)
  registerArticleIPC()
  registerCombatIPC()
  registerFileIPC(imagesPath)
  registerDMNotesIPC()
  registerLootTableIPC()
  registerRelationIPC()
  registerSoundIPC()
  registerSearchIPC()
  registerBackupIPC()
  registerClockIPC()
}

app.whenReady().then(() => {
  createWindow()
  const mainWindow = getMainWindow()
  if (mainWindow) initUpdater(mainWindow)
  const { imagesPath } = initDatabase()
  registerIPC(imagesPath)
  // Reconcile each campaign's auto territory web on launch (picks up edge-style
  // changes and any out-of-band edits made while the app was closed).
  try {
    for (const c of db.prepare('SELECT id FROM campaigns').all() as { id: number }[]) {
      syncTerritoryWeb(c.id)
    }
  } catch (e) { console.error('territory reconcile on launch failed:', e) }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
