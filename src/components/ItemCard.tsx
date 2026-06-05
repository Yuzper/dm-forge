// path: src/components/ItemCard.tsx
// Shared item preview card — the standard way an item article is shown on hover.
// Mirrors SpellCard: header + meta grid + scrollable description, with the
// rarity tinting the card's accent so value reads at a glance.

export type ItemCardData = {
  name: string
  category?: string
  rarity?: string
  attunement?: string
  status?: string
  location?: string
  tags?: string[]
  coverImage?: string | null
  desc?: string
}

const CARD_W = 320

// Rarity → accent colour, matching the 5e value ladder.
const RARITY_COLORS: Record<string, string> = {
  Common: '#9aa0a6',
  Uncommon: '#49c185',
  Rare: '#4da6ff',
  'Very Rare': '#b07de8',
  Legendary: '#e8a23a',
  Artifact: '#e05555',
}

export function ItemCard({ item, x, y, onMouseEnter, onMouseLeave }: {
  item: ItemCardData
  x: number
  y: number
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  const estHeight = 300
  const left = Math.min(x, window.innerWidth - CARD_W - 16)
  const top = y - estHeight - 12 < 0 ? y + 16 : y - estHeight - 12

  const accent = (item.rarity && RARITY_COLORS[item.rarity]) || 'var(--gold)'
  const meta = ([['Rarity', item.rarity], ['Status', item.status], ['Location', item.location]] as const)
    .filter(([, v]) => v)
  const hasMeta = meta.length > 0

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed', left, top,
        width: CARD_W, zIndex: 2000, pointerEvents: 'auto',
        background: 'var(--bg-elevated)',
        border: `1px solid ${accent}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }}
    >
      {item.coverImage && (
        <img src={item.coverImage} style={{ width: '100%', height: 96, objectFit: 'cover', display: 'block', borderBottom: `1px solid ${accent}` }} />
      )}
      <div style={{ padding: '10px 14px', background: 'var(--bg-surface)', borderBottom: `1px solid ${accent}` }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: accent, letterSpacing: '0.04em', marginBottom: 2 }}>
          {item.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {[item.category || 'Item', item.rarity ? item.rarity.toLowerCase() : '']
            .filter(Boolean).join(', ')}
          {item.attunement ? ` (${item.attunement})` : ''}
        </div>
      </div>
      {hasMeta && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
          {meta.map(([label, val]) => (
            <div key={label} style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-light)', borderRight: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{val}</div>
            </div>
          ))}
        </div>
      )}
      {(item.desc || (item.tags && item.tags.length > 0)) && (
        <div style={{ padding: '10px 14px', maxHeight: 160, overflowY: 'auto' }}>
          {item.desc && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item.desc}</div>
          )}
          {item.tags && item.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: item.desc ? 8 : 0 }}>
              {item.tags.map(t => (
                <span key={t} style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 99, padding: '1px 7px' }}>{t}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
