// path: src/components/StatBlockView.tsx
import type { StatBlock } from '../types'
import { abilityMod } from '../types'

interface Props {
  statblock: StatBlock
  name: string
  articleType: string
}

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
const ABILITY_LABELS: Record<string, string> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
}

function Rule() {
  return <div style={{ height: 2, background: 'linear-gradient(90deg, var(--gold-dim), transparent)', margin: '8px 0' }} />
}

function StatRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div style={{ fontSize: 13, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>
      <strong style={{ color: 'var(--text-primary)' }}>{label} </strong>
      <span style={{ color: 'var(--text-secondary)' }}>{value}</span>
    </div>
  )
}

function EntrySection({ title, entries }: { title: string; entries: { name: string; desc: string }[] }) {
  if (!entries.length) return null
  return (
    <div style={{ marginTop: 8 }}>
      <Rule />
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em', marginBottom: 6 }}>
        {title}
      </div>
      {entries.map((e, i) => (
        <div key={i} style={{ marginBottom: 6, fontSize: 13, fontFamily: 'var(--font-body)', lineHeight: 1.55 }}>
          <strong style={{ color: 'var(--text-primary)', fontStyle: 'italic' }}>{e.name}. </strong>
          <span style={{ color: 'var(--text-secondary)' }}>{e.desc}</span>
        </div>
      ))}
    </div>
  )
}

export default function StatBlockView({ statblock: sb, name, articleType }: Props) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-gold)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        background: 'var(--bg-elevated)',
        borderBottom: '2px solid var(--gold-dim)',
        padding: '12px 16px',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 20, fontWeight: 500,
          color: 'var(--gold)', letterSpacing: '0.04em',
          marginBottom: 2,
        }}>
          {name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {articleType === 'character' ? 'Character' : 'Creature'} · CR {sb.cr}
        </div>
      </div>

      <div style={{ padding: '12px 16px' }}>
        {/* Core stats */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontFamily: 'var(--font-body)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Armour Class </strong>
            <span style={{ color: 'var(--text-secondary)' }}>
              {sb.ac}{sb.acNote ? ` (${sb.acNote})` : ''}
            </span>
          </div>
        </div>
        <div style={{ fontSize: 13, fontFamily: 'var(--font-body)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Hit Points </strong>
          <span style={{ color: 'var(--text-secondary)' }}>
            {sb.hp} ({sb.hpDice.count}d{sb.hpDice.die}{sb.hpDice.bonus !== 0 ? (sb.hpDice.bonus > 0 ? `+${sb.hpDice.bonus}` : sb.hpDice.bonus) : ''})
          </span>
        </div>
        <div style={{ fontSize: 13, fontFamily: 'var(--font-body)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Speed </strong>
          <span style={{ color: 'var(--text-secondary)' }}>{sb.speed}</span>
        </div>

        <Rule />

        {/* Ability scores */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, textAlign: 'center', margin: '8px 0' }}>
          {ABILITY_KEYS.map(key => {
            const score = sb[key] as number
            return (
              <div key={key}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.06em' }}>
                  {ABILITY_LABELS[key]}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{score}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{abilityMod(score)}</div>
              </div>
            )
          })}
        </div>

        <Rule />

        {/* Detail rows */}
        <StatRow label="Saving Throws" value={sb.savingThrows} />
        <StatRow label="Skills" value={sb.skills} />
        <StatRow label="Senses" value={sb.senses} />
        <StatRow label="Languages" value={sb.languages} />

        {/* Action sections */}
        <EntrySection title="Traits" entries={sb.traits} />
        <EntrySection title="Actions" entries={sb.actions} />
        <EntrySection title="Bonus Actions" entries={sb.bonusActions} />
        <EntrySection title="Reactions" entries={sb.reactions} />
        <EntrySection title="Legendary Actions" entries={sb.legendaryActions} />
      </div>
    </div>
  )
}
