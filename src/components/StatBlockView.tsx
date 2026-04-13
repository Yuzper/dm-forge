// path: src/components/StatBlockView.tsx
import type { StatBlock } from '../types'
import { abilityMod } from '../types'
import spellsData from '../data/spells_2014.json'
import { useState } from 'react'

type Spell = { name: string; level: number; school: string; casting_time?: string; range?: string; components?: string; duration?: string; desc: string; higher_levels?: string }
const spellsAll: Spell[] = spellsData as Spell[]

interface Props {
  statblock: StatBlock
  name: string
  articleType: string
}

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
const ABILITY_LABELS: Record<string, string> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
}

function levelLabel(level: number): string {
  if (level === 0) return 'Cantrips'
  if (level === 1) return '1st Level'
  if (level === 2) return '2nd Level'
  if (level === 3) return '3rd Level'
  return `${level}th Level`
}

function SpellPill({ name, spellMap }: { name: string; spellMap: Map<string, Spell> }) {
  const [hover, setHover] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const spell = spellMap.get(name)

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <span
        className="spell-link"
        onMouseEnter={e => { setHover(true); setPos({ x: e.clientX, y: e.clientY }) }}
        onMouseLeave={() => setHover(false)}
        onMouseMove={e => setPos({ x: e.clientX, y: e.clientY })}
        style={{ fontSize: 12, cursor: 'help' }}
      >
        @{name}
      </span>
      {hover && spell && (
        <div style={{
          position: 'fixed',
          left: Math.min(pos.x, window.innerWidth - 340),
          top: pos.y - 300 < 0 ? pos.y + 16 : pos.y - 290,
          width: 320, zIndex: 2000, pointerEvents: 'none',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-gold)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 14px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-gold)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--gold)', letterSpacing: '0.04em', marginBottom: 2 }}>{spell.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {spell.level === 0 ? 'Cantrip' : `${levelLabel(spell.level).replace(' Level', '-level')}`} {spell.school}
            </div>
          </div>
          {(spell.casting_time || spell.range || spell.duration || spell.components) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
              {[['Casting Time', spell.casting_time], ['Range', spell.range], ['Duration', spell.duration], ['Components', spell.components]].map(([label, val]) => val ? (
                <div key={label} style={{ padding: '5px 12px', borderBottom: '1px solid var(--border-light)', borderRight: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 1 }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{val}</div>
                </div>
              ) : null)}
            </div>
          )}
          <div style={{ padding: '8px 14px', maxHeight: 120, overflowY: 'auto' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{spell.desc}</div>
            {spell.higher_levels && (
              <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                <strong>At Higher Levels. </strong>{spell.higher_levels}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
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
  const spellMap = new Map(spellsAll.map(s => [s.name, s]))
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
        <StatRow label="Proficiency Bonus"    value={sb.proficiencyBonus} />
        <StatRow label="Damage Immunities"    value={sb.damageImmunities} />
        <StatRow label="Damage Resistances"   value={sb.damageResistances} />
        <StatRow label="Condition Immunities" value={sb.conditionImmunities} />

        {/* Action sections */}
        <EntrySection title="Traits" entries={sb.traits} />
        <EntrySection title="Actions" entries={sb.actions} />
        <EntrySection title="Bonus Actions" entries={sb.bonusActions} />
        <EntrySection title="Reactions" entries={sb.reactions} />
        <EntrySection title="Legendary Actions" entries={sb.legendaryActions} />

        {/* ── Spellcasting ── */}
        {(() => {
          const allSpells = [
            ...(sb.cantrips ?? []).map(n => ({ name: n, level: 0 })),
            ...(sb.preparedSpells ?? []).map(n => ({ name: n, level: spellMap.get(n)?.level ?? 1 })),
          ].sort((a, b) => a.level - b.level)
          if (allSpells.length === 0) return null
          const byLevel = new Map<number, string[]>()
          allSpells.forEach(({ name, level }) => {
            if (!byLevel.has(level)) byLevel.set(level, [])
            byLevel.get(level)!.push(name)
          })
          return (
            <div style={{ marginTop: 8 }}>
              <Rule />
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em', marginBottom: 8 }}>
                Spellcasting
              </div>
              {Array.from(byLevel.entries()).map(([level, names]) => (
                <div key={level} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                    {levelLabel(level)}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {names.map(n => <SpellPill key={n} name={n} spellMap={spellMap} />)}
                  </div>
                </div>
              ))}
            </div>
          )
        })()}
      </div>
    </div>
  )
}