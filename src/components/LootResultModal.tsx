// path: src/components/LootResultModal.tsx
import { useState, useRef } from 'react'
import { X, Dices } from 'lucide-react'
import type { LootItem } from '../types'
import { parseItemStatBlock } from '../types'
import { ItemCard, type ItemCardData } from './ItemCard'
import { useStore } from '../store/store'
import { richTextToPlain } from '../utils/richText'
import { chanceColor } from '../constants/loot'

interface Props {
  creatureName: string
  items: LootItem[]
  onClose: () => void
  // If provided, shows a regenerate button (for POI loot, not combat loot)
  onRegenerate?: () => void
}

export default function LootResultModal({ creatureName, items, onClose, onRegenerate }: Props) {
  const isEmpty = items.length === 0

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 400,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-light)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
        maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 16,
              color: 'var(--gold)', letterSpacing: '0.03em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {creatureName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {isEmpty
                ? 'Nothing dropped'
                : `${items.length} item${items.length !== 1 ? 's' : ''} dropped`
              }
            </div>
          </div>
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              className="btn btn-sm btn-ghost"
              style={{ gap: 5, fontSize: 11 }}
              title="Roll again"
            >
              <Dices size={12} /> Reroll
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 4,
              display: 'flex', alignItems: 'center',
              transition: 'color 120ms ease',
            }}
            className="hover-text"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {isEmpty ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 10, padding: '32px 0', textAlign: 'center',
            }}>
              <span style={{ fontSize: 32, lineHeight: 1 }}>🎲</span>
              <div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>
                  Nothing dropped
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  The dice weren't in your favour.
                </div>
              </div>
              {onRegenerate && (
                <button onClick={onRegenerate} className="btn btn-sm" style={{ marginTop: 4, gap: 5 }}>
                  <Dices size={12} /> Try again
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {items.map(item => (
                <LootItemRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            onClick={onClose}
            className="btn"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function LootItemRow({ item }: { item: LootItem }) {
  const isAlways = item.chance >= 100
  const color = chanceColor(item.chance)

  const [hoveredItem, setHoveredItem] = useState<(ItemCardData & { x: number; y: number }) | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancelClose = () => clearTimeout(hoverTimer.current)
  const scheduleClose = () => { cancelClose(); hoverTimer.current = setTimeout(() => setHoveredItem(null), 150) }

  const onRowEnter = (e: React.MouseEvent) => {
    if (!item.name.trim()) return
    const { articles, currentCampaign } = useStore.getState()
    const summary = articles.find(a => a.title === item.name && ['item', 'artifact'].includes(a.article_type))
    if (!summary) return
    cancelClose()
    let tracks: Record<string, string> = {}
    try { tracks = JSON.parse(summary.tracks || '{}') } catch { /* ignore */ }
    let tags: string[] = []
    try { const t = JSON.parse(summary.tags || '[]'); if (Array.isArray(t)) tags = t.filter(Boolean) } catch { /* ignore */ }
    const cardData: ItemCardData & { x: number; y: number } = {
      x: e.clientX, y: e.clientY,
      name: summary.title,
      rarity: tracks.Rarity || undefined,
      status: tracks.Status || undefined,
      location: tracks.Location || undefined,
      tags,
      coverImage: summary.cover_image ? `file://${summary.cover_image}` : null,
      desc: undefined,
    }
    setHoveredItem(cardData)
    if (currentCampaign) {
      window.api.getArticleByTitle(item.name, currentCampaign.id).then(full => {
        if (!full) return
        const ib = parseItemStatBlock(full.item_block || '')
        const attunement = ib.requiresAttunement
          ? (ib.attunementNote.trim() ? `requires attunement ${ib.attunementNote.trim()}` : 'requires attunement')
          : undefined
        const desc = (ib.description.trim() || richTextToPlain(full.content)).slice(0, 320)
        const img = full.portrait_image
          ? `file://${full.portrait_image}`
          : full.cover_image ? `file://${full.cover_image}` : null
        setHoveredItem(prev => prev && prev.name === item.name ? {
          ...prev, category: ib.category || prev.category,
          rarity: ib.rarity || prev.rarity,
          attunement, desc: desc || undefined, coverImage: img ?? prev.coverImage,
        } : prev)
      }).catch(() => { /* ignore */ })
    }
  }

  return (
    <>
    <div
      onMouseEnter={onRowEnter}
      onMouseLeave={scheduleClose}
      style={{
      display: 'flex', alignItems: 'stretch', gap: 0,
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius-sm)',
      overflow: 'hidden',
    }}>
      {/* Left accent bar */}
      <div style={{
        width: 3, flexShrink: 0,
        background: color,
        transition: 'background 150ms ease',
      }} />

      {/* Main content */}
      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 500,
            color: 'var(--text-primary)',
            marginBottom: (item.description || item.price || item.weight) ? 2 : 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.name}
          </div>
          {item.description && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
              {item.description}
            </div>
          )}
          {(item.price || item.weight) && (
            <div style={{ display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
              {item.price && (
                <span style={{ fontSize: 11, color: 'var(--gold-dim)' }}>💰 {item.price}</span>
              )}
              {item.weight && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>⚖ {item.weight}</span>
              )}
            </div>
          )}
        </div>

        {/* Right: qty + chance badge */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
            ×{item.quantity}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
            padding: '1px 5px', borderRadius: 99,
            color,
            background: `${color}18`,
            border: `1px solid ${color}40`,
          }}>
            {isAlways ? 'ALWAYS' : `${item.chance}%`}
          </span>
        </div>
      </div>
    </div>
    {hoveredItem && (
      <ItemCard
        item={hoveredItem}
        x={hoveredItem.x}
        y={hoveredItem.y}
        onMouseEnter={cancelClose}
        onMouseLeave={() => setHoveredItem(null)}
      />
    )}
    </>
  )
}