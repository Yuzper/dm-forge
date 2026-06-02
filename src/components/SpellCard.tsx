// path: src/components/SpellCard.tsx
// Shared spell preview card — the standard way a spell is shown on hover.
// Scrollable body + highlighted dice-damage and area/range patterns.

export type Spell = {
  name: string
  level: number
  school: string
  casting_time?: string
  range?: string
  components?: string
  duration?: string
  desc: string
  higher_levels?: string
}

const CARD_W = 320

// Matches, in one pass:
//  • dice + optional flat modifier (2d4, 6d12, 1d4 + 1, 8d6 + 5)
//  • saving throws (Dexterity saving throw, Constitution saving throw…)
//  • area/range phrases (20-foot-radius sphere, 15-foot cone, 60-foot line, 30 feet…)
const TOKEN_RE =
  /(\d+d\d+(?:\s*\+\s*\d+)?|(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving\s+throw|\d+[-\s]?(?:foot|feet)\b(?:[-\s](?:radius|diameter|tall|high|wide|long|deep|thick|sphere|cone|line|cube|cylinder|wall|emanation|square)){0,2})/gi

export function highlightSpellText(text: string) {
  return text.split(TOKEN_RE).map((part, i) => {
    if (/^\d+d\d+/i.test(part)) {
      return <strong key={i} style={{ color: 'var(--gold)', fontWeight: 700 }}>{part}</strong>
    }
    if (/saving\s+throw/i.test(part)) {
      return <strong key={i} style={{ color: '#e0795b', fontWeight: 700 }}>{part}</strong>
    }
    if (/^\d/.test(part) && /(?:foot|feet)/i.test(part)) {
      return <strong key={i} style={{ color: '#5b9fe8', fontWeight: 700 }}>{part}</strong>
    }
    return part
  })
}

function levelLabel(level: number): string {
  if (level === 0) return 'Cantrip'
  const ord = level === 1 ? '1st' : level === 2 ? '2nd' : level === 3 ? '3rd' : `${level}th`
  return `${ord}-level`
}

export function SpellCard({ spell, x, y, onMouseEnter, onMouseLeave }: {
  spell: Spell
  x: number
  y: number
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  const estHeight = 300
  const left = Math.min(x, window.innerWidth - CARD_W - 16)
  const top = y - estHeight - 12 < 0 ? y + 16 : y - estHeight - 12

  const hasMeta = spell.casting_time || spell.range || spell.duration || spell.components

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed', left, top,
        width: CARD_W, zIndex: 2000, pointerEvents: 'auto',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-gold)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '10px 14px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-gold)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--gold)', letterSpacing: '0.04em', marginBottom: 2 }}>
          {spell.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {levelLabel(spell.level)} {spell.school}
        </div>
      </div>
      {hasMeta && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
          {([['Casting Time', spell.casting_time], ['Range', spell.range], ['Duration', spell.duration], ['Components', spell.components]] as const).map(([label, val]) => val ? (
            <div key={label} style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-light)', borderRight: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{val}</div>
            </div>
          ) : null)}
        </div>
      )}
      <div style={{ padding: '10px 14px', maxHeight: 160, overflowY: 'auto' }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {highlightSpellText(spell.desc)}
        </div>
        {spell.higher_levels && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.4 }}>
            <strong>At Higher Levels. </strong>{highlightSpellText(spell.higher_levels)}
          </div>
        )}
      </div>
    </div>
  )
}
