// path: electron/main/ipc/sessions.ts
import { app, ipcMain } from 'electron'
import { db } from '../db'
import { extractInlineImagePaths, safeUnlink, safeUnlinkRelative } from '../helpers'

export function registerSessionIPC() {

  ipcMain.handle('sessions:get-all', (_e, campaignId: number) => {
    return db.prepare(`
      SELECT s.*, COUNT(m.id) as map_count
      FROM sessions s
      LEFT JOIN maps m ON m.session_id = s.id
      WHERE s.campaign_id = ?
      GROUP BY s.id
      ORDER BY s.is_draft ASC, s.session_number ASC, s.session_sub ASC, s.sort_order ASC
    `).all(campaignId)
  })

  ipcMain.handle('sessions:create', (_e, data: any) => {
    const isDraft = data.is_draft ? 1 : 0
    let sessionNumber = data.session_number ?? 1
    let sortOrder = 0
    if (isDraft) {
      // Drafts aren't sequenced: park them at number 0 and append to the prep list.
      sessionNumber = 0
      const { m } = db.prepare(
        'SELECT COALESCE(MAX(sort_order), -1) AS m FROM sessions WHERE campaign_id = @campaign_id AND is_draft = 1'
      ).get(data) as { m: number }
      sortOrder = m + 1
    }
    const result = db.prepare(`
      INSERT INTO sessions (campaign_id, name, session_number, session_sub, arc_id, date, notes, is_draft, sort_order)
      VALUES (@campaign_id, @name, @session_number, @session_sub, @arc_id, @date, @notes, @is_draft, @sort_order)
    `).run({ date: null, notes: '', session_sub: '', arc_id: null, ...data, session_number: sessionNumber, is_draft: isDraft, sort_order: sortOrder })
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(result.lastInsertRowid) as any

    if (!isDraft) {
      const sysGroup = db.prepare(
        'SELECT * FROM dm_notes_groups WHERE campaign_id = ? AND is_system = 1'
      ).get(data.campaign_id) as any
      if (sysGroup) {
        const title = data.session_sub
          ? `Session ${sessionNumber}${data.session_sub}`
          : `Session ${sessionNumber}`
        const { m } = db.prepare(
          'SELECT COALESCE(MAX(sort_order), -1) as m FROM dm_notes_pages WHERE group_id = ?'
        ).get(sysGroup.id) as { m: number }
        db.prepare(`
          INSERT INTO dm_notes_pages (campaign_id, title, content, group_id, sort_order, session_id)
          VALUES (?, ?, '{"type":"doc","content":[]}', ?, ?, ?)
        `).run(data.campaign_id, title, sysGroup.id, m + 1, session.id)
      }
    }

    return session
  })

  ipcMain.handle('sessions:update', (_e, id: number, data: any) => {
    const old = data.notes !== undefined
      ? db.prepare('SELECT notes FROM sessions WHERE id = ?').get(id) as { notes: string } | undefined
      : undefined
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE sessions SET ${fields} WHERE id = @id`).run({ ...data, id })
    // Unlink inline images that were removed from the notes in this update.
    if (old && data.notes !== old.notes) {
      const userDataPath = app.getPath('userData')
      const oldPaths = new Set(extractInlineImagePaths(old.notes || '', userDataPath))
      const newPaths = new Set(extractInlineImagePaths(data.notes || '', userDataPath))
      for (const p of oldPaths) { if (!newPaths.has(p)) safeUnlink(p) }
    }
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
  })

  // Promote a draft into the sequenced list: append it as the next whole number.
  ipcMain.handle('sessions:promote', (_e, id: number) => {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any
    if (!session) return null
    const { m } = db.prepare(
      'SELECT COALESCE(MAX(session_number), 0) AS m FROM sessions WHERE campaign_id = ? AND is_draft = 0'
    ).get(session.campaign_id) as { m: number }
    const newNumber = m + 1
    db.prepare(
      "UPDATE sessions SET is_draft = 0, session_number = ?, session_sub = '', sort_order = 0 WHERE id = ?"
    ).run(newNumber, id)
    const promoted = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any

    const sysGroup = db.prepare(
      'SELECT * FROM dm_notes_groups WHERE campaign_id = ? AND is_system = 1'
    ).get(session.campaign_id) as any
    if (sysGroup) {
      const already = db.prepare(
        'SELECT id FROM dm_notes_pages WHERE session_id = ?'
      ).get(id) as any
      if (!already) {
        const title = `Session ${newNumber}`
        const { m: maxOrder } = db.prepare(
          'SELECT COALESCE(MAX(sort_order), -1) as m FROM dm_notes_pages WHERE group_id = ?'
        ).get(sysGroup.id) as { m: number }
        db.prepare(`
          INSERT INTO dm_notes_pages (campaign_id, title, content, group_id, sort_order, session_id)
          VALUES (?, ?, '{"type":"doc","content":[]}', ?, ?, ?)
        `).run(session.campaign_id, title, sysGroup.id, maxOrder + 1, id)
      }
    }

    return promoted
  })

  ipcMain.handle('sessions:reorder-drafts', (_e, orders: { id: number; sort_order: number }[]) => {
    const stmt = db.prepare('UPDATE sessions SET sort_order = @sort_order WHERE id = @id')
    db.transaction((list: { id: number; sort_order: number }[]) => {
      for (const o of list) stmt.run(o)
    })(orders)
  })

  ipcMain.handle('sessions:get-poi-texts', (_e, campaignId: number) => {
    return db.prepare(`
      SELECT p.label, p.content, m.session_id
      FROM pois p
      JOIN maps m ON m.id = p.map_id
      JOIN sessions s ON s.id = m.session_id
      WHERE s.campaign_id = ?
    `).all(campaignId)
  })

  ipcMain.handle('sessions:delete', (_e, id: number) => {
    const userDataPath = app.getPath('userData')
    const session = db.prepare('SELECT notes FROM sessions WHERE id = ?').get(id) as { notes: string } | undefined
    const maps = db.prepare('SELECT DISTINCT image_path FROM maps WHERE session_id = ?').all(id) as { image_path: string }[]
    const pois = db.prepare(`
      SELECT p.content FROM pois p JOIN maps m ON m.id = p.map_id WHERE m.session_id = ?
    `).all(id) as { content: string }[]

    // The mirror page in the "Session Notes" DM-notes group has no content of
    // its own (it reads from session.notes), so it would survive as an empty
    // orphan — remove it along with the session.
    db.prepare('DELETE FROM dm_notes_pages WHERE session_id = ?').run(id)
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id)

    if (session) extractInlineImagePaths(session.notes || '', userDataPath).forEach(safeUnlink)
    for (const p of pois) extractInlineImagePaths(p.content, userDataPath).forEach(safeUnlink)
    // Map images can be shared with other maps (picker reuse) — ref-count first.
    const mapRefs = db.prepare('SELECT COUNT(*) AS c FROM maps WHERE image_path = ?')
    for (const map of maps) {
      if ((mapRefs.get(map.image_path) as { c: number }).c === 0) safeUnlinkRelative(map.image_path, userDataPath)
    }
  })

  // ── Arcs ──────────────────────────────────────────────────────────────────────

  ipcMain.handle('arcs:get-all', (_e, campaignId: number) => {
    let arcs = db.prepare(
      'SELECT * FROM arcs WHERE campaign_id = ? ORDER BY sort_order ASC, name ASC'
    ).all(campaignId) as any[]
    if (arcs.length === 0) {
      const result = db.prepare(`
        INSERT INTO arcs (campaign_id, name, color, is_default)
        VALUES (?, 'Main Story', '#c8a84b', 1)
      `).run(campaignId)
      arcs = [db.prepare('SELECT * FROM arcs WHERE id = ?').get(result.lastInsertRowid)]
    }
    return arcs.map(a => ({ ...a, is_default: a.is_default === 1 }))
  })

  ipcMain.handle('arcs:create', (_e, data: any) => {
    const { m } = db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) as m FROM arcs WHERE campaign_id = @campaign_id'
    ).get(data) as { m: number }
    const result = db.prepare(`
      INSERT INTO arcs (campaign_id, name, color, is_default, sort_order)
      VALUES (@campaign_id, @name, @color, 0, @sort_order)
    `).run({ color: '#c8a84b', sort_order: m + 1, ...data })
    const arc = db.prepare('SELECT * FROM arcs WHERE id = ?').get(result.lastInsertRowid) as any
    return { ...arc, is_default: false }
  })

  ipcMain.handle('arcs:reorder', (_e, orders: { id: number; sort_order: number }[]) => {
    const stmt = db.prepare('UPDATE arcs SET sort_order = @sort_order WHERE id = @id')
    db.transaction((list: { id: number; sort_order: number }[]) => {
      for (const o of list) stmt.run(o)
    })(orders)
  })

  ipcMain.handle('arcs:update', (_e, id: number, data: any) => {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE arcs SET ${fields} WHERE id = @id`).run({ ...data, id })
    const arc = db.prepare('SELECT * FROM arcs WHERE id = ?').get(id) as any
    return { ...arc, is_default: arc.is_default === 1 }
  })

  ipcMain.handle('arcs:delete', (_e, id: number) => {
    const arc = db.prepare('SELECT * FROM arcs WHERE id = ?').get(id) as any
    if (!arc) return { success: false, error: 'Arc not found' }
    if (arc.is_default) return { success: false, error: 'Cannot delete the default arc' }
    const defaultArc = db.prepare(
      'SELECT id FROM arcs WHERE campaign_id = ? AND is_default = 1'
    ).get(arc.campaign_id) as any
    if (defaultArc) {
      db.prepare('UPDATE sessions SET arc_id = ? WHERE arc_id = ?').run(defaultArc.id, id)
    }
    db.prepare('DELETE FROM arcs WHERE id = ?').run(id)
    return { success: true }
  })
}
