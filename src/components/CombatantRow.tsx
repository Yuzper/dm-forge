// path: src/components/CombatantRow.tsx
import { useState } from 'react'
import { Swords, Skull, PackageOpen } from 'lucide-react'
import type { CombatCreature, LootItem, CombatResource } from '../types'
import { parseStatBlock, parseLootTable, generateLoot } from '../types'
import LootResultModal from './LootResultModal'

interface Props {
  creature: CombatCreature
  onUpdate: (id: number, updates: Partial<Pick<CombatCreature, 'current_hp' | 'is_dead' | 'initiative' | 'ac_override' | 'resources'>>) => void
  onOpenStatBlock: (articleId: number) => void
  onLootGenerated: (creatureId: number, result: LootItem[], articleId: number) => Promise<LootItem[]>
}

export default function CombatantRow({ creature, onUpdate, onOpenStatBlock, onLootGenerated }: Props) {
  const [inputAmount, setInputAmount] = useState('')
  const [inputMode, setInputMode] = useState<'damage' | 'heal'>('damage')
  const [editingAc, setEditingAc] = useState(false)
  const [acInput, setAcInput] = useState('')
  const [showLoot, setShowLoot] = useState(false)

  // ── Resource state ──────────────────────────────────────────────────────────
  const [resources, setResources] = useState<CombatResource[]>(() => {
    try { return JSON.parse(creature.resources || '[]') } catch { return [] }
  })
  const [addingResource, setAddingResource] = useState(false)
  const [newResourceName, setNewResourceName] = useState('')
  const [newResourceMax, setNewResourceMax] = useState('3')

  const updateResources = (next: CombatResource[]) => {
    setResources(next)
    onUpdate(creature.id, { resources: JSON.stringify(next) })
  }

  const updateResourceValue = (id: string, delta: number) => {
    updateResources(resources.map(r =>
      r.id === id ? { ...r, current: Math.max(0, Math.min(r.max, r.current + delta)) } : r
    ))
  }

  const removeResource = (id: string) => updateResources(resources.filter(r => r.id !== id))

  const confirmAddResource = () => {
    const name = newResourceName.trim()
    const max = Math.max(1, parseInt(newResourceMax) || 1)
    if (!name) return
    updateResources([...resources, {
      id: Math.random().toString(36).slice(2),
      name, current: max, max,
    }])
    setNewResourceName('')
    setNewResourceMax('3')
    setAddingResource(false)
  }

  const sb = parseStatBlock(creature.statblock)
  const displayAc = creature.ac_override !== null ? creature.ac_override : sb.ac
  const isDead = creature.is_dead
  const hpPercent = Math.max(0, Math.min(100, (creature.current_hp / creature.max_hp) * 100))
  const hpColor = hpPercent > 50 ? '#3dbf7f' : hpPercent > 25 ? '#e88c3a' : '#e05555'

  // Initialise loot state from persisted loot_result
  const [lootItems, setLootItems] = useState<LootItem[] | null>(() => {
    if (!creature.loot_result) return null
    try { return JSON.parse(creature.loot_result) } catch { return null }
  })

  const lootTable = parseLootTable(creature.loot_table)
  const hasLootTable = lootTable.items.length > 0 || creature.loot_table_id !== null
  const lootGenerated = lootItems !== null

  const handleLootClick = async () => {
    if (lootGenerated) {
      setShowLoot(true)
      return
    }
    try {
      const result = generateLoot(lootTable.items)
      const merged = await onLootGenerated(creature.id, result, creature.article_id)
      setLootItems(merged)
    } catch (e) {
      console.error('Loot generation error:', e)
      setLootItems([])
    }
    setShowLoot(true)
  }

  const applyInput = () => {
    const amount = parseInt(inputAmount)
    if (isNaN(amount) || amount <= 0) { setInputAmount(''); return }

    let newHp: number
    let newDead: boolean

    if (inputMode === 'damage' && !isDead) {
      newHp = Math.max(0, creature.current_hp - amount)
      newDead = newHp <= 0
    } else if (inputMode === 'heal') {
      newHp = Math.min(creature.max_hp, creature.current_hp + amount)
      newDead = newHp <= 0
    } else {
      setInputAmount('')
      return
    }

    onUpdate(creature.id, { current_hp: newHp, is_dead: newDead })
    setInputAmount('')
  }

  const commitAcOverride = () => {
    const val = acInput.trim()
    if (val === '') {
      onUpdate(creature.id, { ac_override: null })
    } else {
      const num = parseInt(val)
      if (!isNaN(num)) onUpdate(creature.id, { ac_override: num })
    }
    setEditingAc(false)
  }

  return (
    <>
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--border)',
        opacity: isDead ? 0.7 : 1,
        transition: 'opacity 200ms ease',
        background: isDead ? 'var(--bg-base)' : 'transparent',
      }}>
        {/* Row 1: initiative, name, buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input
            type="number"
            className="input"
            style={{ width: 48, height: 26, fontSize: 12, textAlign: 'center', padding: '0 4px', flexShrink: 0 }}
            placeholder="ini"
            value={creature.initiative ?? ''}
            onChange={e => {
              const val = e.target.value
              onUpdate(creature.id, { initiative: val === '' ? null : parseInt(val) || null })
            }}
            title="Initiative"
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{
              fontSize: 13, fontWeight: 600,
              fontFamily: 'var(--font-display)',
              color: isDead ? 'var(--text-muted)' : 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
            }}>
              {creature.title} {creature.instance_number}
            </span>
          </div>
          {isDead && <Skull size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />}

          {/* Stat block button */}
          <button
            onClick={() => onOpenStatBlock(creature.article_id)}
            title="Open stat block"
            style={{
              background: 'none', border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              padding: '3px 6px', display: 'flex', alignItems: 'center', gap: 4,
              color: 'var(--text-muted)', fontSize: 11, flexShrink: 0,
              transition: 'all 120ms ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--gold)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold-dim)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)' }}
          >
            <Swords size={11} /> Stats
          </button>

          {/* Loot button — only when dead and has loot table */}
          {isDead && hasLootTable && (
            <button
              onClick={handleLootClick}
              title={lootGenerated ? 'View loot' : 'Generate loot'}
              style={{
                background: lootGenerated ? 'var(--gold-glow)' : 'none',
                border: `1px solid ${lootGenerated ? 'var(--border-gold)' : 'var(--border-light)'}`,
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                padding: '3px 6px', display: 'flex', alignItems: 'center', gap: 4,
                color: lootGenerated ? 'var(--gold)' : 'var(--text-muted)',
                fontSize: 11, flexShrink: 0, transition: 'all 120ms ease',
              }}
              onMouseEnter={e => {
                if (!lootGenerated) {
                  (e.currentTarget as HTMLElement).style.color = '#e88c3a'
                  ;(e.currentTarget as HTMLElement).style.borderColor = '#e88c3a66'
                }
              }}
              onMouseLeave={e => {
                if (!lootGenerated) {
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
                  ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)'
                }
              }}
            >
              <PackageOpen size={11} /> Loot
            </button>
          )}
        </div>

        {/* Row 2: AC + HP bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>AC</span>
            {editingAc ? (
              <input
                className="input"
                type="number"
                autoFocus
                style={{ width: 44, height: 24, fontSize: 12, textAlign: 'center', padding: '0 2px' }}
                value={acInput}
                onChange={e => setAcInput(e.target.value)}
                onBlur={commitAcOverride}
                onKeyDown={e => { if (e.key === 'Enter') commitAcOverride(); if (e.key === 'Escape') setEditingAc(false) }}
                placeholder={String(sb.ac)}
              />
            ) : (
              <span
                onClick={() => { setEditingAc(true); setAcInput(creature.ac_override !== null ? String(creature.ac_override) : '') }}
                title="Click to override AC"
                style={{
                  fontSize: 13, fontWeight: 600,
                  color: creature.ac_override !== null ? 'var(--gold)' : 'var(--text-primary)',
                  cursor: 'pointer', minWidth: 20, textAlign: 'center',
                  borderBottom: '1px dashed var(--border-light)',
                }}
              >
                {displayAc}
              </span>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>HP</span>
              <div style={{
                flex: 1, height: 6, background: 'var(--bg-elevated)',
                borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)',
              }}>
                <div style={{
                  height: '100%', width: `${hpPercent}%`,
                  background: hpColor, borderRadius: 3,
                  transition: 'width 300ms ease, background 300ms ease',
                }} />
              </div>
              <span style={{
                fontSize: 12, fontWeight: 600, flexShrink: 0,
                color: isDead ? 'var(--text-muted)' : hpColor,
              }}>
                {creature.current_hp}<span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/{creature.max_hp}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Row 3: Resources */}
        {resources.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
            {resources.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: 11, color: 'var(--text-muted)', flex: 1, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {r.name}
                </span>
                <button
                  onClick={() => updateResourceValue(r.id, -1)}
                  disabled={r.current <= 0}
                  style={{
                    width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-sm)', cursor: r.current <= 0 ? 'not-allowed' : 'pointer',
                    color: r.current <= 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
                    fontSize: 14, fontWeight: 700, flexShrink: 0,
                  }}
                >−</button>
                <span style={{
                  fontSize: 12, fontWeight: 600, minWidth: 36, textAlign: 'center', flexShrink: 0,
                  color: r.current === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                }}>
                  {r.current}<span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/{r.max}</span>
                </span>
                <button
                  onClick={() => updateResourceValue(r.id, 1)}
                  disabled={r.current >= r.max}
                  style={{
                    width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-sm)', cursor: r.current >= r.max ? 'not-allowed' : 'pointer',
                    color: r.current >= r.max ? 'var(--text-muted)' : 'var(--text-secondary)',
                    fontSize: 14, fontWeight: 700, flexShrink: 0,
                  }}
                >+</button>
                <button
                  onClick={() => removeResource(r.id)}
                  style={{
                    width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', fontSize: 12, flexShrink: 0,
                    borderRadius: 'var(--radius-sm)',
                  }}
                  title="Remove resource"
                >×</button>
              </div>
            ))}
          </div>
        )}

        {/* Add resource */}
        {!isDead && (
          addingResource ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 6 }}>
              <input
                className="input"
                placeholder="Resource name…"
                value={newResourceName}
                onChange={e => setNewResourceName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmAddResource(); if (e.key === 'Escape') setAddingResource(false) }}
                autoFocus
                style={{ flex: 1, height: 26, fontSize: 11 }}
              />
              <input
                className="input"
                type="number"
                min={1}
                placeholder="Max"
                value={newResourceMax}
                onChange={e => setNewResourceMax(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmAddResource() }}
                style={{ width: 48, height: 26, fontSize: 11, textAlign: 'center' }}
              />
              <button
                onClick={confirmAddResource}
                className="btn btn-sm"
                style={{ height: 26, padding: '0 8px', fontSize: 11 }}
              >Add</button>
              <button
                onClick={() => { setAddingResource(false); setNewResourceName(''); setNewResourceMax('3') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '0 2px' }}
              >×</button>
            </div>
          ) : (
            <button
              onClick={() => setAddingResource(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 11, padding: '2px 0',
                marginBottom: 4, transition: 'color 120ms ease',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
            >
              + Resource
            </button>
          )
        )}

        {/* Row 4: damage/heal input */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => setInputMode(m => m === 'damage' ? 'heal' : 'damage')}
            style={{
              width: 28, height: 28, borderRadius: 'var(--radius-sm)',
              border: `1px solid ${inputMode === 'damage' ? 'var(--crimson-dim)' : 'rgba(61,191,127,0.4)'}`,
              background: inputMode === 'damage' ? 'rgba(139,37,51,0.15)' : 'rgba(61,191,127,0.1)',
              color: inputMode === 'damage' ? '#e05555' : '#3dbf7f',
              cursor: 'pointer', fontSize: 16, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'all 120ms ease',
            }}
            title={inputMode === 'damage' ? 'Switch to heal' : 'Switch to damage'}
          >
            {inputMode === 'damage' ? '−' : '+'}
          </button>
          <input
            className="input"
            type="number"
            style={{ flex: 1, height: 28, fontSize: 13, textAlign: 'center' }}
            placeholder={inputMode === 'damage' ? 'Damage…' : 'Heal…'}
            value={inputAmount}
            disabled={inputMode === 'damage' && isDead}
            onChange={e => setInputAmount(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyInput() }}
            min={0}
          />
          <button
            className="btn btn-sm"
            onClick={applyInput}
            disabled={!inputAmount || (inputMode === 'damage' && isDead)}
            style={{ height: 28, padding: '0 10px', fontSize: 12, flexShrink: 0 }}
          >
            Apply
          </button>
        </div>
      </div>

      {/* Loot result modal */}
      {showLoot && lootItems !== null && (
        <LootResultModal
          creatureName={`${creature.title} ${creature.instance_number}`}
          items={lootItems}
          onClose={() => setShowLoot(false)}
        />
      )}
    </>
  )
}