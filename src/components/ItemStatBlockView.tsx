// path: src/components/ItemStatBlockView.tsx
// Read-mode magic-item stat block, styled to match StatBlockView — a gold-edged
// card with the official "Wondrous item, uncommon (requires attunement)" subtitle.

import type { ItemStatBlock } from '../types'
import { itemBlockSubtitle } from '../types'
import { highlightSpellText } from './SpellCard'

function Rule() {
  return <div style={{ height: 2, background: 'linear-gradient(90deg, var(--gold-dim), transparent)', margin: '10px 0' }} />
}

export default function ItemStatBlockView({ itemBlock: ib, name, image }: { itemBlock: ItemStatBlock; name: string; image?: string | null }) {
  const subtitle = itemBlockSubtitle(ib)
  const paragraphs = ib.description.split(/\n+/).map(s => s.trim()).filter(Boolean)

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-gold)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ background: 'var(--bg-elevated)', borderBottom: '2px solid var(--gold-dim)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
        {image && (
          <img
            src={image}
            style={{
              width: 60, height: 60, flexShrink: 0, borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--gold-dim)', objectFit: 'cover', display: 'block',
            }}
          />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, color: 'var(--gold)', letterSpacing: '0.04em', marginBottom: subtitle ? 2 : 0 }}>
            {name}
          </div>
          {subtitle && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic' }}>{subtitle}</div>
          )}
        </div>
      </div>

      <div style={{ padding: '12px 16px' }}>
        {paragraphs.map((p, i) => (
          <div key={i} style={{ fontSize: 13, fontFamily: 'var(--font-body)', lineHeight: 1.6, color: 'var(--text-secondary)', marginBottom: i < paragraphs.length - 1 ? 8 : 0 }}>
            {highlightSpellText(p)}
          </div>
        ))}

        {ib.properties.length > 0 && (
          <div style={{ marginTop: paragraphs.length ? 4 : 0 }}>
            <Rule />
            {ib.properties.map((e, i) => (
              <div key={i} style={{ marginBottom: 6, fontSize: 13, fontFamily: 'var(--font-body)', lineHeight: 1.55 }}>
                {e.name && <strong style={{ color: 'var(--text-primary)', fontStyle: 'italic' }}>{e.name}. </strong>}
                <span style={{ color: 'var(--text-secondary)' }}>{highlightSpellText(e.desc)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
