// path: electron/main/ipc/players.ts
import { ipcMain } from 'electron'
import { db } from '../db'

// Shape drawing-layers are granted separately from POI visit-layers: the two
// live in different tables whose ids overlap, so one 'layer' type couldn't tell
// them apart.
const VALID_TYPES = new Set(['article', 'map', 'poi', 'shape', 'layer', 'shape_layer'])
const assertType = (t: string) => {
  if (!VALID_TYPES.has(t)) throw new Error(`Invalid visibility entity_type: ${t}`)
}

// Grants are polymorphic, so SQLite can't cascade them — whichever module owns
// an entity calls this when it deletes one. Article ids are AUTOINCREMENT and
// never reused, so a stale row is normally just litter; it stops being litter the
// moment a database is restored or merged with explicit ids.
export function purgeGrantsFor(entityType: string, entityId: number) {
  db.prepare('DELETE FROM visibility_grants WHERE entity_type = ? AND entity_id = ?')
    .run(entityType, entityId)
}

export function registerPlayerIPC() {
  // ── Players ─────────────────────────────────────────────────────────────────
  ipcMain.handle('players:get-all', (_e, campaignId: number) => {
    return db.prepare(
      'SELECT * FROM players WHERE campaign_id = ? ORDER BY display_name, username'
    ).all(campaignId)
  })

  ipcMain.handle('players:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO players (campaign_id, username, display_name, password, pc_article_id)
      VALUES (@campaign_id, @username, @display_name, @password, @pc_article_id)
    `).run({
      display_name: '',
      password: '',
      pc_article_id: null,
      ...data,
    })
    return db.prepare('SELECT * FROM players WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('players:update', (_e, id: number, data: any) => {
    const keys = Object.keys(data)
    if (keys.length) {
      const fields = keys.map(k => `${k} = @${k}`).join(', ')
      db.prepare(`UPDATE players SET ${fields} WHERE id = @id`).run({ ...data, id })
    }
    return db.prepare('SELECT * FROM players WHERE id = ?').get(id)
  })

  ipcMain.handle('players:delete', (_e, id: number) => {
    db.prepare('DELETE FROM players WHERE id = ?').run(id)
  })

  // ── Visibility grants (deny-by-default) ───────────────────────────────────────
  // A grant row = "this entity is visible to this grantee." player_id NULL = party.

  const insertGrant = (campaignId: number, entityType: string, entityId: number, grantee: number | null) => {
    // OR IGNORE leans on the two partial unique indexes (party / per-player).
    db.prepare(`
      INSERT OR IGNORE INTO visibility_grants (campaign_id, entity_type, entity_id, player_id)
      VALUES (?, ?, ?, ?)
    `).run(campaignId, entityType, entityId, grantee)
  }

  const deleteGrant = (entityType: string, entityId: number, grantee: number | null) => {
    if (grantee === null) {
      db.prepare(
        'DELETE FROM visibility_grants WHERE entity_type = ? AND entity_id = ? AND player_id IS NULL'
      ).run(entityType, entityId)
    } else {
      db.prepare(
        'DELETE FROM visibility_grants WHERE entity_type = ? AND entity_id = ? AND player_id = ?'
      ).run(entityType, entityId, grantee)
    }
  }

  ipcMain.handle('visibility:get-grants', (_e, campaignId: number) => {
    return db.prepare('SELECT * FROM visibility_grants WHERE campaign_id = ?').all(campaignId)
  })

  ipcMain.handle('visibility:get-for-entity', (_e, entityType: string, entityId: number) => {
    assertType(entityType)
    return db.prepare(
      'SELECT * FROM visibility_grants WHERE entity_type = ? AND entity_id = ?'
    ).all(entityType, entityId)
  })

  ipcMain.handle('visibility:grant', (_e, campaignId: number, entityType: string, entityId: number, grantee: number | null) => {
    assertType(entityType)
    insertGrant(campaignId, entityType, entityId, grantee ?? null)
  })

  ipcMain.handle('visibility:revoke', (_e, entityType: string, entityId: number, grantee: number | null) => {
    assertType(entityType)
    deleteGrant(entityType, entityId, grantee ?? null)
  })

  // Replace an entity's whole audience with the given grantee set, atomically —
  // this is what the audience control on an article/POI/shape calls.
  ipcMain.handle('visibility:set-audience', (_e, campaignId: number, entityType: string, entityId: number, grantees: (number | null)[]) => {
    assertType(entityType)
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM visibility_grants WHERE entity_type = ? AND entity_id = ?').run(entityType, entityId)
      const seen = new Set<string>()
      for (const g of grantees) {
        const key = g === null || g === undefined ? 'party' : String(g)
        if (seen.has(key)) continue
        seen.add(key)
        insertGrant(campaignId, entityType, entityId, g ?? null)
      }
    })
    tx()
  })
}
