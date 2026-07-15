// path: electron/main/ipc/sounds.ts
import { app, dialog, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { db } from '../db'
import { scanDefaultSounds } from '../defaults'
import { safeUnlinkRelative } from '../helpers'

export function registerSoundIPC() {

  // Copied audio files live under userData/sounds and can be shared by several
  // sound rows (the picker reuses an existing file instead of duplicating it).
  // Bundled defaults use `default:` refs and are never touched. Call AFTER the
  // owning rows are deleted so the ref-count reflects the remaining state.
  function unlinkSoundFileIfOrphaned(filePath: string) {
    if (!filePath.startsWith('sounds/')) return
    const { c } = db.prepare('SELECT COUNT(*) AS c FROM sounds WHERE file_path = ?').get(filePath) as { c: number }
    if (c === 0) safeUnlinkRelative(filePath, app.getPath('userData'))
  }

  // ── Sound Boards ──────────────────────────────────────────────────────────────

  ipcMain.handle('soundboards:get-all', (_e, campaignId: number) => {
    return db.prepare(`
      SELECT sb.*, COUNT(s.id) AS sound_count
      FROM sound_boards sb
      LEFT JOIN sounds s ON s.board_id = sb.id
      WHERE sb.campaign_id = ?
      GROUP BY sb.id
      ORDER BY sb.sort_order ASC, sb.created_at ASC
    `).all(campaignId)
  })

  ipcMain.handle('soundboards:create', (_e, data: { campaign_id: number; name: string }) => {
    const maxRow = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM sound_boards WHERE campaign_id = ?').get(data.campaign_id) as { m: number }
    const result = db.prepare(`
      INSERT INTO sound_boards (campaign_id, name, sort_order)
      VALUES (@campaign_id, @name, @sort_order)
    `).run({ ...data, sort_order: maxRow.m + 1 })
    return db.prepare('SELECT * FROM sound_boards WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('soundboards:update', (_e, id: number, data: any) => {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE sound_boards SET ${fields} WHERE id = @id`).run({ ...data, id })
    return db.prepare('SELECT * FROM sound_boards WHERE id = ?').get(id)
  })

  ipcMain.handle('soundboards:delete', (_e, id: number) => {
    const files = db.prepare(
      "SELECT DISTINCT file_path FROM sounds WHERE board_id = ? AND file_path LIKE 'sounds/%'"
    ).all(id) as { file_path: string }[]
    db.prepare('DELETE FROM sound_boards WHERE id = ?').run(id)
    for (const f of files) unlinkSoundFileIfOrphaned(f.file_path)
  })

  // ── Sounds ────────────────────────────────────────────────────────────────────

  ipcMain.handle('sounds:get-all', (_e, boardId: number) => {
    return db.prepare(`
      SELECT * FROM sounds WHERE board_id = ? ORDER BY sort_order ASC, created_at ASC
    `).all(boardId)
  })

  ipcMain.handle('sounds:create', (_e, data: { board_id: number; name: string; category: string; file_path: string; hotkey: string; volume: number; loop?: number }) => {
    const maxRow = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM sounds WHERE board_id = ?').get(data.board_id) as { m: number }
    // Default loop by category when not explicitly provided: effects are one-shot.
    const loop = data.loop != null ? data.loop : (data.category === 'effect' ? 0 : 1)
    const result = db.prepare(`
      INSERT INTO sounds (board_id, name, category, file_path, hotkey, volume, loop, sort_order)
      VALUES (@board_id, @name, @category, @file_path, @hotkey, @volume, @loop, @sort_order)
    `).run({ ...data, loop, sort_order: maxRow.m + 1 })
    return db.prepare('SELECT * FROM sounds WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('sounds:update', (_e, id: number, data: any) => {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE sounds SET ${fields} WHERE id = @id`).run({ ...data, id })
    return db.prepare('SELECT * FROM sounds WHERE id = ?').get(id)
  })

  ipcMain.handle('sounds:delete', (_e, id: number) => {
    const sound = db.prepare('SELECT file_path FROM sounds WHERE id = ?').get(id) as { file_path: string } | undefined
    db.prepare('DELETE FROM sounds WHERE id = ?').run(id)
    if (sound) unlinkSoundFileIfOrphaned(sound.file_path)
  })

  ipcMain.handle('soundboards:get-defaults', () => {
    return scanDefaultSounds()
  })

  ipcMain.handle('sounds:select-file', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select audio file',
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'webm'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null

    const srcPath = result.filePaths[0]
    const sndDir  = path.join(app.getPath('userData'), 'sounds')
    fs.mkdirSync(sndDir, { recursive: true })

    // Already inside sounds dir — reuse without copying
    if (path.normalize(srcPath).startsWith(path.normalize(sndDir) + path.sep)) {
      return 'sounds/' + path.basename(srcPath)
    }

    // Copy to sounds dir, avoiding name collisions
    const ext  = path.extname(srcPath)
    const base = path.basename(srcPath, ext)
    let destName = base + ext
    if (fs.existsSync(path.join(sndDir, destName))) {
      destName = `${base}_${Date.now()}${ext}`
    }
    fs.copyFileSync(srcPath, path.join(sndDir, destName))
    return `sounds/${destName}`
  })
}
