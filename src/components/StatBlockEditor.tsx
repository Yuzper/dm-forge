// path: src/components/StatBlockEditor.tsx
import { useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { StatBlock, StatBlockEntry } from '../types'
import { calcHpAverage } from '../types'
import SectionDivider from './SectionDivider'

interface Props {
  value: StatBlock
  onChange: (sb: StatBlock) => void
}

const DIE_OPTIONS = [4, 6, 8, 10, 12, 20]

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

export default function StatBlockEditor({ value, onChange }: Props) {
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

      {/* ── AC ── */}
      <SectionDivider label="Armour Class" />
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
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Note (e.g. natural armour)</span>
          <input
            className="input"
            style={{ height: 34, fontSize: 13 }}
            placeholder="natural armour, shield…"
            value={value.acNote}
            onChange={e => set('acNote', e.target.value)}
          />
        </div>
      </div>

      {/* ── HP ── */}
      <SectionDivider label="Hit Points" />
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
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Die</span>
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

      {/* ── Speed ── */}
      <SectionDivider label="Speed" />
      <input
        className="input"
        style={{ height: 34, fontSize: 13 }}
        placeholder="30 ft., fly 60 ft.…"
        value={value.speed}
        onChange={e => set('speed', e.target.value)}
      />

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

      {/* ── CR ── */}
      <SectionDivider label="Challenge Rating" />
      <input
        className="input"
        style={{ height: 34, fontSize: 13, width: 100 }}
        placeholder="1/4, 1, 5…"
        value={value.cr}
        onChange={e => set('cr', e.target.value)}
      />

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
          <SectionDivider label={label} />
          <EntryList
            entries={value[key] as StatBlockEntry[]}
            onChange={entries => set(key, entries as any)}
            placeholder={placeholder}
          />
        </div>
      ))}
    </div>
  )
}
