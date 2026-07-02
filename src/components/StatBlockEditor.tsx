// path: src/components/StatBlockEditor.tsx
import { useCallback, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { StatBlock, StatBlockEntry } from '../types'
import { calcHpAverage } from '../types'
import { crToXp } from '../utils/encounterBudget'
import SectionDivider from './SectionDivider'
import spellsData from '../data/spells_2014.json'

type Spell = { name: string; level: number; school: string; casting_time?: string; range?: string; components?: string; duration?: string; desc: string; higher_levels?: string }
const spells: Spell[] = spellsData as Spell[]

interface Props {
  value: StatBlock
  onChange: (sb: StatBlock) => void
  showLevel?: boolean   // player characters: surface level + class for the encounter balancer
  showCR?: boolean      // named NPCs: surface CR (+ derived XP) so they count as opposition
}

const DIE_OPTIONS = [4, 6, 8, 10, 12, 20]

// Base 5e classes + Artificer — for the player-character class/level picker.
const CLASS_OPTIONS = [
  'Artificer', 'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk',
  'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard',
]

const ABILITY_KEYS: (keyof StatBlock)[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const ABILITY_LABELS: Record<string, string> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
}

function abMod(score: number): string {
  const m = Math.floor((score - 10) / 2)
  return m >= 0 ? `+${m}` : `${m}`
}



function EntryList({
  entries, onChange, placeholder,
}: {
  entries: StatBlockEntry[]
  onChange: (entries: StatBlockEntry[]) => void
  placeholder: string
}) {
  const add = () => onChange([...entries, { name: '', desc: '' }])
  const remove = (i: number) => onChange(entries.filter((_, idx) => idx !== i))
  const update = (i: number, field: keyof StatBlockEntry, val: string) => {
    const next = entries.map((e, idx) => idx === i ? { ...e, [field]: val } : e)
    onChange(next)
  }

  return (
    <div>
      {entries.map((entry, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              className="input"
              style={{ height: 28, fontSize: 12, flex: '0 0 160px' }}
              placeholder="Name"
              value={entry.name}
              onChange={e => update(i, 'name', e.target.value)}
            />
            <button
              onClick={() => remove(i)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}
            >
              <Trash2 size={12} />
            </button>
          </div>
          <textarea
            className="input"
            style={{ fontSize: 12, minHeight: 60, resize: 'vertical' }}
            placeholder={placeholder}
            value={entry.desc}
            onChange={e => update(i, 'desc', e.target.value)}
          />
        </div>
      ))}
      <button
        onClick={add}
        className="btn btn-ghost btn-sm"
        style={{ fontSize: 11, color: 'var(--text-muted)' }}
      >
        <Plus size={11} /> Add entry
      </button>
    </div>
  )
}

export default function StatBlockEditor({ value, onChange, showLevel, showCR }: Props) {
  const [search, setSearch] = useState('')
  const filteredSpells = spells.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))

  const set = useCallback(<K extends keyof StatBlock>(key: K, val: StatBlock[K]) => {
    onChange({ ...value, [key]: val })
  }, [value, onChange])

  const setHpDice = useCallback(<K extends keyof StatBlock['hpDice']>(key: K, val: number) => {
    const next = { ...value.hpDice, [key]: val }
    const avg = calcHpAverage(next)
    onChange({ ...value, hpDice: next, hp: avg })
  }, [value, onChange])

  return (
    <div style={{ padding: '16px 24px', fontFamily: 'var(--font-ui)', fontSize: 13 }}>

      {/* ── Class & Level (player characters) — multiclass aware ── */}
      {showLevel && (() => {
        const rows = value.classLevels ?? []
        const total = rows.reduce((s, r) => s + (r.level || 0), 0)
        const commit = (next: { cls: string; level: number }[]) => {
          const sum = next.reduce((s, r) => s + (r.level || 0), 0)
          onChange({ ...value, classLevels: next, level: sum > 0 ? sum : undefined })
        }
        const addRow = () => commit([...rows, { cls: '', level: 1 }])
        const updateRow = (i: number, patch: Partial<{ cls: string; level: number }>) =>
          commit(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r))
        const removeRow = (i: number) => commit(rows.filter((_, idx) => idx !== i))

        return (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Classes & Levels</span>
              <span style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600 }}>
                {total > 0 ? `Character Level ${total}` : 'No levels set'}
              </span>
            </div>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <select
                  className="input"
                  style={{ height: 32, fontSize: 13, flex: 1 }}
                  value={r.cls}
                  onChange={e => updateRow(i, { cls: e.target.value })}
                >
                  <option value="">Class…</option>
                  {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={20}
                  style={{ width: 64, height: 32, fontSize: 13, textAlign: 'center' }}
                  value={r.level}
                  onChange={e => {
                    const n = parseInt(e.target.value)
                    updateRow(i, { level: Number.isFinite(n) ? Math.max(1, Math.min(20, n)) : 1 })
                  }}
                />
                <button
                  onClick={() => removeRow(i)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                  title="Remove class"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button onClick={addRow} className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              <Plus size={11} /> Add class
            </button>
          </div>
        )
      })()}

      {/* ── CR & derived XP (named NPCs) ── */}
      {showCR && (() => {
        const xp = crToXp(value.cr)
        return (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Challenge Rating</span>
              <input
                className="input"
                style={{ width: 90, height: 34, fontSize: 14, textAlign: 'center' }}
                placeholder="e.g. 1/2, 5"
                value={value.cr ?? ''}
                onChange={e => set('cr', e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>XP (from CR)</span>
              <div style={{
                width: 90, height: 34, border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 14, fontWeight: 600,
                color: xp === null ? 'var(--crimson)' : 'var(--gold)', background: 'var(--bg-elevated)',
              }}>
                {xp === null ? '—' : xp.toLocaleString()}
              </div>
            </div>
            {value.cr && xp === null && (
              <span style={{ fontSize: 11, color: 'var(--crimson)', marginBottom: 9 }}>
                Unrecognized CR — use 0, 1/8, 1/4, 1/2, or 1–30.
              </span>
            )}
          </div>
        )
      })()}

    {/* ── AC ── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>AC</span>
          <input
            className="input"
            type="number"
            style={{ width: 72, height: 34, fontSize: 14, textAlign: 'center' }}
            value={value.ac}
            onChange={e => set('ac', parseInt(e.target.value) || 0)}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>AC Note (e.g. natural armour)</span>
          <input
            className="input"
            style={{ height: 34, fontSize: 13 }}
            placeholder="natural armour, shield…"
            value={value.acNote}
            onChange={e => set('acNote', e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Speed</span>
          <input
            className="input"
            style={{ height: 34, fontSize: 13 }}
            placeholder="30 ft., fly 60 ft.…"
            value={value.speed}
            onChange={e => set('speed', e.target.value)}
          />
        </div>
      </div>

      {/* ── HP ── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Avg HP</span>
          <div style={{
            width: 72, height: 34, border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 14, color: 'var(--gold)',
            fontWeight: 600, background: 'var(--bg-elevated)',
          }}>
            {value.hp}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Dice count</span>
          <input
            className="input"
            type="number"
            style={{ width: 72, height: 34, fontSize: 13, textAlign: 'center' }}
            min={1}
            value={value.hpDice.count}
            onChange={e => setHpDice('count', Math.max(1, parseInt(e.target.value) || 1))}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hit Die</span>
          <select
            className="input"
            style={{ width: 80, height: 34, fontSize: 13 }}
            value={value.hpDice.die}
            onChange={e => setHpDice('die', parseInt(e.target.value))}
          >
            {DIE_OPTIONS.map(d => <option key={d} value={d}>d{d}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Bonus</span>
          <input
            className="input"
            type="number"
            style={{ width: 80, height: 34, fontSize: 13, textAlign: 'center' }}
            value={value.hpDice.bonus}
            onChange={e => setHpDice('bonus', parseInt(e.target.value) || 0)}
          />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'flex-end', marginBottom: 8 }}>
          = {value.hpDice.count}d{value.hpDice.die}{value.hpDice.bonus >= 0 ? '+' : ''}{value.hpDice.bonus}
        </div>
      </div>

      {/* ── Ability Scores ── */}
      <SectionDivider label="Ability Scores" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
        {ABILITY_KEYS.map(key => {
          const score = value[key] as number
          return (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                {ABILITY_LABELS[key as string]}
              </span>
              <input
                className="input"
                type="number"
                style={{ height: 40, fontSize: 14, textAlign: 'center', padding: '0 4px' }}
                value={score}
                onChange={e => set(key, parseInt(e.target.value) || 0)}
              />
              <span style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600 }}>
                {abMod(score)}
              </span>
            </div>
          )
        })}
      </div>

      {/* ── Other Fields ── */}
      <SectionDivider label="Details" />
      {([
        ['savingThrows', 'Saving Throws', 'Con +4, Wis +2…'],
        ['skills',       'Skills',        'Perception +4, Stealth +3…'],
        ['senses',       'Senses',        'darkvision 60 ft., passive Perception 14…'],
        ['languages',    'Languages',     'Common, Goblin…'],
      ] as [keyof StatBlock, string, string][]).map(([key, label, placeholder]) => (
        <div key={key} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
          <input
            className="input"
            style={{ height: 32, fontSize: 13 }}
            placeholder={placeholder}
            value={value[key] as string}
            onChange={e => set(key, e.target.value)}
          />
        </div>
      ))}

      {/* ── Action Sections ── */}
      {([
        ['traits',          'Traits',           'Describe the trait effect…'],
        ['actions',         'Actions',          'Describe the attack or action…'],
        ['bonusActions',    'Bonus Actions',    'Describe the bonus action…'],
        ['reactions',       'Reactions',        'Describe the reaction…'],
        ['legendaryActions','Legendary Actions','Describe the legendary action…'],
      ] as [keyof StatBlock, string, string][]).map(([key, label, placeholder]) => (
        <div key={key}>
          <SectionDivider label={label} margin="16px 0 8px" />
          <EntryList
            entries={value[key] as StatBlockEntry[]}
            onChange={entries => set(key, entries as any)}
            placeholder={placeholder}
          />
        </div>
      ))}

      {/* ── Proficiency & Resistances — plain text, not entry lists ── */}
      <SectionDivider label="Proficiency & Resistances" margin="16px 0 8px" />
      {([
        ['proficiencyBonus',   'Proficiency Bonus',   '+2…'],
        ['damageImmunities',   'Damage Immunities',   'fire, poison, bludgeoning…'],
        ['damageResistances',  'Damage Resistances',  'cold, necrotic…'],
        ['conditionImmunities','Condition Immunities', 'charmed, frightened…'],
      ] as [keyof StatBlock, string, string][]).map(([key, label, placeholder]) => (
        <div key={key} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
          <input
            className="input"
            style={{ height: 32, fontSize: 13 }}
            placeholder={placeholder}
            value={value[key] as string}
            onChange={e => set(key, e.target.value)}
          />
        </div>
      ))}

      {/* ── Spell Section ── */}
      <SectionDivider label="Cantrips & Prepared Spells" margin="16px 0 8px" />

      {/* Search input with dropdown */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <input
          className="input"
          placeholder="Search spells to add…"
          style={{ height: 32, fontSize: 12 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onBlur={() => setTimeout(() => setSearch(''), 150)}
        />
        {search.length > 0 && filteredSpells.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)',
            maxHeight: 200, overflowY: 'auto', marginTop: 2,
          }}>
            {filteredSpells.slice(0, 8).map(spell => {
              const alreadyAdded = (value.cantrips ?? []).includes(spell.name) ||
                (value.preparedSpells ?? []).includes(spell.name)
              return (
                <button
                  key={spell.name}
                  onMouseDown={() => {
                    if (alreadyAdded) return
                    if (spell.level === 0) {
                      set('cantrips', [...(value.cantrips ?? []), spell.name])
                    } else {
                      set('preparedSpells', [...(value.preparedSpells ?? []), spell.name])
                    }
                    setSearch('')
                  }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '7px 12px',
                    background: 'none', border: 'none',
                    cursor: alreadyAdded ? 'default' : 'pointer',
                    fontSize: 12, color: alreadyAdded ? 'var(--text-muted)' : 'var(--text-secondary)',
                    display: 'flex', alignItems: 'center', gap: 8,
                    opacity: alreadyAdded ? 0.5 : 1,
                  }}
                  className={(!alreadyAdded) ? 'hover-bg' : ''}
                >
                  <span style={{ flex: 1 }}>{spell.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {spell.level === 0 ? 'Cantrip' : `Lv ${spell.level}`} · {spell.school}
                  </span>
                  {alreadyAdded && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>added</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Selected spells as removable pills sorted by level */}
      {(() => {
        const allSelected = [
          ...(value.cantrips ?? []).map(n => ({ name: n, level: 0 })),
          ...(value.preparedSpells ?? []).map(n => {
            const sp = spells.find(s => s.name === n)
            return { name: n, level: sp?.level ?? 1 }
          }),
        ].sort((a, b) => a.level - b.level)

        if (allSelected.length === 0) return (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 0' }}>
            No spells added — search above to add
          </div>
        )

        const byLevel = new Map<number, string[]>()
        allSelected.forEach(({ name, level }) => {
          if (!byLevel.has(level)) byLevel.set(level, [])
          byLevel.get(level)!.push(name)
        })

        return Array.from(byLevel.entries()).map(([level, names]) => (
          <div key={level} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              {level === 0 ? 'Cantrips' : level === 1 ? '1st Level' : level === 2 ? '2nd Level' : level === 3 ? '3rd Level' : `${level}th Level`}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {names.map(name => (
                <div key={name} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 99, fontSize: 11,
                  background: 'rgba(155, 125, 232, 0.12)',
                  border: '1px solid rgba(155, 125, 232, 0.3)',
                  color: '#9b7de8',
                }}>
                  @{name}
                  <button
                    onClick={() => {
                      if (level === 0) {
                        set('cantrips', (value.cantrips ?? []).filter(n => n !== name))
                      } else {
                        set('preparedSpells', (value.preparedSpells ?? []).filter(n => n !== name))
                      }
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'rgba(155, 125, 232, 0.6)' }}
                  >
                    <Trash2 size={9} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      })()}
    </div>
  )
}