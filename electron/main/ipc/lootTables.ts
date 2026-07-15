// path: electron/main/ipc/lootTables.ts
import { ipcMain } from 'electron'
import { db } from '../db'
import { seedDefaultTables } from '../defaults'

export function registerLootTableIPC() {

  ipcMain.handle('loot-tables:get-all', (_e, campaignId: number) => {
    let tables = db.prepare(
      'SELECT * FROM loot_tables WHERE campaign_id = ? ORDER BY category ASC, name ASC'
    ).all(campaignId) as any[]

    if (tables.length === 0) {
      tables = seedDefaultTables(campaignId)
    }

    return tables.map(t => ({ ...t, is_default: t.is_default === 1 }))
  })

  ipcMain.handle('loot-tables:get', (_e, id: number) => {
    const t = db.prepare('SELECT * FROM loot_tables WHERE id = ?').get(id) as any
    if (!t) return null
    return { ...t, is_default: t.is_default === 1 }
  })

  ipcMain.handle('loot-tables:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO loot_tables (campaign_id, name, description, category, items, is_default)
      VALUES (@campaign_id, @name, @description, @category, @items, 0)
    `).run({
      description: '',
      category: 'custom',
      items: '[]',
      ...data,
    })
    const t = db.prepare('SELECT * FROM loot_tables WHERE id = ?').get(result.lastInsertRowid) as any
    return { ...t, is_default: t.is_default === 1 }
  })

  ipcMain.handle('loot-tables:update', (_e, id: number, data: any) => {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE loot_tables SET ${fields}, updated_at = datetime('now') WHERE id = @id`).run({ ...data, id })
    const t = db.prepare('SELECT * FROM loot_tables WHERE id = ?').get(id) as any
    return { ...t, is_default: t.is_default === 1 }
  })

  ipcMain.handle('loot-tables:delete', (_e, id: number) => {
    // Count before nulling — the previous order always reported 0.
    const { affected } = db.prepare('SELECT COUNT(*) as affected FROM articles WHERE loot_table_id = ?').get(id) as { affected: number }
    db.prepare('UPDATE articles SET loot_table_id = NULL WHERE loot_table_id = ?').run(id)
    db.prepare('UPDATE pois SET loot_table_id = NULL WHERE loot_table_id = ?').run(id)
    // Combat creatures cache a variant loot table id with no FK — null it so
    // rolls fall back to the embedded variant_loot_table JSON copy.
    db.prepare('UPDATE combat_creatures SET variant_loot_table_id = NULL WHERE variant_loot_table_id = ?').run(id)
    db.prepare('DELETE FROM loot_tables WHERE id = ?').run(id)
    return { success: true, affected }
  })

  ipcMain.handle('loot-tables:roll', (_e, tableId: number | null, extraItemsJson: string) => {
    let masterItems: any[] = []
    if (tableId) {
      const table = db.prepare('SELECT items FROM loot_tables WHERE id = ?').get(tableId) as { items: string } | undefined
      if (table) {
        try { masterItems = JSON.parse(table.items) } catch {}
      }
    }

    let extraItems: any[] = []
    try { extraItems = JSON.parse(extraItemsJson || '[]') } catch {}

    const allItems = [...masterItems, ...extraItems]

    const result = allItems.filter(item => {
      if (item.chance >= 100) return true
      return Math.random() * 100 <= item.chance
    })

    return result
  })

  ipcMain.handle('loot-tables:reset-defaults', (_e, campaignId: number) => {
    db.prepare('DELETE FROM loot_tables WHERE campaign_id = ? AND is_default = 1').run(campaignId)
    return seedDefaultTables(campaignId)
  })
}
