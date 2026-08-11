// path: src/constants/sections.ts
// Single source of truth for the campaign-tool sections (Wiki, DM Notes, …):
// accent colour, label and icon per section. Everything that renders a section
// entry point — sidebar rail + breadcrumb, map-hub dock, campaign hub cards,
// global search headers, per-page accents — derives from this config.
//
// The colours are no longer constants: each base theme tunes its own set and the
// user can override any of the six. `SECTION_ACCENTS` is therefore a *live*
// record, resolved from storage at import time (so the first paint is already
// right) and updated in place by the store when the appearance changes. Read it
// during render, never capture it at module scope, or you'll pin a colour that
// the next theme switch can't reach.
import { BookOpen, Sparkles, ShoppingBag, Network, Clock, Music2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { loadAppearance, resolveSections } from './themes'

export type SectionView = 'wiki' | 'dm-notes' | 'loot-tables' | 'relations' | 'timeline' | 'soundboard'

export const SECTION_VIEWS: SectionView[] = [
  'wiki', 'dm-notes', 'loot-tables', 'relations', 'timeline', 'soundboard',
]

export const SECTION_LABELS: Record<SectionView, string> = {
  'wiki':        'Wiki',
  'dm-notes':    'DM Notes',
  'loot-tables': 'Loot Tables',
  'relations':   'Relations',
  'timeline':    'Timeline',
  'soundboard':  'Soundboard',
}

export const SECTION_ICONS: Record<SectionView, LucideIcon> = {
  'wiki':        BookOpen,
  'dm-notes':    Sparkles,
  'loot-tables': ShoppingBag,
  'relations':   Network,
  'timeline':    Clock,
  'soundboard':  Music2,
}

/** Mutated in place — see the note above about capturing. */
export const SECTION_ACCENTS: Record<SectionView, string> = resolveSections(loadAppearance())

export function applySectionAccents(next: Record<SectionView, string>): void {
  Object.assign(SECTION_ACCENTS, next)
}

export interface NavItem {
  view: SectionView
  label: string
  icon: LucideIcon
  accent: string
}

// `accent` is a getter so destructuring during render reads today's colour,
// while call sites keep the plain `item.accent` they already use.
export const NAV_ITEMS: NavItem[] = SECTION_VIEWS.map(view => ({
  view,
  label: SECTION_LABELS[view],
  icon: SECTION_ICONS[view],
  get accent() { return SECTION_ACCENTS[view] },
}))
