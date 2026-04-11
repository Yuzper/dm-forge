// path: src/components/LootTableEditor.tsx
import { useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { LootItem, LootTable } from '../types'

interface Props {
  value: LootTable
  onChange: (table: LootTable) => void
  defaultName?: string
}

function newItem(chance: number): LootItem {
  return {
    id: Math.random().toString(36).slice(2),
    name: '',
    description: '',
    quantity: '1',
    chance,
  }
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      marginBottom: 8,
    }}>
      <span style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {label}
      </span>
      {count > 0 && (
        <span style={{
          fontSize: 10, color: 'var(--text-muted)',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
          borderRadius: 99, padding: '0px 6px',
        }}>
          {count}
        </span>
      )}
    </div>
  )
}

function ItemRow({
  item, onChange, onRemove, showChance,
}: {
  item: LootItem
  onChange: (item: LootItem) => void
  onRemove: () => void
  showChance: boolean
}) {
  const set = <K extends keyof LootItem>(key: K, val: LootItem[K]) =>
    onChange({ ...item, [key]: val })

  return (
    <div style={{
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius-sm)',
      padding: '10px 12px',
      marginBottom: 8,
      background: 'var(--bg-elevated)',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      {/* Row 1: name + quantity + chance + remove */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          className="input"
          style={{ flex: 1, height: 28, fontSize: 12 }}
          placeholder="Item name…"
          value={item.name}
          onChange={e => set('name', e.target.value)}
        />
        <input
          className="input"
          style={{ width: 72, height: 28, fontSize: 12, textAlign: 'center' }}
          placeholder="qty"
          title="Quantity"
          value={item.quantity}
          onChange={e => set('quantity', e.target.value)}
        />
        {showChance && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <input
              className="input"
              type="number"
              min={1}
              max={99}
              style={{ width: 52, height: 28, fontSize: 12, textAlign: 'center' }}
              title="Drop chance %"
              value={item.chance}
              onChange={e => set('chance', Math.min(99, Math.max(1, parseInt(e.target.value) || 1)))}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>%</span>
          </div>
        )}
        <button
          onClick={onRemove}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', padding: 4,
            display: 'flex', alignItems: 'center', flexShrink: 0,
            transition: 'color 120ms ease',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#e05555'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
        >
          <Trash2 size={12} />
        </button>
      </div>
      {!showChance && (
        <button
            onClick={() => onChange({ ...item, chance: 50 })}
            title="Make random"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, fontSize: 10, flexShrink: 0 }}
        >~
        </button>
      )}
      {/* Row 2: description */}
      <input
        className="input"
        style={{ height: 26, fontSize: 11 }}
        placeholder="Description (optional)…"
        value={item.description}
        onChange={e => set('description', e.target.value)}
      />
    </div>
  )
}

export default function LootTableEditor({ value, onChange, defaultName }: Props) {
  const guaranteed = value.items.filter(i => i.chance === 100)
  const random = value.items.filter(i => i.chance < 100)

  const updateItem = useCallback((id: string, updated: LootItem) => {
    onChange({ ...value, items: value.items.map(i => i.id === id ? updated : i) })
  }, [value, onChange])

  const removeItem = useCallback((id: string) => {
    onChange({ ...value, items: value.items.filter(i => i.id !== id) })
  }, [value, onChange])

  const addGuaranteed = () => onChange({ ...value, items: [...value.items, newItem(100)] })
  const addRandom = () => onChange({ ...value, items: [...value.items, newItem(50)] })

  return (
    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13 }}>

      {/* Table name */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Table name</div>
        <input
          className="input"
          style={{ height: 32, fontSize: 13 }}
          placeholder={defaultName ?? 'Loot'}
          value={value.name}
          onChange={e => onChange({ ...value, name: e.target.value })}
        />
      </div>

      {/* Guaranteed section */}
      <SectionHeader label="Guaranteed" count={guaranteed.length} />
      <div style={{ marginBottom: 14 }}>
        {guaranteed.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            onChange={updated => updateItem(item.id, updated)}
            onRemove={() => removeItem(item.id)}
            showChance={false}
          />
        ))}
        <button
          onClick={addGuaranteed}
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 11, color: 'var(--text-muted)', width: '100%', justifyContent: 'center' }}
        >
          <Plus size={11} /> Add guaranteed item
        </button>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border-light)', margin: '12px 0' }} />

      {/* Random section */}
      <SectionHeader label="Random" count={random.length} />
      {random.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          Each item rolls independently against its drop chance.
        </div>
      )}
      <div style={{ marginBottom: 14 }}>
        {random.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            onChange={updated => updateItem(item.id, updated)}
            onRemove={() => removeItem(item.id)}
            showChance={true}
          />
        ))}
        <button
          onClick={addRandom}
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 11, color: 'var(--text-muted)', width: '100%', justifyContent: 'center' }}
        >
          <Plus size={11} /> Add random item
        </button>
      </div>
    </div>
  )
}
