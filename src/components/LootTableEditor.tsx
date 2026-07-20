// path: src/components/LootTableEditor.tsx
import { useState, useCallback, useRef } from 'react'
import { Plus, Trash2, StickyNote } from 'lucide-react'
import type { LootItem, LootTable } from '../types'
import { parseItemStatBlock } from '../types'
import { chanceColor } from '../constants/loot'
import { ItemCard, type ItemCardData } from './ItemCard'
import { useStore } from '../store/store'
import { richTextToPlain } from '../utils/richText'

interface Props {
  value: LootTable
  onChange: (table: LootTable) => void
  suggestions?: string[]
  showPriceWeight?: boolean
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

const CURRENCIES = [
  { code: 'cp', label: 'cp' },
  { code: 'sp', label: 'sp' },
  { code: 'ep', label: 'ep' },
  { code: 'gp', label: 'gp' },
  { code: 'pp', label: 'pp' },
] as const
type CurrencyCode = 'cp' | 'sp' | 'ep' | 'gp' | 'pp'

function parsePrice(price: string | undefined): { amount: string; currency: CurrencyCode } {
  if (!price) return { amount: '', currency: 'gp' }
  const parts = price.trim().split(' ')
  const last = parts[parts.length - 1].toLowerCase()
  if (CURRENCIES.some(c => c.code === last)) {
    return { amount: parts.slice(0, -1).join(' '), currency: last as CurrencyCode }
  }
  return { amount: price, currency: 'gp' }
}

const Dot = ({ color }: { color: string }) => (
  <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
)
const Sep = () => <span style={{ color: 'var(--border-light)', userSelect: 'none' }}>·</span>

function ItemRow({
  item, onChange, onRemove, suggestions, showPriceWeight, onHoverItem, onLeaveItem,
}: {
  item: LootItem
  onChange: (item: LootItem) => void
  onRemove: () => void
  suggestions?: string[]
  showPriceWeight?: boolean
  onHoverItem?: (name: string, x: number, y: number) => void
  onLeaveItem?: () => void
}) {
  const set = <K extends keyof LootItem>(key: K, val: LootItem[K]) =>
    onChange({ ...item, [key]: val })

  const [showSuggestions, setShowSuggestions] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [descOpen, setDescOpen] = useState(false)

  const filtered = (suggestions ?? []).filter(s =>
    item.name.length >= 2 && s.toLowerCase().includes(item.name.toLowerCase())
  )
  const color    = chanceColor(item.chance)
  const showDesc = descOpen || !!item.description
  const { amount, currency } = parsePrice(item.price)

  return (
    <div
      onMouseEnter={e => { setHovered(true); onHoverItem?.(item.name, e.clientX, e.clientY) }}
      onMouseLeave={() => { setHovered(false); onLeaveItem?.() }}
      style={{
        position: 'relative',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: 'var(--radius)',
        overflow: 'visible',
        transition: 'border-color var(--transition)',
        borderColor: hovered ? 'var(--border)' : 'var(--border-light)',
      }}
    >
      <div style={{ padding: '8px 10px' }}>
        {/* Header: name + chance + delete */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
            <input
              className="ghost-input"
              style={{ width: '100%', fontSize: 14, fontWeight: 500 }}
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
                    className="hover-bg"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Chance editor */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <Dot color={color} />
            <input
              className="ghost-input"
              type="number"
              min={1}
              max={100}
              style={{ width: 46, textAlign: 'right', fontSize: 13, color, fontWeight: 600 }}
              title="Drop chance %"
              value={item.chance}
              onChange={e => set('chance', Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
            />
            <span style={{ fontSize: 12, color, fontWeight: 600 }}>%</span>
          </div>

          {/* Delete (revealed on hover) */}
          <button
            onClick={onRemove}
            title="Remove item"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 4, flexShrink: 0,
              display: 'flex', alignItems: 'center',
              opacity: hovered ? 1 : 0, transition: 'opacity var(--transition), color var(--transition)',
              '--hover-accent': 'var(--danger)',
            } as React.CSSProperties}
            className="hover-accent"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* Meta line: qty · price · weight */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, marginTop: 2,
          fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap',
        }}>
          <span style={{ paddingLeft: 6 }}>qty</span>
          <input
            className="ghost-input"
            style={{ width: 50, textAlign: 'center', fontSize: 12 }}
            title="Quantity (e.g. 1, 1d4, 2d6)"
            value={item.quantity}
            onChange={e => set('quantity', e.target.value)}
          />

          {showPriceWeight && (
            <>
              <Sep />
              <input
                className="ghost-input"
                style={{ width: 60, textAlign: 'right', fontSize: 12 }}
                placeholder="amount"
                title="Price amount"
                value={amount}
                onChange={e => set('price', `${e.target.value} ${currency}`.trim())}
              />
              <select
                className="ghost-input"
                style={{ width: 42, fontSize: 12, color: 'var(--text-secondary)' }}
                value={currency}
                onChange={e => set('price', `${amount} ${e.target.value as CurrencyCode}`.trim())}
              >
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <Sep />
              <input
                className="ghost-input"
                style={{ width: 64, textAlign: 'center', fontSize: 12 }}
                placeholder="weight"
                title="Weight (e.g. 2 lb)"
                value={item.weight ?? ''}
                onChange={e => set('weight', e.target.value)}
              />
            </>
          )}

          <div style={{ flex: 1 }} />

          {!showDesc && (
            <button
              onClick={() => setDescOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 11, padding: '2px 4px',
                opacity: hovered ? 1 : 0.5, transition: 'opacity var(--transition), color var(--transition)',
                '--hover-accent': 'var(--gold-dim)',
              } as React.CSSProperties}
              className="hover-accent"
              title="Add a description"
            >
              <StickyNote size={11} /> note
            </button>
          )}
        </div>

        {/* Description (only when present or explicitly opened) */}
        {showDesc && (
          <input
            className="ghost-input"
            style={{ width: '100%', marginTop: 2, fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}
            placeholder="Description…"
            autoFocus={descOpen && !item.description}
            value={item.description}
            onChange={e => set('description', e.target.value)}
            onBlur={() => { if (!item.description) setDescOpen(false) }}
          />
        )}
      </div>
    </div>
  )
}

export default function LootTableEditor({ value, onChange, suggestions, showPriceWeight }: Props) {
  const updateItem = useCallback((id: string, updated: LootItem) => {
    onChange({ ...value, items: value.items.map(i => i.id === id ? updated : i) })
  }, [value, onChange])

  const removeItem = useCallback((id: string) => {
    onChange({ ...value, items: value.items.filter(i => i.id !== id) })
  }, [value, onChange])

  const addItem = () => onChange({ ...value, items: [...value.items, newItem()] })

  // ── Item card hover ───────────────────────────────────────────────────────────
  const [hoveredItem, setHoveredItem] = useState<(ItemCardData & { x: number; y: number }) | null>(null)
  const itemHoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancelItemClose = () => clearTimeout(itemHoverTimer.current)
  const scheduleItemClose = () => { cancelItemClose(); itemHoverTimer.current = setTimeout(() => setHoveredItem(null), 150) }

  const showItemCard = useCallback((name: string, x: number, y: number) => {
    if (!name.trim()) return
    const { articles, currentCampaign } = useStore.getState()
    const summary = articles.find(a => a.title === name && ['item', 'artifact'].includes(a.article_type))
    if (!summary) return
    cancelItemClose()
    let tracks: Record<string, string> = {}
    try { tracks = JSON.parse(summary.tracks || '{}') } catch { /* ignore */ }
    let tags: string[] = []
    try { const t = JSON.parse(summary.tags || '[]'); if (Array.isArray(t)) tags = t.filter(Boolean) } catch { /* ignore */ }
    setHoveredItem({
      x, y,
      name: summary.title,
      rarity: tracks.Rarity || undefined,
      status: tracks.Status || undefined,
      location: tracks.Location || undefined,
      tags,
      coverImage: summary.cover_image ? `file://${summary.cover_image}` : null,
      desc: undefined,
    })
    if (currentCampaign) {
      window.api.getArticleByTitle(name, currentCampaign.id).then(full => {
        if (!full) return
        const ib = parseItemStatBlock(full.item_block || '')
        const attunement = ib.requiresAttunement
          ? (ib.attunementNote.trim() ? `requires attunement ${ib.attunementNote.trim()}` : 'requires attunement')
          : undefined
        const desc = (ib.description.trim() || richTextToPlain(full.content)).slice(0, 320)
        const img = full.portrait_image
          ? `file://${full.portrait_image}`
          : full.cover_image ? `file://${full.cover_image}` : null
        setHoveredItem(prev => prev && prev.name === name ? {
          ...prev,
          category: ib.category || prev.category,
          rarity: ib.rarity || prev.rarity,
          attunement,
          desc: desc || undefined,
          coverImage: img ?? prev.coverImage,
        } : prev)
      }).catch(() => { /* ignore */ })
    }
  }, [])

  return (
    <div style={{ fontFamily: 'var(--font-ui)' }}>
      {/* Item cards — fixed two-column grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 6, marginBottom: 8, alignItems: 'start',
      }}>
        {value.items.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            onChange={updated => updateItem(item.id, updated)}
            onRemove={() => removeItem(item.id)}
            suggestions={suggestions}
            showPriceWeight={showPriceWeight}
            onHoverItem={showItemCard}
            onLeaveItem={scheduleItemClose}
          />
        ))}
      </div>

      {/* Add item */}
      <button
        onClick={addItem}
        style={{
          fontSize: 12, color: 'var(--text-muted)', width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          background: 'transparent', cursor: 'pointer',
          border: '1px dashed var(--border-light)',
          borderRadius: 'var(--radius)',
          padding: '9px 0',
          transition: 'border-color 150ms ease, color 150ms ease',
          '--hover-accent': 'var(--success)',
        } as React.CSSProperties}
        className="hover-accent-border"
      >
        <Plus size={13} /> Add item
      </button>

      {hoveredItem && (
        <ItemCard
          item={hoveredItem}
          x={hoveredItem.x}
          y={hoveredItem.y}
          onMouseEnter={cancelItemClose}
          onMouseLeave={() => setHoveredItem(null)}
        />
      )}
    </div>
  )
}
