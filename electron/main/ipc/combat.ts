// path: electron/main/ipc/combat.ts
import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { db } from '../db'

export function registerCombatIPC() {

  ipcMain.handle('combat:get-encounter', (_e, poiId: number) => {
    let enc = db.prepare('SELECT * FROM combat_encounters WHERE poi_id = ?').get(poiId)
    if (!enc) {
      const result = db.prepare('INSERT INTO combat_encounters (poi_id) VALUES (?)').run(poiId)
      enc = db.prepare('SELECT * FROM combat_encounters WHERE id = ?').get(result.lastInsertRowid)
    }
    return enc
  })

  ipcMain.handle('combat:get-creatures', (_e, encounterId: number) => {
    const rows = db.prepare(`
      SELECT cc.*, a.title, a.statblock, a.loot_table, a.loot_table_id, a.article_type
      FROM combat_creatures cc
      JOIN articles a ON a.id = cc.article_id
      WHERE cc.encounter_id = ?
      ORDER BY
        CASE WHEN cc.initiative IS NULL THEN 1 ELSE 0 END,
        cc.initiative DESC,
        cc.instance_number ASC
    `).all(encounterId) as any[]
    return rows.map(r => ({
      ...r,
      is_dead: r.is_dead === 1,
      // Variant statblock takes priority over article statblock
      statblock:     r.variant_statblock     ?? r.statblock,
      // Variant loot takes priority over article loot
      loot_table_id: r.variant_loot_table_id ?? r.loot_table_id,
      loot_table:    r.variant_loot_table    ?? r.loot_table,
      // Display name: variant name if set, otherwise article title
      display_name:  r.variant_name          ?? r.title,
    }))
  })

  ipcMain.handle('combat:add-creature', (_e, encounterId: number, articleId: number, maxHp: number, variantData?: {
    variant_name: string | null
    variant_statblock: string | null
    variant_loot_table_id: number | null
    variant_loot_table: string | null
    cr: string | null
  }) => {
    // Instance number scoped to article + variant so two different variants
    // of the same creature don't share instance numbering
    const variantName = variantData?.variant_name ?? null
    const { cnt } = db.prepare(`
      SELECT COUNT(*) as cnt FROM combat_creatures
      WHERE encounter_id = ? AND article_id = ?
      AND (variant_name IS ? OR (variant_name IS NULL AND ? IS NULL))
    `).get(encounterId, articleId, variantName, variantName) as { cnt: number }
    const instanceNumber = cnt + 1

    const result = db.prepare(`
      INSERT INTO combat_creatures
        (encounter_id, article_id, instance_number, max_hp, current_hp,
         variant_name, variant_statblock, variant_loot_table_id, variant_loot_table, cr)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      encounterId, articleId, instanceNumber, maxHp, maxHp,
      variantName,
      variantData?.variant_statblock     ?? null,
      variantData?.variant_loot_table_id ?? null,
      variantData?.variant_loot_table    ?? null,
      variantData?.cr                    ?? null,
    )

    const row = db.prepare(`
      SELECT cc.*, a.title, a.statblock, a.loot_table, a.loot_table_id, a.article_type
      FROM combat_creatures cc
      JOIN articles a ON a.id = cc.article_id
      WHERE cc.id = ?
    `).get(result.lastInsertRowid) as any

    return {
      ...row,
      is_dead:       row.is_dead === 1,
      statblock:     row.variant_statblock     ?? row.statblock,
      loot_table_id: row.variant_loot_table_id ?? row.loot_table_id,
      loot_table:    row.variant_loot_table     ?? row.loot_table,
      display_name:  row.variant_name           ?? row.title,
    }
  })

  ipcMain.handle('combat:delete-creature', (_e, creatureId: number) => {
    db.prepare('DELETE FROM combat_creatures WHERE id = ?').run(creatureId)
  })

  ipcMain.handle('combat:save-creatures', (_e, creatures: any[]) => {
    const stmt = db.prepare(`
      UPDATE combat_creatures
      SET current_hp = @current_hp, ac_override = @ac_override,
          is_dead = @is_dead, initiative = @initiative,
          resources = @resources
      WHERE id = @id
    `)
    const transaction = db.transaction((list: any[]) => {
      for (const c of list) stmt.run({ ...c, is_dead: c.is_dead ? 1 : 0 })
    })
    transaction(creatures)
  })

  ipcMain.handle('combat:save-loot-result', (_e, creatureId: number, lootResult: any[]) => {
    db.prepare('UPDATE combat_creatures SET loot_result = ? WHERE id = ?')
      .run(JSON.stringify(lootResult), creatureId)
  })

  ipcMain.handle('combat:get-loot-results', (_e, encounterId: number) => {
    return db.prepare(
      'SELECT id, loot_result FROM combat_creatures WHERE encounter_id = ?'
    ).all(encounterId)
  })

  // ── Stat Block Window ─────────────────────────────────────────────────────────

  ipcMain.handle('statblock:open-window', async (_e, articleId: number, overrides?: { statblock?: string; name?: string }) => {
    const existing = BrowserWindow.getAllWindows().find(w => {
      try {
        const url = w.webContents.getURL()
        const matchesArticle = url.includes(`articleId=${articleId}`) && url.includes('mode=statblock')
        if (!matchesArticle) return false
        // If a variant name override is present, require it to match too
        if (overrides?.name) {
          return url.includes(`nameOverride=${encodeURIComponent(overrides.name)}`)
        }
        // No variant name — match any window for this article that also has no nameOverride
        return !url.includes('nameOverride=')
      } catch { return false }
    })
    if (existing) { existing.focus(); return }

    const win = new BrowserWindow({
      width: 420, height: 650, minWidth: 360, minHeight: 400,
      title: overrides?.name ?? 'Stat Block', alwaysOnTop: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true, nodeIntegration: false, webSecurity: false,
      },
    })

    // Build query string — encode overrides as URL params
    const query: Record<string, string> = { mode: 'statblock', articleId: String(articleId) }
    if (overrides?.statblock) query.statblockOverride = encodeURIComponent(overrides.statblock)
    if (overrides?.name)      query.nameOverride      = encodeURIComponent(overrides.name)
    const qs = Object.entries(query).map(([k, v]) => `${k}=${v}`).join('&')

    if (process.env.ELECTRON_RENDERER_URL) {
      win.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${qs}`)
    } else {
      win.loadFile(path.join(__dirname, '../renderer/index.html'), {
        query: { mode: 'statblock', articleId: String(articleId), ...query },
      })
    }
  })
}
