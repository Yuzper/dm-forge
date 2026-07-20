// path: src/components/LootTableView.tsx
import { useState, useRef } from 'react'
import type { LootItem } from '../types'
import { parseItemStatBlock } from '../types'
import { ItemCard, type ItemCardData } from './ItemCard'
import { useStore } from '../store/store'
import { richTextToPlain } from '../utils/richText'
import { chanceColor } from '../constants/loot'

interface SectionProps {
  label: string
  items: LootItem[]
  tableBadge?: string
  onItemClick?: (name: string) => void
  wikiTitles?: string[]                     // only matching names get gold link style
  emptyMessage?: string
  style?: React.CSSProperties
}


// ── Single row ─────────────────────────────────────────────────────────────────

function LootRow({ item, onItemClick, wikiTitles }: { item: LootItem; onItemClick?: (name: string) => void; wikiTitles?: string[] }) {
  const color = chanceColor(item.chance)
  const isWikiLink = !!wikiTitles && wikiTitles.some(t => t.toLowerCase() === item.name.toLowerCase())

  const [hoveredItem, setHoveredItem] = useState<(ItemCardData & { x: number; y: number }) | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancelClose = () => clearTimeout(hoverTimer.current)
  const scheduleClose = () => { cancelClose(); hoverTimer.current = setTimeout(() => setHoveredItem(null), 150) }

  const onEnter = (e: React.MouseEvent) => {
    if (!isWikiLink || !item.name.trim()) return
    const { articles, currentCampaign } = useStore.getState()
    const summary = articles.find(a => a.title.toLowerCase() === item.name.toLowerCase() && ['item', 'artifact'].includes(a.article_type))
    if (!summary) return
    cancelClose()
    let tracks: Record<string, string> = {}
    try { tracks = JSON.parse(summary.tracks || '{}') } catch { /* ignore */ }
    let tags: string[] = []
    try { const t = JSON.parse(summary.tags || '[]'); if (Array.isArray(t)) tags = t.filter(Boolean) } catch { /* ignore */ }
    setHoveredItem({
      x: e.clientX, y: e.clientY,
      name: summary.title,
      rarity: tracks.Rarity || undefined,
      status: tracks.Status || undefined,
      location: tracks.Location || undefined,
      tags,
      coverImage: summary.cover_image ? `file://${summary.cover_image}` : null,
      desc: undefined,
    })
    if (currentCampaign) {
      window.api.getArticleByTitle(summary.title, currentCampaign.id).then(full => {
        if (!full) return
        const ib = parseItemStatBlock(full.item_block || '')
        const attunement = ib.requiresAttunement
          ? (ib.attunementNote.trim() ? `requires attunement ${ib.attunementNote.trim()}` : 'requires attunement')
          : undefined
        const desc = (ib.description.trim() || richTextToPlain(full.content)).slice(0, 320)
        const img = full.portrait_image
          ? `file://${full.portrait_image}`
          : full.cover_image ? `file://${full.cover_image}` : null
        setHoveredItem(prev => prev && prev.name === summary.title ? {
          ...prev,
          category: ib.category || prev.category,
          rarity: ib.rarity || prev.rarity,
          attunement,
          desc: desc || undefined,
          coverImage: img ?? prev.coverImage,
        } : prev)
      }).catch(() => { /* ignore */ })
    }
  }

  return (
    <>
      <div
        onMouseEnter={onEnter}
        onMouseLeave={scheduleClose}
        style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', gap: 10 }}
      >
        <span
          onClick={isWikiLink && onItemClick ? () => onItemClick(item.name) : undefined}
          style={{
            flex: 1, fontSize: 13,
            color: isWikiLink ? 'var(--gold)' : 'var(--text-primary)',
            cursor: isWikiLink ? 'pointer' : 'default',
            borderBottom: isWikiLink ? '1px solid var(--gold-dim)' : 'none',
            width: 'fit-content',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {item.name}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 32, textAlign: 'center', flexShrink: 0 }}>
          {item.quantity}
        </span>
        <span style={{ fontSize: 12, fontWeight: 500, color, width: 40, textAlign: 'right', flexShrink: 0 }}>
          {item.chance >= 100 ? '100%' : `${item.chance}%`}
        </span>
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

// ── Exported section card ──────────────────────────────────────────────────────

export default function LootTableView({
  label, items, tableBadge, onItemClick, wikiTitles, emptyMessage, style,
}: SectionProps) {
  const sorted = [...items].sort((a, b) => b.chance - a.chance)

  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius-sm)',
      overflow: 'hidden',
      ...style,
    }}>
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 14px',
        background: 'var(--bg-surface)',
        borderBottom: '0.5px solid var(--border-light)',
      }}>
        <span style={{
          fontSize: 12, fontWeight: 500,
          color: 'var(--text-secondary)',
          flex: 1,
        }}>
          {label}
        </span>

        <span style={{
          fontSize: 10, color: 'var(--text-muted)',
          background: 'var(--bg-surface)',
          padding: '1px 6px', borderRadius: 99,
          border: '1px solid var(--border-light)',
          flexShrink: 0,
        }}>
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>

        {tableBadge && (
          <span style={{
            fontSize: 10, color: '#49c185',
            background: 'rgba(73,193,133,0.1)',
            padding: '1px 7px', borderRadius: 99,
            border: '0.5px solid rgba(73,193,133,0.3)',
            flexShrink: 0,
          }}>
            {tableBadge}
          </span>
        )}
      </div>

      {/* Rows */}
      {sorted.length === 0 ? (
        <div style={{
          padding: '16px 14px', fontSize: 12,
          color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center',
        }}>
          {emptyMessage ?? 'No items'}
        </div>
      ) : (
        sorted.map((item, i) => (
          <div
            key={item.id}
            style={{
              borderBottom: i < sorted.length - 1 ? '0.5px solid var(--border-light)' : 'none',
            }}
          >
            <LootRow item={item} onItemClick={onItemClick} wikiTitles={wikiTitles} />
          </div>
        ))
      )}
    </div>
  )
}