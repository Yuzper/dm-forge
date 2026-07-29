// path: electron/main/defaults.ts
import path from 'path'
import fs from 'fs'
import log from 'electron-log'
import { db } from './db'

// ── Bundled starter sounds ──────────────────────────────────────────────────────
// Audio shipped under src/data/soundboard/{ambient,music,effects} seeds the
// central sound library on launch (see seedSoundLibrary below) — one row per file,
// referenced as `default:<folder>/<file>` so it resolves against the app dir
// instead of userData. Name derived from filename.

const DEFAULT_SOUND_EXTS = new Set(['.mp3', '.ogg', '.wav', '.flac', '.m4a', '.aac', '.webm'])
const DEFAULT_SOUND_FOLDERS: { folder: string; category: string }[] = [
  { folder: 'ambient', category: 'ambience' },
  { folder: 'music',   category: 'music' },
  { folder: 'effects', category: 'effect' },
]

export function defaultSoundboardDir(): string | null {
  const candidates = [
    path.join(__dirname, '../../src/data/soundboard'),     // dev (__dirname = out/main)
    path.join(__dirname, '../renderer/soundboard'),        // packaged renderer copy, if present
    path.join(process.resourcesPath ?? '', 'soundboard'),  // prod (extraResources)
  ]
  return candidates.find(p => fs.existsSync(p)) ?? null
}

function defaultCreaturesDir(): string | null {
  const candidates = [
    path.join(__dirname, '../../src/data/creatures'),      // dev
    path.join(process.resourcesPath ?? '', 'creatures'),   // prod (extraResources)
  ]
  return candidates.find(p => fs.existsSync(p)) ?? null
}

/** Copy bundled creature images into userData/images/.
 *  Uses per-file mtime comparison so new or updated images are always picked up
 *  without needing a manual version bump. */
export function syncCreatureImages(imagesPath: string) {
  const src = defaultCreaturesDir()
  if (!src) return
  for (const file of fs.readdirSync(src)) {
    if (file === 'version') continue
    const srcFile = path.join(src, file)
    const destFile = path.join(imagesPath, `creature_${file}`)
    try {
      const srcMtime = fs.statSync(srcFile).mtimeMs
      const destMtime = fs.existsSync(destFile) ? fs.statSync(destFile).mtimeMs : 0
      if (srcMtime > destMtime) fs.copyFileSync(srcFile, destFile)
    } catch {}
  }
}

/** Returns a map of lowercased-hyphenated name → relative image path for all bundled creature images. */
export function buildCreatureImageMap(imagesPath: string): Record<string, string> {
  const map: Record<string, string> = {}
  try {
    for (const file of fs.readdirSync(imagesPath)) {
      if (!file.startsWith('creature_')) continue
      const name = path.basename(file, path.extname(file)).replace(/^creature_/, '').toLowerCase()
      map[name] = `images/${file}`
    }
  } catch {}
  return map
}

export function deriveSoundName(filename: string): string {
  const ext  = path.extname(filename)
  return filename
    .slice(0, filename.length - ext.length)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase())
}

export function scanDefaultSounds(): { category: string; name: string; url: string; ref: string }[] {
  const baseDir = defaultSoundboardDir()
  if (!baseDir) return []
  const out: { category: string; name: string; url: string; ref: string }[] = []
  for (const { folder, category } of DEFAULT_SOUND_FOLDERS) {
    const dir = path.join(baseDir, folder)
    if (!fs.existsSync(dir)) continue
    let entries: string[] = []
    try { entries = fs.readdirSync(dir) } catch { continue }
    for (const entry of entries.sort((a, b) => a.localeCompare(b))) {
      if (!DEFAULT_SOUND_EXTS.has(path.extname(entry).toLowerCase())) continue
      out.push({
        category,
        name: deriveSoundName(entry),
        url: `file://${path.join(dir, entry)}`,
        ref: `default:${folder}/${entry}`,   // stable reference for "Add to board"
      })
    }
  }
  return out
}

/** Offer every bundled sound to the central library, once per ref.
 *  A ref that was seeded before is skipped, so a starter sound the user deleted
 *  stays deleted while a newly shipped one appears on the next launch. */
export function seedSoundLibrary() {
  const bundled = scanDefaultSounds()
  if (bundled.length === 0) return
  try {
    const seeded = new Set(
      (db.prepare('SELECT ref FROM sound_library_seeded').all() as { ref: string }[]).map(r => r.ref)
    )
    const fresh = bundled.filter(s => !seeded.has(s.ref))
    if (fresh.length === 0) return

    const { m } = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM sound_library').get() as { m: number }
    const insert = db.prepare(`
      INSERT INTO sound_library (name, category, file_path, loop, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `)
    const mark = db.prepare('INSERT OR IGNORE INTO sound_library_seeded (ref) VALUES (?)')
    let order = m + 1
    db.transaction(() => {
      for (const s of fresh) {
        insert.run(s.name, s.category, s.ref, s.category === 'effect' ? 0 : 1, order++)
        mark.run(s.ref)
      }
    })()
    log.info(`Sound library: seeded ${fresh.length} bundled sound(s)`)
  } catch (e) {
    log.warn('Sound library seeding failed:', e)
  }
}

export function loadDefaultLootTables(): any[] {
  try {
    const candidates = [
      path.join(__dirname, '../../src/data/loot_tables_default.json'),
      path.join(__dirname, '../renderer/loot_tables_default.json'),
      path.join(process.resourcesPath ?? '', 'loot_tables_default.json'),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'))
    }
    log.warn('loot_tables_default.json not found in any candidate path')
    return []
  } catch (e) {
    log.error('Failed to load default loot tables:', e)
    return []
  }
}

export function seedDefaultTables(campaignId: number): any[] {
  const defaults = loadDefaultLootTables()
  if (defaults.length === 0) return []

  const insert = db.prepare(`
    INSERT INTO loot_tables (campaign_id, name, description, category, items, is_default)
    VALUES (@campaign_id, @name, @description, @category, @items, 1)
  `)

  const results: any[] = []
  const tx = db.transaction(() => {
    for (const t of defaults) {
      const result = insert.run({
        campaign_id: campaignId,
        name: t.name,
        description: t.description ?? '',
        category: t.category ?? 'custom',
        items: JSON.stringify(
          (t.items ?? []).map((item: any, idx: number) => ({
            id: `default_${Date.now()}_${idx}`,
            name: item.name,
            description: item.description ?? '',
            quantity: item.quantity ?? '1',
            chance: item.chance ?? 100,
            price: item.price ?? '',
            weight: item.weight ?? '',
          }))
        ),
      })
      results.push(db.prepare('SELECT * FROM loot_tables WHERE id = ?').get(result.lastInsertRowid))
    }
  })
  tx()
  return results.map(r => ({ ...r, is_default: r.is_default === 1 }))
}
