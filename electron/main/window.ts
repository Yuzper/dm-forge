// path: electron/main/window.ts
import { app, BrowserWindow, Menu } from 'electron'
import path from 'path'

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d0b09',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      backgroundThrottling: true,
    },
  })

  const systemLocale = app.getLocale()
  const available = mainWindow.webContents.session.availableSpellCheckerLanguages
  const language = available.includes(systemLocale) ? systemLocale : 'en-US'
  mainWindow.webContents.session.setSpellCheckerLanguages([language])

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
//    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })

  // Forward native find-in-page results (match count + active ordinal) to the renderer.
  mainWindow.webContents.on('found-in-page', (_e, result) => {
    mainWindow?.webContents.send('find:result', {
      matches: result.matches,
      active: result.activeMatchOrdinal,
    })
  })

  mainWindow.webContents.on('context-menu', (_, params) => {
    if (!params.misspelledWord) return
    const menu = Menu.buildFromTemplate([
      ...(params.dictionarySuggestions ?? []).map(word => ({
        label: word,
        click: () => mainWindow!.webContents.replaceMisspelling(word),
      })),
      ...((params.dictionarySuggestions ?? []).length > 0 ? [{ type: 'separator' as const }] : []),
      {
        label: 'Add to dictionary',
        click: () => mainWindow!.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      },
    ])
    menu.popup()
  })

  return mainWindow
}
