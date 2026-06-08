// path: src/utils/creatureVariants.ts
// Shared parsing of a creature article's stat block into combat-ready variants.
// Creature articles store their stat block as a JSON array of variants
// ({ id, name, cr, statblock, … }); legacy articles store a single stat block.
// Both CombatPanel's picker and the encounter balancer rely on this so they
// agree on names, CR, and which creatures are "unaccounted" (no usable CR).

import type { Article } from '../types'

export interface CreatureVariant {
  id: string | null
  name: string
  cr: string              // '' when unknown (legacy single stat blocks)
  statblockRaw: string    // JSON string of the variant's StatBlock
  loot_table_id: number | null
  loot_table: string | null
  index: number | null    // null for a legacy single stat block
}

/** Parse a creature article into its variants (always returns ≥1 entry). */
export function parseCreatureVariants(article: Pick<Article, 'title' | 'statblock'>): CreatureVariant[] {
  let variants: any[] = []
  try {
    const parsed = JSON.parse(article.statblock)
    if (Array.isArray(parsed) && parsed.length > 0 && 'name' in parsed[0]) {
      variants = parsed
    }
  } catch { /* not a variant array */ }

  if (variants.length === 0) {
    // Legacy single stat block — no CR available, so it's "unaccounted".
    return [{
      id: null, name: article.title, cr: '',
      statblockRaw: article.statblock || '', loot_table_id: null, loot_table: null, index: null,
    }]
  }

  return variants.map((v, i) => ({
    id: v.id ?? null,
    name: v.name || article.title,
    cr: v.cr ?? '',
    statblockRaw: typeof v.statblock === 'string' ? v.statblock : JSON.stringify(v.statblock),
    loot_table_id: v.loot_table_id ?? null,
    loot_table: v.loot_table ?? null,
    index: i,
  }))
}
