// path: src/components/LootResultModal.tsx
import { X, Lock, Dices } from 'lucide-react'
import type { LootItem } from '../types'

interface Props {
  creatureName: string
  items: LootItem[]
  onClose: () => void
  // If provided, shows a regenerate button (for POI loot, not combat loot)
  onRegenerate?: () => void
}

export default function LootResultModal({ creatureName, items, onClose, onRegenerate }: Props) {
  const guaranteed = items.filter(i => i.chance === 100)
  const random = items.filter(i => i.chance < 100)
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
        width: 380,
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
              Loot result
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
              color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {isEmpty ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 8, padding: '24px 0', color: 'var(--text-muted)', textAlign: 'center',
            }}>
              <span style={{ fontSize: 24 }}>🎲</span>
              <span style={{ fontSize: 13 }}>Nothing dropped</span>
              <span style={{ fontSize: 11 }}>The dice weren't in your favour.</span>
            </div>
          ) : (
            <>
              {guaranteed.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <Lock size={9} /> Guaranteed
                  </div>
                  {guaranteed.map(item => (
                    <LootItemRow key={item.id} item={item} isGuaranteed />
                  ))}
                </div>
              )}

              {random.length > 0 && (
                <div>
                  {guaranteed.length > 0 && (
                    <div style={{ height: 1, background: 'var(--border-light)', margin: '8px 0 12px' }} />
                  )}
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <Dices size={9} /> Rolled
                  </div>
                  {random.map(item => (
                    <LootItemRow key={item.id} item={item} isGuaranteed={false} />
                  ))}
                </div>
              )}
            </>
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

function LootItemRow({ item, isGuaranteed }: { item: LootItem; isGuaranteed: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '8px 10px', marginBottom: 4,
      background: 'var(--bg-surface)',
      border: `1px solid ${isGuaranteed ? 'var(--border-gold)' : 'var(--border-light)'}`,
      borderRadius: 'var(--radius-sm)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500,
          color: isGuaranteed ? 'var(--gold)' : 'var(--text-primary)',
          marginBottom: item.description ? 2 : 0,
        }}>
          {item.name}
        </div>
        {item.description && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {item.description}
          </div>
        )}
      </div>
      <div style={{
        fontSize: 12, fontWeight: 600,
        color: 'var(--text-secondary)',
        flexShrink: 0, whiteSpace: 'nowrap',
      }}>
        {item.quantity}
      </div>
    </div>
  )
}
