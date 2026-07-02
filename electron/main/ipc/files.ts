// path: electron/main/ipc/files.ts
import { app, dialog, ipcMain } from 'electron'
import path from 'path'
import { getMainWindow } from '../window'
import { processAndSaveImage } from '../helpers'
import { defaultSoundboardDir, buildCreatureImageMap } from '../defaults'

export function registerFileIPC(imagesPath: string) {

  ipcMain.handle('file:select-image', async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Image',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths.length) return null
    const srcPath = result.filePaths[0]
    const baseName = `img_${Date.now()}`
    const filename = processAndSaveImage(srcPath, imagesPath, baseName, 1200, 85)
    return `images/${filename}`
  })

  ipcMain.handle('file:get-image-path', (_e, relativePath: string) => {
    // Bundled default sounds are referenced as `default:<folder>/<file>` so they
    // resolve against the app's read-only soundboard dir, not userData. This lets
    // a default sound be added to a campaign board and still export/import cleanly.
    if (relativePath.startsWith('default:')) {
      const baseDir = defaultSoundboardDir()
      const rel     = relativePath.slice('default:'.length)
      return baseDir ? `file://${path.join(baseDir, rel)}` : ''
    }
    const userDataPath = app.getPath('userData')
    return `file://${path.join(userDataPath, relativePath)}`
  })

  // ── Creature Images ───────────────────────────────────────────────────────────

  // Returns { "goblin": "C:\\Users\\...\\images\\creature_goblin.jpg", … }
  // Values are full absolute paths (no file:// prefix) — matching the format WikiPage stores for all images.
  ipcMain.handle('creatures:list-images', () => {
    const userDataPath = app.getPath('userData')
    const imagesPath = path.join(userDataPath, 'images')
    const relMap = buildCreatureImageMap(imagesPath)
    const fullMap: Record<string, string> = {}
    for (const [key, relativePath] of Object.entries(relMap)) {
      fullMap[key] = path.join(userDataPath, relativePath)
    }
    return fullMap
  })
}
