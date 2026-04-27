// path: src/components/LootTableView.tsx
import type { LootItem } from '../types'

interface SectionProps {
  label: string
  items: LootItem[]
  tableBadge?: string
  onItemClick?: (name: string) => void
  wikiTitles?: string[]                     // only matching names get gold link style
  emptyMessage?: string
  style?: React.CSSProperties
}

// ── Shared chance → colour helper ─────────────────────────────────────────────
export function chanceColor(chance: number): string {
  if (chance >= 60) return '#49c185'
  if (chance >= 30) return '#c8a84b'
  return '#e05555'
}

// ── Single row ─────────────────────────────────────────────────────────────────

function LootRow({ item, onItemClick, wikiTitles }: { item: LootItem; onItemClick?: (name: string) => void; wikiTitles?: string[] }) {
  const color = chanceColor(item.chance)
  const isWikiLink = !!wikiTitles && wikiTitles.some(t => t.toLowerCase() === item.name.toLowerCase())

  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', gap: 10 }}>
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