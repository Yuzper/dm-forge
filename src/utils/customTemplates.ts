// path: src/utils/customTemplates.ts
// The DM's own saved looks, shown beside the built-in templates in Settings.
//
// A template is a whole Appearance (design, parchment, base, accent, text,
// fonts, section colours, text size ...) plus the backdrop, which is stored apart
// from it. Saved templates are app-wide and stay on this machine.
import { createPref } from './prefs'
import { normalizeAppearance } from '../constants/themes'
import type { Appearance } from '../constants/themes'

export interface CustomTemplate {
  id: string
  name: string
  appearance: Appearance
  bgStyle: string
}

export const MAX_TEMPLATES = 24
export const MAX_NAME = 24

interface Stored { items: CustomTemplate[] }

function clean(raw: Partial<Stored>): Stored {
  const list = Array.isArray(raw.items) ? raw.items : []
  const items: CustomTemplate[] = []
  for (const t of list) {
    if (!t || typeof t !== 'object') continue
    const name = typeof t.name === 'string' ? t.name.trim().slice(0, MAX_NAME) : ''
    if (!name || typeof t.id !== 'string') continue
    items.push({
      id: t.id,
      name,
      appearance: normalizeAppearance(t.appearance),
      bgStyle: typeof t.bgStyle === 'string' ? t.bgStyle : 'none',
    })
    if (items.length >= MAX_TEMPLATES) break
  }
  return { items }
}

export const customTemplates = createPref<Stored>('dmforge:custom-templates', clean)

/** Save the current look. A name already in use is replaced rather than duplicated. */
export function saveTemplate(name: string, appearance: Appearance, bgStyle: string): CustomTemplate | null {
  const trimmed = name.trim().slice(0, MAX_NAME)
  if (!trimmed) return null
  const items = customTemplates.get().items
  const existing = items.find(t => t.name.toLowerCase() === trimmed.toLowerCase())
  const tpl: CustomTemplate = {
    id: existing?.id ?? `tpl-${Date.now().toString(36)}`,
    name: trimmed,
    appearance: normalizeAppearance(appearance),
    bgStyle,
  }
  customTemplates.set({ items: existing ? items.map(t => (t.id === tpl.id ? tpl : t)) : [...items, tpl] })
  return tpl
}

export function deleteTemplate(id: string) {
  customTemplates.set({ items: customTemplates.get().items.filter(t => t.id !== id) })
}

/** Whether the live look is exactly this template (used to light its tile up). */
export function matchesTemplate(t: CustomTemplate, appearance: Appearance, bgStyle: string): boolean {
  return t.bgStyle === bgStyle && JSON.stringify(normalizeAppearance(appearance)) === JSON.stringify(t.appearance)
}
