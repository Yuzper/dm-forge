// path: src/components/LootTableEditor.tsx
import { useState, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { LootItem, LootTable } from '../types'
import { chanceColor } from './LootTableView'

interface Props {
  value: LootTable
  onChange: (table: LootTable) => void
  suggestions?: string[]
}

function newItem(): LootItem {
  return {
    id: Math.random().toString(36).slice(2),
    name: '',
    description: '',
    quantity: '1',
    chance: 100,
  }
}

function ItemRow({
  item, onChange, onRemove, suggestions,
}: {
  item: LootItem
  onChange: (item: LootItem) => void
  onRemove: () => void
  suggestions?: string[]
}) {
  const set = <K extends keyof LootItem>(key: K, val: LootItem[K]) =>
    onChange({ ...item, [key]: val })

  const [showSuggestions, setShowSuggestions] = useState(false)
  const filtered = (suggestions ?? []).filter(s =>
    item.name.length >= 2 && s.toLowerCase().includes(item.name.toLowerCase())
  )

  const color = chanceColor(item.chance)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '8px 10px 8px 0',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius-sm)',
      borderLeft: `3px solid ${color}`,
    }}>
      {/* Main row */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingLeft: 10 }}>

        {/* Name */}
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            className="input"
            style={{ width: '100%', height: 28, fontSize: 12 }}
            placeholder="Item name…"
            value={item.name}
            onChange={e => { set('name', e.target.value); setShowSuggestions(true) }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          />
          {showSuggestions && filtered.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
              background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)',
              maxHeight: 160, overflowY: 'auto', marginTop: 2,
            }}>
              {filtered.slice(0, 6).map(s => (
                <button
                  key={s}
                  onMouseDown={() => { set('name', s); setShowSuggestions(false) }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '6px 10px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 12, color: 'var(--text-secondary)',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Qty */}
        <input
          className="input"
          style={{ width: 52, height: 28, fontSize: 12, textAlign: 'center', flexShrink: 0 }}
          placeholder="qty"
          title="Quantity (e.g. 1, 1d4, 2d6)"
          value={item.quantity}
          onChange={e => set('quantity', e.target.value)}
        />

        {/* Chance */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          <input
            className="input"
            type="number"
            min={1}
            max={100}
            style={{ width: 52, height: 28, fontSize: 12, textAlign: 'center' }}
            title="Drop chance %"
            value={item.chance}
            onChange={e => set('chance', Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
          />
          <span style={{ fontSize: 11, color, fontWeight: 500, flexShrink: 0 }}>%</span>
        </div>

        {/* Delete */}
        <button
          onClick={onRemove}
          title="Remove item"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', padding: 4, flexShrink: 0,
            display: 'flex', alignItems: 'center',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#e05555'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Description */}
      <div style={{ paddingLeft: 10, paddingRight: 30 }}>
        <input
          className="input"
          style={{ height: 24, fontSize: 11, width: '100%' }}
          placeholder="Description (optional)…"
          value={item.description}
          onChange={e => set('description', e.target.value)}
        />
      </div>
    </div>
  )
}

export default function LootTableEditor({ value, onChange, suggestions }: Props) {
  const updateItem = useCallback((id: string, updated: LootItem) => {
    onChange({ ...value, items: value.items.map(i => i.id === id ? updated : i) })
  }, [value, onChange])

  const removeItem = useCallback((id: string) => {
    onChange({ ...value, items: value.items.filter(i => i.id !== id) })
  }, [value, onChange])

  const addItem = () => onChange({ ...value, items: [...value.items, newItem()] })

  return (
    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13 }}>

      {/* Column headers */}
      {value.items.length > 0 && (
        <div style={{
          display: 'flex', gap: 6, alignItems: 'center',
          padding: '0 4px 4px 16px',
        }}>
          <span style={{ flex: 1, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Item
          </span>
          <span style={{ width: 52, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'center', flexShrink: 0 }}>
            Qty
          </span>
          <span style={{ width: 72, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'center', flexShrink: 0 }}>
            Chance
          </span>
          <span style={{ width: 20, flexShrink: 0 }} />
        </div>
      )}

      {/* Item list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
        {value.items.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            onChange={updated => updateItem(item.id, updated)}
            onRemove={() => removeItem(item.id)}
            suggestions={suggestions}
          />
        ))}
      </div>

      {/* Add item */}
      <button
        onClick={addItem}
        style={{
          fontSize: 11, color: 'var(--text-muted)', width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          background: 'transparent', cursor: 'pointer',
          border: '1px dashed var(--border-light)',
          borderRadius: 'var(--radius-sm)',
          padding: '7px 0',
          transition: 'border-color 150ms ease, color 150ms ease',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.borderColor = '#49c185'
          ;(e.currentTarget as HTMLElement).style.color = '#49c185'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)'
          ;(e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
        }}
      >
        <Plus size={11} /> Add item
      </button>
    </div>
  )
}