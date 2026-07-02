// path: electron/main/ipc/dmNotes.ts
import { ipcMain } from 'electron'
import { db } from '../db'

export function registerDMNotesIPC() {

  // ── DM Notes — Pages ──────────────────────────────────────────────────────────

  ipcMain.handle('dm-notes:get-all', (_e, campaignId: number) => {
    return db.prepare(`
      SELECT id, campaign_id, title, group_id, sort_order, session_id, created_at, updated_at
      FROM dm_notes_pages
      WHERE campaign_id = ?
      ORDER BY sort_order ASC
    `).all(campaignId)
  })

  ipcMain.handle('dm-notes:get', (_e, id: number) => {
    const page = db.prepare('SELECT * FROM dm_notes_pages WHERE id = ?').get(id) as any
    if (!page) return null
    if (page.session_id) {
      const session = db.prepare('SELECT notes FROM sessions WHERE id = ?').get(page.session_id) as any
      if (session) page.content = session.notes && session.notes !== '' ? session.notes : '{"type":"doc","content":[]}'
    }
    return page
  })

  ipcMain.handle('dm-notes:create', (_e, campaignId: number, groupId: number | null) => {
    const maxRow = groupId != null
      ? db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM dm_notes_pages WHERE campaign_id = ? AND group_id = ?').get(campaignId, groupId) as { m: number }
      : db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM dm_notes_pages WHERE campaign_id = ? AND group_id IS NULL').get(campaignId) as { m: number }
    const sortOrder = maxRow.m + 1
    const result = db.prepare(`
      INSERT INTO dm_notes_pages (campaign_id, title, content, group_id, sort_order)
      VALUES (?, 'Untitled', '{"type":"doc","content":[]}', ?, ?)
    `).run(campaignId, groupId ?? null, sortOrder)
    return db.prepare('SELECT * FROM dm_notes_pages WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('dm-notes:update', (_e, id: number, data: any) => {
    const page = db.prepare('SELECT session_id FROM dm_notes_pages WHERE id = ?').get(id) as any
    if (page?.session_id && 'content' in data) {
      // Route content changes to the linked session instead of the page's own content column
      db.prepare('UPDATE sessions SET notes = ? WHERE id = ?').run(data.content, page.session_id)
      const rest = Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'content'))
      if (Object.keys(rest).length > 0) {
        const fields = Object.keys(rest).map(k => `${k} = @${k}`).join(', ')
        db.prepare(`UPDATE dm_notes_pages SET ${fields}, updated_at = datetime('now') WHERE id = @id`).run({ ...rest, id })
      } else {
        db.prepare(`UPDATE dm_notes_pages SET updated_at = datetime('now') WHERE id = @id`).run({ id })
      }
    } else {
      const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
      db.prepare(`UPDATE dm_notes_pages SET ${fields}, updated_at = datetime('now') WHERE id = @id`).run({ ...data, id })
    }
    // Return the page with session content substituted if applicable
    const updated = db.prepare('SELECT * FROM dm_notes_pages WHERE id = ?').get(id) as any
    if (updated?.session_id) {
      const session = db.prepare('SELECT notes FROM sessions WHERE id = ?').get(updated.session_id) as any
      if (session) updated.content = session.notes && session.notes !== '' ? session.notes : '{"type":"doc","content":[]}'
    }
    return updated
  })

  ipcMain.handle('dm-notes:delete', (_e, id: number) => {
    db.prepare('DELETE FROM dm_notes_pages WHERE id = ?').run(id)
  })

  ipcMain.handle('dm-notes:reorder-pages', (_e, orders: { id: number; sort_order: number; group_id: number | null }[]) => {
    const stmt = db.prepare('UPDATE dm_notes_pages SET sort_order = @sort_order, group_id = @group_id WHERE id = @id')
    const transaction = db.transaction((list: any[]) => {
      for (const o of list) stmt.run({ id: o.id, sort_order: o.sort_order, group_id: o.group_id ?? null })
    })
    transaction(orders)
  })

  // ── DM Notes — Groups ─────────────────────────────────────────────────────────

  ipcMain.handle('dm-notes:get-groups', (_e, campaignId: number) => {
    return db.prepare('SELECT * FROM dm_notes_groups WHERE campaign_id = ? ORDER BY sort_order ASC').all(campaignId)
  })

  ipcMain.handle('dm-notes:create-group', (_e, campaignId: number, name: string, color: string) => {
    const { m } = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM dm_notes_groups WHERE campaign_id = ?').get(campaignId) as { m: number }
    const result = db.prepare(`
      INSERT INTO dm_notes_groups (campaign_id, name, color, sort_order)
      VALUES (?, ?, ?, ?)
    `).run(campaignId, name, color, m + 1)
    return db.prepare('SELECT * FROM dm_notes_groups WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('dm-notes:update-group', (_e, id: number, data: any) => {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE dm_notes_groups SET ${fields} WHERE id = @id`).run({ ...data, id })
    return db.prepare('SELECT * FROM dm_notes_groups WHERE id = ?').get(id)
  })

  ipcMain.handle('dm-notes:delete-group', (_e, id: number) => {
    const grp = db.prepare('SELECT is_system FROM dm_notes_groups WHERE id = ?').get(id) as any
    if (grp?.is_system) return
    db.prepare('UPDATE dm_notes_pages SET group_id = NULL WHERE group_id = ?').run(id)
    db.prepare('DELETE FROM dm_notes_groups WHERE id = ?').run(id)
  })

  ipcMain.handle('dm-notes:reorder-groups', (_e, orders: { id: number; sort_order: number }[]) => {
    const stmt = db.prepare('UPDATE dm_notes_groups SET sort_order = @sort_order WHERE id = @id')
    const transaction = db.transaction((list: any[]) => {
      for (const o of list) stmt.run(o)
    })
    transaction(orders)
  })

  // Ensures the "Session Notes" system group exists and every non-draft session has a page in it.
  ipcMain.handle('dm-notes:sync-session-notes', (_e, campaignId: number) => {
    return db.transaction(() => {
      let group = db.prepare(
        'SELECT * FROM dm_notes_groups WHERE campaign_id = ? AND is_system = 1'
      ).get(campaignId) as any
      if (!group) {
        const { m } = db.prepare(
          'SELECT COALESCE(MAX(sort_order), -1) as m FROM dm_notes_groups WHERE campaign_id = ?'
        ).get(campaignId) as { m: number }
        const r = db.prepare(`
          INSERT INTO dm_notes_groups (campaign_id, name, color, sort_order, is_system)
          VALUES (?, 'Session Notes', '#5b9fe8', ?, 1)
        `).run(campaignId, m + 1)
        group = db.prepare('SELECT * FROM dm_notes_groups WHERE id = ?').get(r.lastInsertRowid)
      }

      const sessions = db.prepare(
        'SELECT * FROM sessions WHERE campaign_id = ? AND is_draft = 0 ORDER BY session_number ASC, session_sub ASC'
      ).all(campaignId) as any[]

      const existingSessionIds = new Set(
        (db.prepare('SELECT session_id FROM dm_notes_pages WHERE group_id = ? AND session_id IS NOT NULL').all(group.id) as any[])
          .map((p: any) => p.session_id)
      )

      const newPages: any[] = []
      for (const session of sessions) {
        if (existingSessionIds.has(session.id)) continue
        const title = session.session_sub
          ? `Session ${session.session_number}${session.session_sub}`
          : `Session ${session.session_number}`
        const { m } = db.prepare(
          'SELECT COALESCE(MAX(sort_order), -1) as m FROM dm_notes_pages WHERE group_id = ?'
        ).get(group.id) as { m: number }
        const r = db.prepare(`
          INSERT INTO dm_notes_pages (campaign_id, title, content, group_id, sort_order, session_id)
          VALUES (?, ?, '{"type":"doc","content":[]}', ?, ?, ?)
        `).run(campaignId, title, group.id, m + 1, session.id)
        newPages.push(db.prepare('SELECT * FROM dm_notes_pages WHERE id = ?').get(r.lastInsertRowid))
      }

      return { group, newPages }
    })()
  })
}
