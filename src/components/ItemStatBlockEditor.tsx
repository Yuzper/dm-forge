// path: src/components/ItemStatBlockEditor.tsx
// Edit-mode form for a magic-item stat block: category + rarity + attunement
// header, a rules-text description, and named properties (like creature traits).

import { Plus, Trash2 } from 'lucide-react'
import type { ItemStatBlock, StatBlockEntry } from '../types'
import { ITEM_CATEGORIES, ITEM_RARITIES } from '../types'

function PropertyList({ entries, onChange }: {
  entries: StatBlockEntry[]
  onChange: (entries: StatBlockEntry[]) => void
}) {
  const add = () => onChange([...entries, { name: '', desc: '' }])
  const remove = (i: number) => onChange(entries.filter((_, idx) => idx !== i))
  const update = (i: number, field: keyof StatBlockEntry, val: string) =>
    onChange(entries.map((e, idx) => idx === i ? { ...e, [field]: val } : e))

  return (
    <div>
      {entries.map((entry, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              className="input"
              style={{ height: 28, fontSize: 12, flex: '0 0 180px' }}
              placeholder="Property name"
              value={entry.name}
              onChange={e => update(i, 'name', e.target.value)}
            />
            <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <Trash2 size={12} />
            </button>
          </div>
          <textarea
            className="input"
            style={{ fontSize: 12, minHeight: 56, resize: 'vertical' }}
            placeholder="Describe the property…"
            value={entry.desc}
            onChange={e => update(i, 'desc', e.target.value)}
          />
        </div>
      ))}
      <button onClick={add} className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        <Plus size={11} /> Add property
      </button>
    </div>
  )
}

export default function ItemStatBlockEditor({ value, onChange }: {
  value: ItemStatBlock
  onChange: (ib: ItemStatBlock) => void
}) {
  const set = <K extends keyof ItemStatBlock>(key: K, val: ItemStatBlock[K]) => onChange({ ...value, [key]: val })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="input-group">
          <label className="input-label">Type</label>
          <input
            className="input"
            list="item-categories"
            placeholder="Wondrous item, Weapon (any sword)…"
            value={value.category}
            onChange={e => set('category', e.target.value)}
          />
          <datalist id="item-categories">
            {ITEM_CATEGORIES.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div className="input-group">
          <label className="input-label">Rarity</label>
          <select className="input" value={value.rarity} onChange={e => set('rarity', e.target.value)}>
            <option value="">—</option>
            {ITEM_RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={value.requiresAttunement} onChange={e => set('requiresAttunement', e.target.checked)} />
          Requires attunement
        </label>
        {value.requiresAttunement && (
          <input
            className="input"
            style={{ flex: 1, minWidth: 180, fontSize: 12 }}
            placeholder="…by a spellcaster (optional qualifier)"
            value={value.attunementNote}
            onChange={e => set('attunementNote', e.target.value)}
          />
        )}
      </div>

      <div className="input-group">
        <label className="input-label">Rules text</label>
        <textarea
          className="input"
          style={{ minHeight: 120, resize: 'vertical', fontSize: 13, lineHeight: 1.5 }}
          placeholder="The item's mechanical description. Blank lines separate paragraphs."
          value={value.description}
          onChange={e => set('description', e.target.value)}
        />
      </div>

      <div>
        <label className="input-label" style={{ display: 'block', marginBottom: 8 }}>Named properties <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
        <PropertyList entries={value.properties} onChange={p => set('properties', p)} />
      </div>
    </div>
  )
}
