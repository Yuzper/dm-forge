// path: src/components/CombatPanel.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/store'
import { X, Trash2, Plus, Search, Save, Dices } from 'lucide-react'
import RichEditor from './RichEditor'
import CombatantRow from './CombatantRow'
import type { CombatEncounter, CombatCreature, ArticleSummary, LootItem } from '../types'
import { parseStatBlock, calcHpAverage, rollHp, parseLootTable, generateLoot } from '../types'
import { useConfirmDelete } from '../hooks/useConfirmDelete'

type Tab = 'general' | 'combatants'

export default function CombatPanel({ readMode }: { readMode?: boolean }) {
  const { selectedPOI, poiPanelOpen, selectPOI, updatePOI, deletePOI } = useStore()
  const { currentCampaign } = useStore()

  // ── General text state ─────────────────────────────────────────────────────
  const [label, setLabel] = useState('')
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const { confirming: confirmDelete, trigger: triggerDelete } = useConfirmDelete()

  // ── Combat state ───────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const [encounter, setEncounter] = useState<CombatEncounter | null>(null)
  const [creatures, setCreatures] = useState<CombatCreature[]>([])
  const [creaturesDirty, setCreaturesDirty] = useState(false)

  // ── Picker state ───────────────────────────────────────────────────────────
  const [showPicker, setShowPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerArticles, setPickerArticles] = useState<ArticleSummary[]>([])

  // ── Pending ref for auto-save on close ─────────────────────────────────────
  const pendingRef = useRef({
    selectedPOI, label, content, dirty,
    encounter, creatures, creaturesDirty,
  })
  pendingRef.current = { selectedPOI, label, content, dirty, encounter, creatures, creaturesDirty }

  // ── Load POI data ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedPOI) return
    setLabel(selectedPOI.label)
    setContent(selectedPOI.content)
    setDirty(false)
    setCreaturesDirty(false)
    setActiveTab('general')
  }, [selectedPOI?.id])

  // ── Load encounter + creatures when tab opens ──────────────────────────────
  useEffect(() => {
    if (!selectedPOI || activeTab !== 'combatants') return
    ;(async () => {
      const enc = await window.api.getCombatEncounter(selectedPOI.id)
      setEncounter(enc)
      const raw = await window.api.getCombatCreatures(enc.id)
      setCreatures(raw)
    })()
  }, [selectedPOI?.id, activeTab])

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

  // ── Load picker articles (creature + character) ────────────────────────────
  useEffect(() => {
    if (!showPicker) return
    const { currentCampaign } = useStore.getState()
    if (!currentCampaign) return
    Promise.all([
      window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'creature' }),
      window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'character' }),
    ]).then(([creatures, characters]) => {
      setPickerArticles([...creatures, ...characters].sort((a, b) => a.title.localeCompare(b.title)))
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
  const addCombatant = async (article: ArticleSummary, useRoll = false) => {
    if (!encounter) return
    const full = await window.api.getArticle(article.id)
    if (!full) return
    const sb = parseStatBlock(full.statblock)
    const maxHp = useRoll ? rollHp(sb.hpDice) : calcHpAverage(sb.hpDice)
    const newCreature = await window.api.addCombatCreature(encounter.id, article.id, maxHp)
    setCreatures(prev => [...prev, newCreature])
    setShowPicker(false)
    setPickerSearch('')
    setActiveTab('combatants')
  }

  // ── Open stat block window ─────────────────────────────────────────────────
  const openStatBlock = useCallback((articleId: number) => {
    window.api.openStatBlockWindow(articleId)
  }, [])

  // ── Loot generation with species chain ─────────────────────────────────────
  const handleLootGenerated = useCallback(async (creatureId: number, result: LootItem[], articleId: number): Promise<LootItem[]> => {
    const full = await window.api.getArticle(articleId)
    if (full && (full.article_type === 'character' || full.article_type === 'playerCharacter' || full.article_type === 'creature')) {
      try {
        const tracks = JSON.parse(full.tracks) as Record<string, string>
        const speciesName = tracks['Species']
        if (speciesName && currentCampaign) {
          const speciesArticle = await window.api.getArticleByTitle(speciesName, currentCampaign.id)
          if (speciesArticle) {
            const speciesTable = parseLootTable(speciesArticle.loot_table)
            const speciesRoll = generateLoot(speciesTable.items)
            result = [...result, ...speciesRoll]
          }
        }
      } catch (e) {
        console.error('Species loot error:', e)
      }
    }
    await window.api.saveLootResult(creatureId, result)
    return result
  }, [currentCampaign])

  // ── Sort creatures by initiative (desc, nulls last) ────────────────────────
  const sortedCreatures = [...creatures].sort((a, b) => {
    if (a.initiative === null && b.initiative === null) return a.instance_number - b.instance_number
    if (a.initiative === null) return 1
    if (b.initiative === null) return -1
    return b.initiative - a.initiative
  })

  // ── Picker filter ──────────────────────────────────────────────────────────
  const filteredPicker = pickerArticles.filter(a =>
    a.title.toLowerCase().includes(pickerSearch.toLowerCase())
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
        {/* Combat icon */}
        <div style={{
          width: 28, height: 28, borderRadius: 4,
          background: '#e0555522', border: '1px solid #e0555555',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {/* Using text sword since we can't import here — icon comes from POI marker */}
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

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {(['general', 'combatants'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: '8px 0', background: 'none', border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--gold)' : '2px solid transparent',
              color: activeTab === tab ? 'var(--gold)' : 'var(--text-muted)',
              fontSize: 12, fontWeight: activeTab === tab ? 600 : 400,
              cursor: 'pointer', transition: 'all 120ms ease',
              textTransform: 'capitalize', fontFamily: 'var(--font-ui)',
            }}
          >
            {tab}
            {tab === 'combatants' && creatures.length > 0 && (
              <span style={{
                marginLeft: 6, fontSize: 10, fontWeight: 700,
                background: 'var(--gold-glow)', color: 'var(--gold)',
                padding: '1px 5px', borderRadius: 99,
                border: '1px solid var(--border-gold)',
              }}>
                {creatures.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── General tab ── */}
      {activeTab === 'general' && (
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

      {/* ── Combatants tab ── */}
      {activeTab === 'combatants' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Add combatant button */}
          {!readMode && (
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <button
                className="btn btn-sm"
                onClick={() => setShowPicker(true)}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <Plus size={13} /> Add Combatant
              </button>
            </div>
          )}

          {/* Creature list */}
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
                />
              ))
            )}
          </div>

          {/* Footer save */}
          {creaturesDirty && (
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button className="btn btn-sm btn-primary" onClick={save} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
                {saving ? 'Saving…' : <><Save size={12} /> Save Combat State</>}
              </button>
            </div>
          )}
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
                filteredPicker.map(article => (
                  <div
                    key={article.id}
                    style={{
                      display: 'flex', alignItems: 'center',
                      padding: '8px 16px', borderBottom: '1px solid var(--border)',
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {article.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{article.article_type}</div>
                    </div>
                    {/* Add with average HP */}
                    <button
                      className="btn btn-sm"
                      onClick={() => addCombatant(article, false)}
                      title="Add with average HP"
                      style={{ padding: '3px 8px', fontSize: 11, flexShrink: 0 }}
                    >
                      Avg HP
                    </button>
                    {/* Add with rolled HP */}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => addCombatant(article, true)}
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