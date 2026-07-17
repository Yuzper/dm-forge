// path: electron/main/ipc/clocks.ts
// Progress clocks (Blades in the Dark style): segmented countdown/progress
// dials that advance off-screen threats and faction plans. A clock belongs to
// a campaign and optionally attaches to an article (faction, quest, NPC, …);
// unattached clocks are campaign-level fronts.
import { ipcMain } from 'electron'
import { db } from '../db'

// Whitelisted updatable columns — client keys are never interpolated raw.
const UPDATABLE = new Set(['name', 'segments', 'filled', 'status', 'article_id'])

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function normalize(row: any) {
  if (!row) return null
  return { ...row }
}

export function registerClockIPC() {

  // All clocks for a campaign; active first, then closest to completion.
  ipcMain.handle('clocks:get-all', (_e, campaignId: number) => {
    return (db.prepare(`
      SELECT c.*, a.title AS article_title, a.article_type
      FROM clocks c LEFT JOIN articles a ON a.id = c.article_id
      WHERE c.campaign_id = ?
      ORDER BY c.status = 'active' DESC,
               CAST(c.filled AS REAL) / c.segments DESC,
               c.updated_at DESC
    `).all(campaignId) as any[]).map(normalize)
  })

  ipcMain.handle('clocks:get-for-article', (_e, articleId: number) => {
    return (db.prepare(`
      SELECT c.*, NULL AS article_title, NULL AS article_type
      FROM clocks c WHERE c.article_id = ?
      ORDER BY c.status = 'active' DESC, c.created_at ASC
    `).all(articleId) as any[]).map(normalize)
  })

  ipcMain.handle('clocks:create', (_e, data: {
    campaign_id: number; article_id?: number | null; name?: string; segments?: number
  }) => {
    const result = db.prepare(`
      INSERT INTO clocks (campaign_id, article_id, name, segments)
      VALUES (@campaign_id, @article_id, @name, @segments)
    `).run({
      article_id: null,
      name: 'New clock',
      segments: 6,
      ...data,
      ...(data.segments != null ? { segments: clamp(Math.round(data.segments), 2, 12) } : {}),
    })
    return normalize(db.prepare('SELECT * FROM clocks WHERE id = ?').get(result.lastInsertRowid))
  })

  ipcMain.handle('clocks:update', (_e, id: number, data: Record<string, any>) => {
    const entries = Object.entries(data).filter(([k]) => UPDATABLE.has(k))
    if (entries.length === 0) return normalize(db.prepare('SELECT * FROM clocks WHERE id = ?').get(id))

    const current = db.prepare('SELECT segments FROM clocks WHERE id = ?').get(id) as { segments: number } | undefined
    if (!current) return null

    const patch: Record<string, any> = Object.fromEntries(entries)
    if (patch.segments != null) patch.segments = clamp(Math.round(patch.segments), 2, 12)
    const segs = patch.segments ?? current.segments
    if (patch.filled != null) patch.filled = clamp(Math.round(patch.filled), 0, segs)
    // Shrinking a clock below its fill clamps the fill too.
    if (patch.segments != null && patch.filled == null) {
      const { filled } = db.prepare('SELECT filled FROM clocks WHERE id = ?').get(id) as { filled: number }
      if (filled > segs) patch.filled = segs
    }
    // Filling the last segment completes the clock; unticking reactivates it —
    // unless the caller sets status explicitly (e.g. pausing).
    if (patch.filled != null && patch.status == null) {
      patch.status = patch.filled >= segs ? 'completed' : 'active'
    }

    const fields = Object.keys(patch).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE clocks SET ${fields}, updated_at = datetime('now') WHERE id = @id`).run({ ...patch, id })
    return normalize(db.prepare('SELECT * FROM clocks WHERE id = ?').get(id))
  })

  ipcMain.handle('clocks:delete', (_e, id: number) => {
    db.prepare('DELETE FROM clocks WHERE id = ?').run(id)
    return { success: true }
  })
}
