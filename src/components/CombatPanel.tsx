// path: src/components/CombatPanel.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/store'
import { useMapContext } from '../context/MapContext'
import { X, Plus, Search, Save, Dices, Swords, ScrollText, ChevronDown, Scale } from 'lucide-react'
import RichEditor from './RichEditor'
import CombatantRow from './CombatantRow'
import EncounterBalance, { type EncounterSummary } from './EncounterBalance'
import type { CombatEncounter, CombatCreature, LootItem } from '../types'
import { parseStatBlock, calcHpAverage, rollHp } from '../types'
import { crToXp } from '../utils/encounterBudget'
import { parseCreatureVariants } from '../utils/creatureVariants'
import { useConfirmDelete } from '../hooks/useConfirmDelete'

// The panel has two modes: the live encounter (tracker + a foldout difficulty
// readout) and the scenario notes. Balance is no longer a separate destination.
type Tab = 'encounter' | 'notes'

export default function CombatPanel({ readMode }: { readMode?: boolean }) {
  // Map state + actions come from context
  const { selectedPOI, poiPanelOpen, selectPOI, updatePOI, deletePOI } = useMapContext()
  // Campaign context stays in global store
  const { currentCampaign, openStatBlockOverlay, setHintContext } = useStore()

  // Surface the combat-tracker hint while the combatants tab is open; restore the
  // session hint otherwise (combat panels only ever appear within a session).

  // ── General text state ─────────────────────────────────────────────────────
  const [label, setLabel] = useState('')
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const { confirming: confirmDelete, trigger: triggerDelete } = useConfirmDelete()

  // ── Combat state ───────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('encounter')
  const [encounter, setEncounter] = useState<CombatEncounter | null>(null)
  const [creatures, setCreatures] = useState<CombatCreature[]>([])
  const [creaturesDirty, setCreaturesDirty] = useState(false)
  // Difficulty foldout: collapsed shows a one-line strip; expanded reveals the
  // full balance breakdown. Summary is reported up from EncounterBalance.
  const [balanceOpen, setBalanceOpen] = useState(false)
  const [balanceSummary, setBalanceSummary] = useState<EncounterSummary | null>(null)
  // Ally selection — combat-creature ids that fight for the party. Shared between
  // the Balance tab and the combatant rows (persisted per-encounter).
  const [allyIds, setAllyIds] = useState<Set<number>>(new Set())

  // Swap the floating hint to combat guidance while running an encounter
  useEffect(() => {
    if (!readMode && activeTab === 'encounter') {
      setHintContext('combat-tracker')
      return () => setHintContext('session')
    }
    return undefined
  }, [readMode, activeTab, setHintContext])

  // ── Picker state ───────────────────────────────────────────────────────────
  const [showPicker, setShowPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')

  // ── Pending ref for auto-save on close ─────────────────────────────────────
  const pendingRef = useRef({
    selectedPOI, label, content, dirty,
    encounter, creatures, creaturesDirty,
  })
  pendingRef.current = { selectedPOI, label, content, dirty, encounter, creatures, creaturesDirty }

  // Debounce ref for combat auto-save
  const combatSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load POI data ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedPOI) return
    setLabel(selectedPOI.label)
    setContent(selectedPOI.content)
    setDirty(false)
    setCreaturesDirty(false)
    setActiveTab('encounter')
    setBalanceOpen(false)
  }, [selectedPOI?.id])

  // ── Load encounter + creatures when the encounter view is open ─────────────
  useEffect(() => {
    if (!selectedPOI || activeTab !== 'encounter') return
    ;(async () => {
      const enc = await window.api.getCombatEncounter(selectedPOI.id)
      setEncounter(enc)
      const raw = await window.api.getCombatCreatures(enc.id)
      setCreatures(raw)
    })()
  }, [selectedPOI?.id, activeTab])

  // ── Ally selection: load on encounter change; writes persist immediately ────
  const allyStorageKey = (id: number) => `dmforge:allies:${id}`
  useEffect(() => {
    if (!encounter) { setAllyIds(new Set()); return }
    try {
      const raw = localStorage.getItem(allyStorageKey(encounter.id))
      const arr = raw ? JSON.parse(raw) : []
      setAllyIds(new Set(Array.isArray(arr) ? arr.filter((n: any) => typeof n === 'number') : []))
    } catch { setAllyIds(new Set()) }
  }, [encounter?.id])

  const persistAllies = (set: Set<number>) => {
    if (encounter) localStorage.setItem(allyStorageKey(encounter.id), JSON.stringify([...set]))
  }
  const toggleAlly = useCallback((id: number) => {
    setAllyIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      persistAllies(next)
      return next
    })
  }, [encounter])

  // ── Remove a combatant entirely ─────────────────────────────────────────────
  const removeCombatant = useCallback(async (id: number) => {
    await window.api.deleteCombatCreature(id)
    setCreatures(prev => prev.filter(c => c.id !== id))
    setAllyIds(prev => {
      if (!prev.has(id)) return prev
      const next = new Set(prev); next.delete(id)
      persistAllies(next)
      return next
    })
  }, [encounter])

  // ── Auto-save on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const p = pendingRef.current
      if (p.dirty && p.selectedPOI) {
        window.api.updatePOI(p.selectedPOI.id, { label: p.label, content: p.content })
      }
      if (p.creaturesDirty && p.encounter && p.creatures.length) {
        window.api.saveCombatCreatures(
          p.creatures.map(c => ({
            id: c.id, current_hp: c.current_hp,
            ac_override: c.ac_override, is_dead: c.is_dead, initiative: c.initiative,
            resources: c.resources ?? '[]',
          }))
        )
      }
    }
  }, [])

  // ── Debounced general auto-save (1500ms after last change) ───────────────
  useEffect(() => {
    if (!dirty || !selectedPOI) return
    const timer = setTimeout(() => {
      updatePOI(selectedPOI.id, { label, content }).then(() => setDirty(false))
    }, 1500)
    return () => clearTimeout(timer)
  }, [dirty, label, content, selectedPOI])

  // ── Debounced combat auto-save (1500ms after last change) ─────────────────
  useEffect(() => {
    if (!creaturesDirty || !encounter || !creatures.length) return
    if (combatSaveRef.current) clearTimeout(combatSaveRef.current)
    combatSaveRef.current = setTimeout(() => {
      window.api.saveCombatCreatures(
        creatures.map(c => ({
          id: c.id, current_hp: c.current_hp,
          ac_override: c.ac_override, is_dead: c.is_dead, initiative: c.initiative,
          resources: c.resources ?? '[]',
        }))
      ).then(() => setCreaturesDirty(false))
    }, 1500)
    return () => {
      if (combatSaveRef.current) clearTimeout(combatSaveRef.current)
    }
  }, [creatures, creaturesDirty, encounter])

  // ── Picker entries — creatures expand into variants, characters stay flat ─────
  interface PickerEntry {
    key: string
    displayName: string   // "Goblin Warrior"
    subtitle: string      // "Goblin · CR 1/4" or "character"
    articleId: number
    variantId: string | null   // null for characters/playerCharacters
    variantIndex: number | null
  }
  const [pickerEntries, setPickerEntries] = useState<PickerEntry[]>([])

  useEffect(() => {
    if (!showPicker) return
    const campaign = useStore.getState().currentCampaign
    if (!campaign) return
    Promise.all([
      window.api.getArticlesList({ campaignId: campaign.id, type: 'creature' }),
      window.api.getArticlesList({ campaignId: campaign.id, type: 'character' }),
      window.api.getArticlesList({ campaignId: campaign.id, type: 'playerCharacter' }),
    ]).then(async ([creatures, characters, pcs]) => {
      const entries: PickerEntry[] = []

      // Expand creature articles into their variants (shared parsing)
      for (const c of creatures) {
        const full = await window.api.getArticle(c.id)
        if (!full) continue
        const variants = parseCreatureVariants(full)

        if (variants.length === 1 && variants[0].index === null) {
          // Legacy single statblock
          entries.push({ key: `c_${c.id}`, displayName: c.title, subtitle: 'creature', articleId: c.id, variantId: null, variantIndex: null })
        } else {
          for (const v of variants) {
            entries.push({
              key: `c_${c.id}_v${v.index}`,
              displayName: v.name,
              subtitle: `${c.title} · CR ${v.cr || '—'}`,
              articleId: c.id,
              variantId: v.id,
              variantIndex: v.index,
            })
          }
        }
      }

      // Characters and player characters as flat entries
      for (const ch of [...characters, ...pcs]) {
        entries.push({ key: `ch_${ch.id}`, displayName: ch.title, subtitle: ch.article_type === 'playerCharacter' ? 'player character' : 'character', articleId: ch.id, variantId: null, variantIndex: null })
      }

      setPickerEntries(entries.sort((a, b) => a.displayName.localeCompare(b.displayName)))
    })
  }, [showPicker])

  // ── Save ───────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!selectedPOI) return
    setSaving(true)
    if (dirty) {
      await updatePOI(selectedPOI.id, { label, content })
      setDirty(false)
    }
    if (creaturesDirty && encounter) {
      await window.api.saveCombatCreatures(
        creatures.map(c => ({
          id: c.id, current_hp: c.current_hp,
          ac_override: c.ac_override, is_dead: c.is_dead, initiative: c.initiative,
          resources: c.resources ?? '[]',
        }))
      )
      setCreaturesDirty(false)
    }
    setSaving(false)
  }, [selectedPOI, dirty, label, content, creaturesDirty, encounter, creatures, updatePOI])

  const handleClose = async () => {
    await save()
    selectPOI(null)
  }

  // ── Combatant update (local only) ──────────────────────────────────────────
  const updateCreature = useCallback((id: number, updates: Partial<CombatCreature>) => {
    setCreatures(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
    setCreaturesDirty(true)
  }, [])

  // ── Add combatant ──────────────────────────────────────────────────────────
  const addCombatant = async (entry: PickerEntry, useRoll = false) => {
    if (!encounter) return
    const full = await window.api.getArticle(entry.articleId)
    if (!full) return

    let sb: ReturnType<typeof parseStatBlock>
    let variantLootTableId: number | null = null
    let variantLootTable: string | null = null
    let cr: string | null = null   // captured at add-time so the balancer needn't re-derive

    if (entry.variantIndex !== null) {
      // Creature variant — parse from variants array
      try {
        const variants = JSON.parse(full.statblock)
        const v = variants[entry.variantIndex]
        sb = parseStatBlock(typeof v.statblock === 'string' ? v.statblock : JSON.stringify(v.statblock))
        variantLootTableId = v.loot_table_id ?? null
        variantLootTable = v.loot_table ?? null
        cr = v.cr ?? null
      } catch {
        sb = parseStatBlock(full.statblock)
      }
    } else {
      // Character / legacy single stat block — CR lives on the stat block (named NPCs)
      sb = parseStatBlock(full.statblock)
      cr = sb.cr ?? null
    }

    // Store only a real CR — never the "—" placeholder or blank — so the
    // balancer can cleanly fall back to the article when it's genuinely unset.
    const crClean = (cr != null && crToXp(cr) !== null) ? cr : null

    const maxHp = useRoll ? rollHp(sb.hpDice) : calcHpAverage(sb.hpDice)
    const newCreature = await (window.api as any).addCombatCreature(encounter.id, entry.articleId, maxHp, {
      variant_name: entry.variantIndex !== null ? entry.displayName : null,
      variant_statblock: entry.variantIndex !== null ? JSON.stringify(sb) : null,
      variant_loot_table_id: variantLootTableId,
      variant_loot_table: variantLootTable,
      cr: crClean,
    })
    setCreatures(prev => [...prev, newCreature])
    setShowPicker(false)
    setPickerSearch('')
    setActiveTab('encounter')
  }

  // ── Open stat block overlay ────────────────────────────────────────────────
  const openStatBlock = useCallback((creature: any) => {
    openStatBlockOverlay(creature.article_id, {
      statblock: creature.variant_statblock ?? creature.statblock ?? undefined,
      name: creature.display_name ?? creature.title ?? undefined,
    })
  }, [openStatBlockOverlay])

  // ── Loot generation ─────────────────────────────────────────────────────────
  const handleLootGenerated = useCallback(async (creatureId: number, result: LootItem[], articleId: number): Promise<LootItem[]> => {
    try {
      // Check if this combat creature has a variant loot table stored
      const combatCreature = creatures.find(c => c.id === creatureId)
      const lootTableId = (combatCreature as any)?.variant_loot_table_id
        ?? (await window.api.getArticle(articleId))?.loot_table_id
      if (lootTableId) {
        const masterResult = await window.api.rollLootTable(lootTableId, '[]')
        result = [...result, ...masterResult]
      }
    } catch (e) {
      console.error('Loot generation error:', e)
    }
    try {
      await window.api.saveLootResult(creatureId, result)
    } catch (e) {
      console.error('Save loot result error:', e)
    }
    return result
  }, [creatures])

  // ── Sort creatures by initiative (desc, nulls last) ────────────────────────
  const sortedCreatures = [...creatures].sort((a, b) => {
    if (a.initiative === null && b.initiative === null) return a.instance_number - b.instance_number
    if (a.initiative === null) return 1
    if (b.initiative === null) return -1
    return b.initiative - a.initiative
  })

  // ── Picker filter ──────────────────────────────────────────────────────────
  const filteredPicker = pickerEntries.filter(e =>
    e.displayName.toLowerCase().includes(pickerSearch.toLowerCase()) ||
    e.subtitle.toLowerCase().includes(pickerSearch.toLowerCase())
  )

  if (!poiPanelOpen || !selectedPOI) return null

  return (
    <div style={{
      width: 'var(--panel-width)',
      background: 'var(--bg-surface)',
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0, animation: 'slideIn 200ms ease', overflow: 'hidden',
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
        flexShrink: 0, background: 'var(--bg-elevated)',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 4,
          background: '#e0555522', border: '1px solid #e0555555',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          ⚔
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            value={label}
            onChange={e => { setLabel(e.target.value); setDirty(true) }}
            readOnly={readMode}
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontFamily: 'var(--font-display)',
              fontSize: 15, width: '100%', letterSpacing: '0.02em',
              cursor: readMode ? 'default' : 'text',
            }}
            placeholder="Combat encounter…"
          />
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {(dirty || creaturesDirty) && !readMode && (
            <button className="btn btn-sm" onClick={save} disabled={saving} style={{ padding: '3px 8px', fontSize: 11 }}>
              {saving ? 'Saving…' : <><Save size={11} /> Save</>}
            </button>
          )}
          {!readMode && (
            <button
              className="btn btn-sm btn-danger"
              onClick={() => triggerDelete(() => deletePOI(selectedPOI.id))}
              style={{ padding: '3px 8px', fontSize: 11, border: confirmDelete ? '1px solid var(--crimson)' : undefined }}
            >
              {confirmDelete ? 'Confirm delete' : 'Delete'}
            </button>
          )}
          <button className="btn btn-ghost btn-icon btn-sm" onClick={handleClose} title="Close" disabled={saving}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Mode toggle (segmented) ── */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 3, background: 'var(--bg-base)', borderRadius: 'var(--radius-md)', padding: 3, border: '1px solid var(--border)' }}>
          {([['encounter', 'Encounter', Swords], ['notes', 'Notes', ScrollText]] as const).map(([id, lbl, Icon]) => {
            const active = activeTab === id
            return (
              <button key={id} onClick={() => setActiveTab(id)} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '6px 0', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                background: active ? 'var(--bg-surface)' : 'transparent',
                color: active ? 'var(--gold)' : 'var(--text-muted)',
                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.28)' : 'none',
                fontSize: 12, fontWeight: active ? 600 : 500, fontFamily: 'var(--font-ui)',
                transition: 'all 120ms ease',
              }}>
                <Icon size={13} /> {lbl}
                {id === 'encounter' && creatures.length > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--gold-glow)', color: 'var(--gold)', padding: '0 5px', borderRadius: 99, border: '1px solid var(--border-gold)' }}>
                    {creatures.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Encounter: difficulty strip + tracker ── */}
      {activeTab === 'encounter' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Live difficulty strip — click to unfold the full balance breakdown */}
          <button
            onClick={() => setBalanceOpen(o => !o)}
            title={balanceOpen ? 'Hide difficulty details' : 'Show party & difficulty details'}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
              padding: '8px 12px', background: balanceOpen ? 'var(--bg-active)' : 'var(--bg-elevated)',
              border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0,
              transition: 'background 120ms ease',
            }}
          >
            <Scale size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            {balanceSummary && balanceSummary.party > 0 && !balanceSummary.noXp ? (
              <>
                <span style={{
                  fontSize: 11.5, fontWeight: 700, padding: '1px 8px', borderRadius: 99,
                  color: balanceSummary.color, background: `${balanceSummary.color}1e`, border: `1px solid ${balanceSummary.color}55`,
                }}>
                  {balanceSummary.incomplete ? `≥ ${balanceSummary.classification}` : balanceSummary.classification}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{balanceSummary.xp.toLocaleString()} XP</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {balanceSummary.monsters} monster{balanceSummary.monsters !== 1 ? 's' : ''}</span>
              </>
            ) : (
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                Difficulty — {creatures.length ? 'select your party' : 'add combatants first'}
              </span>
            )}
            <ChevronDown size={14} style={{ marginLeft: 'auto', color: 'var(--text-muted)', flexShrink: 0, transform: balanceOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }} />
          </button>

          {/* Balance breakdown — kept mounted (hidden when collapsed) so the strip
              stays live; scrolls within a bounded height above the tracker. */}
          {encounter && currentCampaign && (
            <div style={{ display: balanceOpen ? 'flex' : 'none', flexDirection: 'column', minHeight: 0, maxHeight: '55%', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
              <EncounterBalance
                encounterId={encounter.id} creatures={creatures} campaign={currentCampaign}
                allyIds={allyIds} onToggleAlly={toggleAlly} onSummary={setBalanceSummary}
              />
            </div>
          )}

          {/* Add combatant */}
          {!readMode && (
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <button className="btn btn-sm" onClick={() => setShowPicker(true)} style={{ width: '100%', justifyContent: 'center' }}>
                <Plus size={13} /> Add Combatant
              </button>
            </div>
          )}

          {/* Tracker */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            {sortedCreatures.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: '32px 16px', gap: 8,
                color: 'var(--text-muted)', textAlign: 'center',
              }}>
                <span style={{ fontSize: 28 }}>⚔</span>
                <span style={{ fontSize: 12 }}>No combatants yet.{!readMode && ' Add creatures or characters above.'}</span>
              </div>
            ) : (
              sortedCreatures.map(creature => (
                <CombatantRow
                  key={creature.id}
                  creature={creature}
                  onUpdate={updateCreature}
                  onOpenStatBlock={openStatBlock}
                  onLootGenerated={handleLootGenerated}
                  onDelete={readMode ? undefined : removeCombatant}
                  isAlly={allyIds.has(creature.id)}
                  onToggleAlly={readMode ? undefined : toggleAlly}
                  allyEligible={creature.article_type !== 'playerCharacter'}
                />
              ))
            )}
          </div>

          {creaturesDirty && (
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button className="btn btn-sm btn-primary" onClick={save} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
                {saving ? 'Saving…' : <><Save size={12} /> Save Combat State</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Notes ── */}
      {activeTab === 'notes' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <RichEditor
            key={selectedPOI.id}
            content={selectedPOI.content}
            onChange={v => { setContent(v); setDirty(true) }}
            placeholder="Describe the combat scenario… location details, ambush conditions, terrain…"
            readOnly={readMode}
          />
        </div>
      )}

      {/* ── Combatant picker modal ── */}
      {showPicker && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowPicker(false) }}
        >
          <div style={{
            width: 380, background: 'var(--bg-elevated)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            maxHeight: '70vh',
          }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--gold)', marginBottom: 10 }}>
                Add Combatant
              </div>
              <div style={{ position: 'relative' }}>
                <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  className="input"
                  style={{ paddingLeft: 30, height: 32, fontSize: 13 }}
                  placeholder="Search creatures & characters…"
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredPicker.length === 0 ? (
                <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  {pickerSearch ? 'No matches' : 'No creature or character articles yet'}
                </div>
              ) : (
                filteredPicker.map(entry => (
                  <div
                    key={entry.key}
                    style={{
                      display: 'flex', alignItems: 'center',
                      padding: '8px 16px', borderBottom: '1px solid var(--border)',
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.displayName}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{entry.subtitle}</div>
                    </div>
                    <button
                      className="btn btn-sm"
                      onClick={() => addCombatant(entry, false)}
                      title="Add with average HP"
                      style={{ padding: '3px 8px', fontSize: 11, flexShrink: 0 }}
                    >
                      Avg HP
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => addCombatant(entry, true)}
                      title="Add with rolled HP"
                      style={{ padding: '3px 6px', flexShrink: 0 }}
                    >
                      <Dices size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button className="btn" onClick={() => { setShowPicker(false); setPickerSearch('') }} style={{ width: '100%', justifyContent: 'center' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coordinates footer */}
      <div style={{ padding: '6px 14px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
        <span>x: {selectedPOI.x.toFixed(1)}%</span>
        <span>y: {selectedPOI.y.toFixed(1)}%</span>
        {!dirty && !creaturesDirty && <span style={{ marginLeft: 'auto', color: 'var(--gold-dim)' }}>Saved</span>}
      </div>
    </div>
  )
}