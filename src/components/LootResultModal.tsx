// path: src/components/LootResultModal.tsx
import { X, Dices } from 'lucide-react'
import type { LootItem } from '../types'

interface Props {
  creatureName: string
  items: LootItem[]
  onClose: () => void
  // If provided, shows a regenerate button (for POI loot, not combat loot)
  onRegenerate?: () => void
}

function chanceColor(chance: number): string {
  if (chance >= 100) return '#49c185'
  if (chance >= 60)  return '#6ab87a'
  if (chance >= 30)  return '#c8a84b'
  return '#e05555'
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
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
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

  return (
    <div style={{
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
            marginBottom: item.description ? 2 : 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.name}
          </div>
          {item.description && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
              {item.description}
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
  )
}