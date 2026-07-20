// path: src/constants/soundCategories.ts
// Shared sound-category config so the soundboard page and the floating widget
// always show the same colour for the same category.
import type { SoundCategory } from '../types'

export const SOUND_CATEGORIES: { value: SoundCategory; label: string; color: string }[] = [
  { value: 'ambience', label: 'Ambience', color: '#3b82f6' },
  { value: 'music',    label: 'Music',    color: '#10b981' },
  { value: 'effect',   label: 'Effect',   color: '#f59e0b' },
]

export function soundCategoryColor(cat: SoundCategory): string {
  return SOUND_CATEGORIES.find(c => c.value === cat)?.color ?? '#8a8a8a'
}

export function soundCategoryLabel(cat: SoundCategory): string {
  return SOUND_CATEGORIES.find(c => c.value === cat)?.label ?? cat
}
