// path: src/constants/sections.ts
// Single source of truth for the campaign-tool sections (Wiki, DM Notes, …):
// accent colour, label and icon per section. Everything that renders a section
// entry point — sidebar rail + breadcrumb, map-hub dock, campaign hub cards,
// global search headers, per-page accents — derives from this config.
import { BookOpen, Sparkles, ShoppingBag, Network, Clock, Music2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type SectionView = 'wiki' | 'dm-notes' | 'loot-tables' | 'relations' | 'timeline' | 'soundboard'

export const SECTION_ACCENTS: Record<SectionView, string> = {
  'wiki':        '#5b9fe8',
  'dm-notes':    '#fe6565',
  'loot-tables': '#49c185',
  'relations':   '#b07de8',
  'timeline':    '#e88c3a',
  'soundboard':  '#3b82f6',
}

export interface NavItem {
  view: SectionView
  label: string
  icon: LucideIcon
  accent: string
}

export const NAV_ITEMS: NavItem[] = [
  { view: 'wiki',        label: 'Wiki',        icon: BookOpen,    accent: SECTION_ACCENTS['wiki'] },
  { view: 'dm-notes',    label: 'DM Notes',    icon: Sparkles,    accent: SECTION_ACCENTS['dm-notes'] },
  { view: 'loot-tables', label: 'Loot Tables', icon: ShoppingBag, accent: SECTION_ACCENTS['loot-tables'] },
  { view: 'relations',   label: 'Relations',   icon: Network,     accent: SECTION_ACCENTS['relations'] },
  { view: 'timeline',    label: 'Timeline',    icon: Clock,       accent: SECTION_ACCENTS['timeline'] },
  { view: 'soundboard',  label: 'Soundboard',  icon: Music2,      accent: SECTION_ACCENTS['soundboard'] },
]
