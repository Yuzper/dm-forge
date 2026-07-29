// path: src/components/wiki/ArticleEditor.tsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useStore } from '../../store/store'
import { useMenuClose } from '../../hooks/useMenuClose'
import {
  Plus, Trash2, Check, X, ChevronLeft, ScrollText,
  MoreHorizontal, Image as ImageIcon, Link,
  ShoppingBag, ChevronDown, ChevronRight,
} from 'lucide-react'
import RichEditor from '../RichEditor'
import type { Article, ArticleSummary, ArticleType, MasterLootTable, LootItem } from '../../types'
import StatBlockEditor from '../StatBlockEditor'
import { crToXp, CR_OPTIONS } from '../../utils/encounterBudget'
import { parseStatBlock, parseItemStatBlock, itemBlockHasData } from '../../types'
import StatBlockView from '../StatBlockView'
import ItemStatBlockEditor from '../ItemStatBlockEditor'
import ItemStatBlockView from '../ItemStatBlockView'
import LootTableEditor from '../LootTableEditor'
import LootTableView from '../LootTableView'
import { parseLootTable } from '../../types'
import SectionDivider from '../SectionDivider'
import { InWorldDatePicker } from '../InWorldDatePicker'
import { TIMELINE_DATE_FIELDS, parseMilestones, type Milestone } from '../../constants/timelineDates'
import LocationMapSection from '../LocationMapSection'
import AudienceControl from '../AudienceControl'
import TrackVisibilityControl, { effectiveTrackMode, trackModePlayers } from './TrackVisibilityControl'
import type { TrackVisibility, TrackVisMode } from '../../types'
import QuestSubstepsSection, { parseSubsteps } from '../QuestSubstepsSection'
import type { Substep } from '../QuestSubstepsSection'
import QuestRewardSection, { parseReward } from '../QuestRewardSection'
import type { QuestReward } from '../QuestRewardSection'

import {
  ARTICLE_TYPES, ARTICLE_TRACKS, TRACK_VALUE_COLORS, MULTI_TRACKS, trackValues, stringifyMulti,
  getTrackTags, parseTags, formatTrackName, sidebarSectionLabel, imgBtnStyle, addBannerStyle,
} from './wikiConstants'
import { ArticleRelationsPanel, RelationWebsSection, MemberCountSection, AffiliationsSection, GeographySection } from './ArticleRelationsPanel'
import { ClocksSection } from '../clocks/ClocksSection'

// Item Type/Rarity live in the item stat block; the sidebar tracks are just a
// mirror for quick display, so reseed them from the stat block on every load
// rather than trusting whatever was last persisted in the tracks JSON.
function withItemTracks(article: Article): Record<string, string> {
  let tracks: Record<string, string> = {}
  try { tracks = JSON.parse(article.tracks) } catch { /* ignore */ }
  if (article.article_type === 'item') {
    const ib = parseItemStatBlock(article.item_block)
    if (ib.category) tracks = { ...tracks, Type: ib.category }
    if (ib.rarity) tracks = { ...tracks, Rarity: ib.rarity }
  }
  return tracks
}

// ─── Track Row ─────────────────────────────────────────────────────────────────

function TrackRow({ trackKey, name, options, value, onChange, dynamicOptions, visControl }: {
  trackKey: string; name: string; options: string[]; value: string
  onChange: (v: string) => void; dynamicOptions?: string[]; visControl?: React.ReactNode
}) {
  // One alphabetical, de-duplicated list regardless of how the options were
  // assembled (static list, dynamic article names, or a merge of both).
  const resolvedOptions = Array.from(new Set(dynamicOptions ?? options)).sort((a, b) => a.localeCompare(b))
  const isCustomOnly = dynamicOptions === undefined && options.length === 0
  const [customMode, setCustomMode] = useState(() => isCustomOnly || (value !== '' && !resolvedOptions.includes(value)))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setCustomMode(isCustomOnly || (value !== '' && !resolvedOptions.includes(value)))
  }, [trackKey])

  useEffect(() => {
    if (customMode && !isCustomOnly) inputRef.current?.focus()
  }, [customMode])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 84, flexShrink: 0 }}>{formatTrackName(name)}</span>
      {customMode ? (
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          <input ref={inputRef} className="input" style={{ height: 28, fontSize: 12, flex: 1 }}
            value={value} placeholder={isCustomOnly ? `${name}…` : 'Custom…'}
            onChange={e => onChange(e.target.value)} />
          {!isCustomOnly && (
            <button onClick={() => { setCustomMode(false); onChange('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 4px', display: 'flex', alignItems: 'center' }}>
              <X size={11} />
            </button>
          )}
        </div>
      ) : (
        <select className="input" style={{ height: 28, fontSize: 12, flex: 1 }} value={value}
          onChange={e => { if (e.target.value === '__custom__') { setCustomMode(true); onChange('') } else onChange(e.target.value) }}>
          <option value="">— none —</option>
          {resolvedOptions.map(o => <option key={o} value={o}>{o}</option>)}
          <option value="__custom__">Custom…</option>
        </select>
      )}
      {visControl}
    </div>
  )
}

// Multi-value sibling of TrackRow (Allies, Rivals, …): holds a list of entries
// stored as a JSON array in the same track slot. Existing entries show as
// removable chips; a picker (dynamic article names + Custom…) adds more.
function MultiTrackRow({ name, value, onChange, dynamicOptions, visControl }: {
  name: string; value: string; onChange: (v: string) => void; dynamicOptions?: string[]; visControl?: React.ReactNode
}) {
  const entries = trackValues(value)
  const [customMode, setCustomMode] = useState(false)
  const [customText, setCustomText] = useState('')
  const options = Array.from(new Set(dynamicOptions ?? []))
    .filter(o => !entries.includes(o))
    .sort((a, b) => a.localeCompare(b))

  const add = (v: string) => {
    const t = v.trim()
    if (!t || entries.includes(t)) return
    onChange(stringifyMulti([...entries, t]))
  }
  const remove = (v: string) => onChange(stringifyMulti(entries.filter(e => e !== v)))
  const commitCustom = () => { add(customText); setCustomText(''); setCustomMode(false) }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 84, flexShrink: 0, marginTop: 5 }}>{formatTrackName(name)}</span>
      {visControl && <span style={{ order: 2, marginTop: 5 }}>{visControl}</span>}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        {entries.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {entries.map(e => (
              <span key={e} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 4px 2px 8px', borderRadius: 99, border: '1px solid var(--border-light)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                {e}
                <button onClick={() => remove(e)} title="Remove"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', alignItems: 'center' }}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        {customMode ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <input autoFocus className="input" style={{ height: 28, fontSize: 12, flex: 1 }} value={customText}
              placeholder="Custom…" onChange={e => setCustomText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitCustom() } }} />
            <button onClick={commitCustom} className="btn btn-sm" style={{ fontSize: 11 }}>Add</button>
            <button onClick={() => { setCustomMode(false); setCustomText('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 4px', display: 'flex', alignItems: 'center' }}>
              <X size={11} />
            </button>
          </div>
        ) : (
          <select className="input" style={{ height: 28, fontSize: 12 }} value=""
            onChange={e => { const v = e.target.value; if (!v) return; if (v === '__custom__') setCustomMode(true); else add(v) }}>
            <option value="">+ Add {formatTrackName(name).toLowerCase()}…</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
            <option value="__custom__">Custom…</option>
          </select>
        )}
      </div>
    </div>
  )
}
// ─── Article Menu ──────────────────────────────────────────────────────────────

function ArticleMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useMenuClose(open, menuRef, v => { if (!v) setConfirmDelete(false); setOpen(v) })

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setOpen(o => !o); setConfirmDelete(false) }} style={{ color: 'var(--text-muted)' }}>
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', minWidth: 140, zIndex: 50, overflow: 'hidden' }}>
          <button
            onClick={e => { e.stopPropagation(); if (!confirmDelete) { setConfirmDelete(true); return } onDelete(); setOpen(false) }}
            className="menu-item menu-item-danger" style={confirmDelete ? { color: 'var(--danger-hover)' } : undefined}>
            <Trash2 size={13} /> {confirmDelete ? 'Confirm delete' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}
// ─── Article Editor ────────────────────────────────────────────────────────────

// ── Creature variant types ─────────────────────────────────────────────────────

interface CreatureVariant {
  id: string
  name: string
  cr: string
  statblock: ReturnType<typeof parseStatBlock>
  loot_table_id: number | null
  loot_table: string  // JSON LootTable
}

function parseCreatureVariants(raw: string): CreatureVariant[] {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && 'name' in parsed[0]) {
      return parsed.map(v => ({
        id: v.id || `v_${Math.random().toString(36).slice(2)}`,
        name: v.name || 'Variant',
        // Keep unset CR as '' in data — '—' is only a display placeholder. Storing
        // '—' leaks a non-CR string that breaks the encounter balancer downstream.
        cr: v.cr || '',
        statblock: parseStatBlock(typeof v.statblock === 'string' ? v.statblock : JSON.stringify(v.statblock)),
        loot_table_id: v.loot_table_id ?? null,
        loot_table: v.loot_table || '{"name":"Loot","items":[]}',
      }))
    }
  } catch {}
  // Legacy: single statblock object → wrap as one variant
  const sb = parseStatBlock(raw)
  if (sb.hp > 0 || sb.ac > 0 || sb.actions.length > 0) {
    return [{ id: 'v_legacy', name: 'Standard', cr: '', statblock: sb, loot_table_id: null, loot_table: '{"name":"Loot","items":[]}' }]
  }
  return []
}

const STATBLOCK_TYPES: ArticleType[] = ['character', 'playerCharacter']
const LOOT_TYPES: ArticleType[] = ['character', 'playerCharacter']

// ── Creature Variants Section ──────────────────────────────────────────────────

function CreatureVariantsSection({
  variants, masterTables, readMode, articleTitle: _articleTitle, lootSuggestions, onChange,
}: {
  variants: CreatureVariant[]
  masterTables: MasterLootTable[]
  readMode: boolean
  articleTitle: string
  lootSuggestions: string[]
  onChange: (v: CreatureVariant[]) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(variants[0]?.id ?? null)

  const addVariant = () => {
    const id = `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const newV: CreatureVariant = {
      id, name: 'New Variant', cr: '',
      statblock: parseStatBlock('{}'),
      loot_table_id: null,
      loot_table: '{"name":"Loot","items":[]}',
    }
    onChange([...variants, newV])
    setExpandedId(id)
  }

  const updateVariant = (id: string, patch: Partial<CreatureVariant>) => {
    onChange(variants.map(v => v.id === id ? { ...v, ...patch } : v))
  }

  const removeVariant = (id: string) => {
    const next = variants.filter(v => v.id !== id)
    onChange(next)
    if (expandedId === id) setExpandedId(next[0]?.id ?? null)
  }

  return (
    <div style={{ padding: '0 24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 16px' }}>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border-light), transparent)' }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>Variants</div>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, var(--border-light), transparent)' }} />
      </div>

      {variants.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '24px 16px', textAlign: 'center', border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)' }}>
          <span style={{ fontSize: 13 }}>No variants yet</span>
          {!readMode && <span style={{ fontSize: 11 }}>Add a variant to define combat stats for this creature</span>}
        </div>
      )}

      {variants.map(variant => {
        const isOpen = expandedId === variant.id
        const masterTable = masterTables.find(t => t.id === variant.loot_table_id)
        const extrasTable = parseLootTable(variant.loot_table)
        const sbHasData = variant.statblock.hp > 0 || variant.statblock.ac > 0 || variant.statblock.actions.length > 0

        return (
          <div key={variant.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 8, overflow: 'hidden' }}>
            {/* Header row */}
            <div
              onClick={() => setExpandedId(isOpen ? null : variant.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', background: isOpen ? 'var(--bg-elevated)' : 'transparent', transition: 'background var(--transition)' }}
            >
              {isOpen ? <ChevronDown size={13} color="var(--text-muted)" /> : <ChevronRight size={13} color="var(--text-muted)" />}
              {readMode ? (
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{variant.name}</span>
              ) : (
                <input
                  value={variant.name}
                  onClick={e => e.stopPropagation()}
                  onChange={e => updateVariant(variant.id, { name: e.target.value })}
                  style={{ fontWeight: 600, fontSize: 13, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', flex: 1, minWidth: 0 }}
                  placeholder="Variant name…"
                />
              )}
              <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 99, padding: '1px 8px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                CR {readMode ? (variant.cr || '—') : (
                  <select
                    value={CR_OPTIONS.includes(variant.cr) ? variant.cr : ''}
                    onClick={e => e.stopPropagation()}
                    onChange={e => updateVariant(variant.id, { cr: e.target.value })}
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: 11, color: 'var(--text-secondary)', padding: '1px 2px' }}
                  >
                    <option value="">—</option>
                    {CR_OPTIONS.map(cr => <option key={cr} value={cr}>{cr}</option>)}
                  </select>
                )}
              </span>
              {(() => {
                const xp = crToXp(variant.cr)
                return (
                  <span
                    title={xp === null ? 'Unrecognized CR — no XP' : `${xp.toLocaleString()} XP`}
                    style={{ fontSize: 11, color: xp === null ? 'var(--text-muted)' : 'var(--gold)', background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 99, padding: '1px 8px', flexShrink: 0 }}
                  >
                    {xp === null ? '— XP' : `${xp.toLocaleString()} XP`}
                  </span>
                )
              })()}
              {masterTable && (
                <span style={{ fontSize: 10, color: 'var(--success)', background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 99, padding: '1px 7px', flexShrink: 0 }}>
                  {masterTable.name}
                </span>
              )}
              {!readMode && variants.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); removeVariant(variant.id) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2, flexShrink: 0 }}
                  title="Remove variant"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>

            {/* Expanded body */}
            {isOpen && (
              <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Stat block */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Stat Block</div>
                  {readMode ? (
                    sbHasData
                      ? <StatBlockView statblock={variant.statblock} name={variant.name} articleType="creature" />
                      : <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No stat block — switch to Edit to add</div>
                  ) : (
                    <StatBlockEditor
                      value={variant.statblock}
                      onChange={sb => updateVariant(variant.id, { statblock: sb })}
                    />
                  )}
                </div>

                {/* Loot */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Loot</div>
                  {/* Master table picker */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Master loot table</div>
                    {readMode ? (
                      masterTable
                        ? <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 99, background: 'var(--success-bg)', border: '1px solid var(--success-border)', fontSize: 12, color: 'var(--success)', width: 'fit-content' }}>
                            <ShoppingBag size={11} /> {masterTable.name}
                          </div>
                        : <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No master table</span>
                    ) : (
                      <select
                        className="input" style={{ fontSize: 12 }}
                        value={variant.loot_table_id ?? ''}
                        onChange={e => updateVariant(variant.id, { loot_table_id: e.target.value ? parseInt(e.target.value) : null })}
                      >
                        <option value="">— None —</option>
                        {(['creature', 'vendor', 'location', 'custom'] as const).map(cat => {
                          const group = masterTables.filter(t => t.category === cat)
                          if (!group.length) return null
                          const labels: Record<string, string> = { creature: 'Creature', vendor: 'Vendor', location: 'Location', custom: 'Custom' }
                          return (
                            <optgroup key={cat} label={labels[cat]}>
                              {group.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </optgroup>
                          )
                        })}
                      </select>
                    )}
                  </div>
                  {/* Master table preview */}
                  {readMode && masterTable && (() => {
                    let items: LootItem[] = []
                    try { items = JSON.parse(masterTable.items) } catch {}
                    if (!items.length) return null
                    return <div style={{ marginBottom: 8 }}><LootTableView label={`From ${masterTable.name}`} items={items} tableBadge={masterTable.name} wikiTitles={[]} onItemClick={() => {}} emptyMessage="" /></div>
                  })()}
                  {/* Inline extra items */}
                  {readMode ? (
                    <LootTableView
                      label={masterTable ? 'Extra drops' : 'Loot'}
                      items={extrasTable.items}
                      wikiTitles={[]}
                      onItemClick={() => {}}
                      emptyMessage="No extra items"
                    />
                  ) : (
                    <LootTableEditor
                      value={extrasTable}
                      onChange={t => updateVariant(variant.id, { loot_table: JSON.stringify(t) })}
                      suggestions={lootSuggestions}
                      showPriceWeight
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {!readMode && (
        <button
          onClick={addVariant}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', width: '100%', justifyContent: 'center', transition: 'all var(--transition)' }}
          className="hover-text"
        >
          <Plus size={13} /> Add variant
        </button>
      )}
    </div>
  )
}

function TimelineDatesSection({ articleType, tracks, setTracks, setDirty, readMode, baseYear, renderVis }: {
  articleType: ArticleType
  tracks: Record<string, string>
  setTracks: React.Dispatch<React.SetStateAction<Record<string, string>>>
  setDirty: (v: boolean) => void
  readMode: boolean
  baseYear: number
  // Inline player-visibility eye for a date field / milestone (edit mode only).
  renderVis?: (key: string, isMilestone: boolean) => React.ReactNode
}) {
  // Skip semantic fields already shown in Details (e.g. character Death_Date).
  const typeTracks = ARTICLE_TRACKS[articleType] || {}
  const fields = (TIMELINE_DATE_FIELDS[articleType] ?? []).filter(f => !(f.key in typeTracks))
  const milestones = parseMilestones(tracks.Timeline_Milestones)

  const setField = (key: string, v: string) => { setTracks(prev => ({ ...prev, [key]: v })); setDirty(true) }
  const setMilestones = (list: Milestone[]) => { setTracks(prev => ({ ...prev, Timeline_Milestones: JSON.stringify(list) })); setDirty(true) }
  const addMilestone = () => setMilestones([...milestones, { id: `ms_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label: '', date: '' }])
  const updateMilestone = (id: string, patch: Partial<Milestone>) => setMilestones(milestones.map(m => m.id === id ? { ...m, ...patch } : m))
  const removeMilestone = (id: string) => setMilestones(milestones.filter(m => m.id !== id))

  const fmt = (raw: string) => { try { const d = JSON.parse(raw); return `Day ${d.day}, Year ${d.year}` } catch { return raw } }
  const setFields = [...fields.filter(f => tracks[f.key])]
  const setMs = milestones.filter(m => m.date)

  return (
    <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
      <div style={sidebarSectionLabel}>Timeline</div>
      {readMode ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {setFields.map(f => (
            <div key={f.key} style={{ fontSize: 11 }}><span style={{ color: 'var(--text-muted)' }}>{f.label}: </span><span style={{ color: 'var(--gold)', fontWeight: 600 }}>{fmt(tracks[f.key])}</span></div>
          ))}
          {setMs.map(m => (
            <div key={m.id} style={{ fontSize: 11 }}><span style={{ color: 'var(--text-muted)' }}>{m.label || 'Milestone'}: </span><span style={{ color: 'var(--gold)', fontWeight: 600 }}>{fmt(m.date)}</span></div>
          ))}
          {setFields.length === 0 && setMs.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— not on timeline —</span>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {fields.map(f => (
            <div key={f.key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.label}</span>
                {renderVis?.(f.key, false)}
              </div>
              <InWorldDatePicker value={tracks[f.key] || ''} onChange={v => setField(f.key, v)} label="" baseYear={baseYear} />
            </div>
          ))}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Milestones</span>
              <button onClick={addMilestone} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, background: 'none', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 7px' }}><Plus size={11} /> Add</button>
            </div>
            {milestones.map(m => (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8, padding: 8, border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input className="input" value={m.label} onChange={e => updateMilestone(m.id, { label: e.target.value })} placeholder="Label (e.g. Rebuilt)" style={{ flex: 1, minWidth: 0, fontSize: 12, height: 28 }} />
                  {renderVis?.(m.id, true)}
                  <button onClick={() => removeMilestone(m.id)} title="Remove" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 2, flexShrink: 0 }}><X size={13} /></button>
                </div>
                <InWorldDatePicker value={m.date} onChange={v => updateMilestone(m.id, { date: v })} label="" baseYear={baseYear} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function ArticleEditor({ article, onBack, backLabel = 'Back to Wiki' }: { article: Article; onBack: () => void; backLabel?: string }) {
  const { updateArticle, deleteArticle, navigateToArticleByTitle, getArticleBacklinks, currentCampaign, articles, allArticles, loadAllArticles, setView, setRelationsOpenWebId, setRelationsFocusArticleId, setHintContext, players, loadPlayers } = useStore()

  // Article names per type for the track dropdowns, derived from the store's
  // live list so newly created articles show up immediately. Alphabetical.
  const namesByType = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const a of allArticles) (m[a.article_type] ??= []).push(a.title)
    for (const k in m) m[k].sort((a, b) => a.localeCompare(b))
    return m
  }, [allArticles])
  const factionNames         = namesByType.faction ?? []
  const religionNames        = namesByType.religion ?? []
  const cultureNames         = namesByType.culture ?? []
  const locationNames        = namesByType.location ?? []
  const creatureNames        = namesByType.creature ?? []
  const playerCharacterNames = namesByType.playerCharacter ?? []
  // Quest reward items can link to any item-ish article
  const rewardItemNames = useMemo(
    () => [...(namesByType.item ?? []), ...(namesByType.artifact ?? [])].sort((a, b) => a.localeCompare(b)),
    [namesByType]
  )
  const characterNames = useMemo(
    () => [...(namesByType.character ?? []), ...(namesByType.playerCharacter ?? [])].sort((a, b) => a.localeCompare(b)),
    [namesByType]
  )
  const [masterTables, setMasterTables]       = useState<MasterLootTable[]>([])

  const [title, setTitle]             = useState(article.title)
  const [content, setContent]         = useState(article.content)
  const [articleType, setArticleType] = useState<ArticleType>(article.article_type as ArticleType)
  const [tracks, setTracks]           = useState<Record<string, string>>(() => withItemTracks(article))
  // Per-field player visibility. DM-only metadata, so it saves straight away
  // through the store (not via the article's dirty/save cycle).
  const [trackVis, setTrackVis]       = useState<TrackVisibility>(() => { try { return JSON.parse(article.track_visibility || '{}') } catch { return {} } })
  const [statblock, setStatblock]     = useState(() => parseStatBlock(article.statblock))
  const [variants, setVariants]       = useState<CreatureVariant[]>(() => parseCreatureVariants(article.statblock))
  const [itemBlock, setItemBlock]     = useState(() => parseItemStatBlock(article.item_block))
  const [tags, setTags]               = useState<string[]>(() => parseTags(article.tags))
  const [tagInput, setTagInput]       = useState('')
  const [coverImage, setCoverImage]   = useState<string | null>(article.cover_image || null)
  const [portraitImage, setPortraitImage] = useState<string | null>(article.portrait_image || null)
  const [backlinks, setBacklinks]     = useState<ArticleSummary[]>([])
  const [relationWebs, setRelationWebs] = useState<any[]>([])
  const [relationWebsLoaded, setRelationWebsLoaded] = useState(false)
  const [memberWebs, setMemberWebs] = useState<any[]>([])
  const [dirty, setDirty]             = useState(false)
  const [saving, setSaving]           = useState(false)
  const [readMode, setReadMode]       = useState(true)
  const [savedTick, setSavedTick]     = useState(0)   // bumped after each save — refreshes derived sections

  // Floating hint follows the article mode: reading vs. editing
  useEffect(() => {
    setHintContext(readMode ? 'wiki-article-read' : 'wiki-linking')
    return () => setHintContext(null)
  }, [readMode, setHintContext])

  // Loot — inline extras JSON (extra items layered on top of any linked master table)
  const [lootTableJson, setLootTableJson] = useState(article.loot_table || '{"name":"Loot","items":[]}')
  // Master table FK
  const [lootTableId, setLootTableId] = useState<number | null>(article.loot_table_id ?? null)
  // Quest substeps
  const [substeps, setSubsteps] = useState<Substep[]>(() => parseSubsteps((article as any).substeps))
  // Quest reward — one record per quest (currency / items / information / other)
  const [reward, setReward]     = useState<QuestReward>(() => parseReward((article as any).rewards))

  const hasStatblock = STATBLOCK_TYPES.includes(articleType)
  const hasItemBlock = articleType === 'item'
  const hasLoot      = LOOT_TYPES.includes(articleType)
  const hasMap       = articleType === 'location'
  const hasQuest     = articleType === 'quest'

  const pendingRef = useRef({ title, content, articleType, tracks, statblock, variants, itemBlock, lootTableJson, lootTableId, tags, coverImage, portraitImage, dirty, id: article.id, substeps, reward })
  pendingRef.current = { title, content, articleType, tracks, statblock, variants, itemBlock, lootTableJson, lootTableId, tags, coverImage, portraitImage, dirty, id: article.id, substeps, reward }

  useEffect(() => {
    return () => {
      const p = pendingRef.current
      if (p.dirty) window.api.updateArticle(p.id, {
        title: p.title, content: p.content, article_type: p.articleType,
        tracks: JSON.stringify(p.tracks),
        statblock: p.articleType === 'creature' ? JSON.stringify(p.variants) : JSON.stringify(p.statblock),
        item_block: JSON.stringify(p.itemBlock),
        loot_table: p.lootTableJson, loot_table_id: p.lootTableId,
        tags: JSON.stringify(p.tags), cover_image: p.coverImage, portrait_image: p.portraitImage,
        substeps: JSON.stringify(p.substeps),
        rewards:  JSON.stringify(p.reward),
      })
    }
  }, [])

  useEffect(() => {
    setTitle(article.title); setContent(article.content)
    setArticleType(article.article_type as ArticleType)
    setTracks(() => withItemTracks(article))
    setTrackVis(() => { try { return JSON.parse(article.track_visibility || '{}') } catch { return {} } })
    setStatblock(parseStatBlock(article.statblock))
    setVariants(parseCreatureVariants(article.statblock))
    setItemBlock(parseItemStatBlock(article.item_block))
    setTags(parseTags(article.tags))
    setCoverImage(article.cover_image || null); setPortraitImage(article.portrait_image || null)
    setLootTableJson(article.loot_table || '{"name":"Loot","items":[]}')
    setLootTableId(article.loot_table_id ?? null)
    setSubsteps(parseSubsteps((article as any).substeps))
    setReward(parseReward((article as any).rewards))
    setDirty(false)
  }, [article.id])

  useEffect(() => { getArticleBacklinks(article.title).then(setBacklinks) }, [article.title])

  // ── Per-field player visibility ─────────────────────────────────────────────
  // The roster loads when a campaign is opened, but not on the wiki/article
  // history-restore path — fetch it here so "Some players" is never empty.
  useEffect(() => { if (players.length === 0) loadPlayers() }, [])
  const allPlayers = useMemo(
    () => players.map(p => ({ id: p.id, label: p.display_name || p.username })),
    [players]
  )
  // Saves through the store so `currentArticle` stays in step — writing straight
  // to the DB leaves the in-memory article stale and the eyes read as defaults.
  const persistVis = (next: TrackVisibility) => {
    setTrackVis(next)
    updateArticle(article.id, { track_visibility: JSON.stringify(next) })
  }
  const patchVis = (key: string, isMs: boolean, patch: (prev: { mode: TrackVisMode; players?: number[] }) => { mode: TrackVisMode; players?: number[] }) => {
    const bucket = isMs ? 'milestones' : 'tracks'
    const cur = { ...(trackVis[bucket] ?? {}) }
    cur[key] = patch(cur[key] ?? { mode: effectiveTrackMode(trackVis, key, isMs) })
    persistVis({ ...trackVis, [bucket]: cur })
  }
  const renderVis = (key: string, isMs = false) => (
    <TrackVisibilityControl
      mode={effectiveTrackMode(trackVis, key, isMs)}
      players={trackModePlayers(trackVis, key, isMs)}
      allPlayers={allPlayers}
      onMode={mode => patchVis(key, isMs, prev => ({ mode, players: prev.players ?? [] }))}
      onTogglePlayer={id => patchVis(key, isMs, prev => {
        const set = new Set(prev.players ?? [])
        set.has(id) ? set.delete(id) : set.add(id)
        return { mode: 'restricted', players: [...set] }
      })}
    />
  )

  const reloadRelationWebs = useCallback(() => {
    setRelationWebsLoaded(false)
    ;(window as any).api.listRelationWebsForArticle(article.id).then((ws: any[]) => {
      setRelationWebs(ws || []); setRelationWebsLoaded(true)
    })
    ;(window as any).api.listRelationWebsForMember(article.id).then((ws: any[]) => setMemberWebs(ws || []))
  }, [article.id])
  useEffect(() => { reloadRelationWebs() }, [reloadRelationWebs])

  useEffect(() => {
    if (!currentCampaign) return
    loadAllArticles()
    window.api.getLootTables(currentCampaign.id).then(setMasterTables)
  }, [currentCampaign?.id])

  const save = useCallback(async () => {
    if (!dirty) return
    setSaving(true)
    const statblockJson = articleType === 'creature' ? JSON.stringify(variants) : JSON.stringify(statblock)
    await updateArticle(article.id, {
      title, content, article_type: articleType,
      tracks: JSON.stringify(tracks), statblock: statblockJson,
      item_block: JSON.stringify(itemBlock),
      loot_table: lootTableJson, loot_table_id: lootTableId,
      tags: JSON.stringify(tags), cover_image: coverImage, portrait_image: portraitImage,
      substeps: JSON.stringify(substeps),
      rewards:  JSON.stringify(reward),
    })
    setDirty(false); setSaving(false); setSavedTick(t => t + 1)
  }, [article.id, dirty, title, content, articleType, tracks, statblock, variants, itemBlock, lootTableJson, lootTableId, tags, coverImage, portraitImage, substeps, reward, updateArticle])

  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(save, 1500)
    return () => clearTimeout(t)
  }, [dirty, title, content, articleType, tracks, statblock, variants, itemBlock, lootTableJson, lootTableId, tags, coverImage, portraitImage])

  const pickImage = async (setter: (v: string | null) => void) => {
    const path = await window.api.selectImageFile()
    if (!path) return
    const full = await window.api.getImagePath(path)
    setter(full.replace('file://', '')); setDirty(true)
  }

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!t || tags.includes(t)) return
    setTags(prev => [...prev, t]); setTagInput(''); setDirty(true)
  }
  const removeTag = (tag: string) => { setTags(prev => prev.filter(t => t !== tag)); setDirty(true) }

  // A quest's Player_Character only means anything for personal quests — hide it
  // otherwise so the Details panel isn't offering an irrelevant field.
  const currentTypeTracks = Object.entries(ARTICLE_TRACKS[articleType] || {})
    .filter(([name]) => !(articleType === 'quest' && name === 'Player_Character' && tracks.Type !== 'Personal'))
  const statblockHasData = statblock.ac > 0 || statblock.hp > 0 || statblock.traits.length > 0 || statblock.actions.length > 0

  const lootSuggestions = articles.filter(a => ['item', 'artifact', 'note'].includes(a.article_type)).map(a => a.title)

  // For read-mode loot display — delegates to LootTableView
  const renderLootReadMode = (items: LootItem[], label: string, tableBadge?: string) => (
    <LootTableView
      label={label}
      items={items}
      tableBadge={tableBadge}
      wikiTitles={articles.map(a => a.title)}
      onItemClick={name => {
        if (articles.some(a => a.title.toLowerCase() === name.toLowerCase()))
          navigateToArticleByTitle(name)
      }}
      emptyMessage="No items — switch to Edit to add"
    />
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0, display: 'flex', alignItems: 'stretch', minHeight: 48 }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 16px', background: 'transparent', border: 'none', borderRight: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'color var(--transition)' }}
          className="hover-text">
          <ChevronLeft size={14} /> {backLabel}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', flex: 1, minWidth: 0 }}>
          <input value={title} onChange={e => { setTitle(e.target.value); setDirty(true) }} readOnly={readMode}
            style={{ background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '0.03em', width: '100%', cursor: readMode ? 'default' : 'text' }}
            placeholder="Article title…" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', borderLeft: '1px solid var(--border)', flexShrink: 0 }}>
          <AudienceControl entityType="article" entityId={article.id} />
          {readMode ? (
            <button className="btn btn-sm" onClick={() => setReadMode(false)}>Edit</button>
          ) : (
            <>
              {dirty
                ? <button className="btn btn-sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : <><Check size={12} /> Save</>}</button>
                : <span style={{ fontSize: 11, color: 'var(--gold-dim)' }}>Saved</span>
              }
              <button className="btn btn-sm btn-ghost" onClick={() => setReadMode(true)}>Done</button>
            </>
          )}
          <ArticleMenu onDelete={async () => { await deleteArticle(article.id); onBack() }} />
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Banner */}
        {coverImage ? (
          <div style={{ height: 200, position: 'relative', overflow: 'hidden' }}>
            <img src={`file://${coverImage}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.7) 100%)' }} />
            {!readMode && (
              <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6 }}>
                <button onClick={() => pickImage(setCoverImage)} style={imgBtnStyle}><ImageIcon size={11} /> Change banner</button>
                <button onClick={() => { setCoverImage(null); setDirty(true) }} style={{ ...imgBtnStyle, color: '#e05555', borderColor: 'rgba(224,85,85,0.4)' }}><X size={11} /> Remove</button>
              </div>
            )}
          </div>
        ) : !readMode ? (
          <button onClick={() => pickImage(setCoverImage)} style={addBannerStyle}
            className="hover-bg">
            <ImageIcon size={13} /> Add banner image
          </button>
        ) : null}

        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          {/* Main content */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Type picker */}
            {!readMode && (
              <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {ARTICLE_TYPES.map(t => {
                  const Icon = t.icon; const active = t.value === articleType
                  return (
                    <button key={t.value} onClick={() => { setArticleType(t.value); setDirty(true) }} style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 99,
                      border: `1px solid ${active ? t.color + '88' : 'var(--border-light)'}`,
                      background: active ? `${t.color}18` : 'transparent',
                      color: active ? t.color : 'var(--text-muted)',
                      fontSize: 11, cursor: 'pointer', transition: 'all 120ms ease',
                    }}>
                      <Icon size={9} /> {t.label}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Editor */}
            <div style={{ padding: '0 8px' }}>
              <RichEditor key={article.id} content={content} onChange={v => { setContent(v); setDirty(true) }}
                placeholder="Start writing… Use [[ to link wiki articles, @@ for spells, \\ for sessions."
                onWikiLinkClick={navigateToArticleByTitle} expandable readOnly={readMode} excludeTitle={title} />
            </div>

            {/* Stat block — non-creature types */}
            {hasStatblock && (
              <div style={{ padding: '0 24px 32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 20px' }}>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border-light), transparent)' }} />
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>Stat Block</div>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, var(--border-light), transparent)' }} />
                </div>
                {readMode ? (
                  statblockHasData
                    ? <StatBlockView statblock={statblock} name={title} articleType={articleType} />
                    : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '24px 16px', textAlign: 'center', border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)' }}>
                        <span style={{ fontSize: 13 }}>No stat block yet</span>
                        <span style={{ fontSize: 11 }}>Switch to Edit mode to add combat stats</span>
                      </div>
                ) : <StatBlockEditor value={statblock} onChange={sb => { setStatblock(sb); setDirty(true) }} showLevel={articleType === 'playerCharacter' || articleType === 'character'} showCR={articleType === 'character'} />}
              </div>
            )}

            {/* Item stat block — magic-item "Wondrous item, uncommon" block */}
            {hasItemBlock && (
              <div style={{ padding: '0 24px 32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 20px' }}>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border-light), transparent)' }} />
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>Item Stats</div>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, var(--border-light), transparent)' }} />
                </div>
                {readMode ? (
                  itemBlockHasData(itemBlock)
                    ? <ItemStatBlockView
                        itemBlock={itemBlock}
                        name={title}
                        image={portraitImage ? `file://${portraitImage}` : coverImage ? `file://${coverImage}` : null}
                      />
                    : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '24px 16px', textAlign: 'center', border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)' }}>
                        <span style={{ fontSize: 13 }}>No item stats yet</span>
                        <span style={{ fontSize: 11 }}>Switch to Edit mode to add type, rarity, and properties</span>
                      </div>
                ) : <ItemStatBlockEditor value={itemBlock} onChange={ib => {
                      setItemBlock(ib)
                      // Mirror the item-block Type/Rarity into the article's Type/Rarity
                      // tracks — they drive the hover card, timeline and relation styling,
                      // and there's no separate input for them. Keep auto-tags in sync too.
                      setTracks(prev => {
                        if ((prev.Type ?? '') === ib.category && (prev.Rarity ?? '') === ib.rarity) return prev
                        const updated = { ...prev, Type: ib.category, Rarity: ib.rarity }
                        const oldTrackTags = getTrackTags(prev)
                        const newTrackTags = getTrackTags(updated)
                        setTags(prevTags => {
                          const manualTags = prevTags.filter(t => !oldTrackTags.includes(t))
                          return Array.from(new Set([...manualTags, ...newTrackTags]))
                        })
                        return updated
                      })
                      setDirty(true)
                    }} />}
              </div>
            )}

            {/* Creature variants section */}
            {articleType === 'creature' && (
              <CreatureVariantsSection
                variants={variants}
                masterTables={masterTables}
                readMode={readMode}
                articleTitle={title}
                lootSuggestions={lootSuggestions}
                onChange={v => { setVariants(v); setDirty(true) }}
              />
            )}

            {/* Map section */}
            {hasMap && (
              <div style={{ padding: '0 24px 32px' }}>
                <SectionDivider label="Maps" />
                <LocationMapSection articleId={article.id} readMode={readMode} campaignId={currentCampaign!.id} />
              </div>
            )}

            {/* Quest substeps section */}
            {hasQuest && (
              <div style={{ padding: '0 24px 32px' }}>
                <SectionDivider label="Substeps" />
                <QuestSubstepsSection
                  articleId={article.id}
                  substeps={substeps}
                  readMode={readMode}
                  onChange={steps => { setSubsteps(steps); setDirty(true) }}
                />
              </div>
            )}

            {/* Quest rewards section */}
            {hasQuest && (
              <div style={{ padding: '0 24px 32px' }}>
                <SectionDivider label="Reward" />
                <QuestRewardSection
                  reward={reward}
                  readMode={readMode}
                  itemSuggestions={rewardItemNames}
                  onOpenArticle={navigateToArticleByTitle}
                  onChange={r => { setReward(r); setDirty(true) }}
                />
              </div>
            )}

            {/* Loot / Inventory section */}
            {hasLoot && (() => {
              const extrasTable = parseLootTable(lootTableJson)
              const masterTable = masterTables.find(t => t.id === lootTableId)

              return (
                <div style={{ padding: '0 24px 32px' }}>
                  <SectionDivider label={extrasTable.name || 'Loot'} />

                  {/* Master loot table picker */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                      Master loot table
                    </div>
                    {readMode ? (
                      masterTable ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 99, background: 'var(--success-bg)', border: '1px solid var(--success-border)', fontSize: 12, color: 'var(--success)', width: 'fit-content' }}>
                          <ShoppingBag size={11} /> {masterTable.name}
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No master table — using inline items only</span>
                      )
                    ) : (
                      <select className="input" style={{ fontSize: 12 }} value={lootTableId ?? ''} onChange={e => { setLootTableId(e.target.value ? parseInt(e.target.value) : null); setDirty(true) }}>
                        <option value="">— None (inline items only) —</option>
                        {(['creature', 'vendor', 'location', 'custom'] as const).map(cat => {
                          const group = masterTables.filter(t => t.category === cat)
                          if (group.length === 0) return null
                          const labels: Record<string, string> = { creature: 'Creature', vendor: 'Vendor', location: 'Location', custom: 'Custom' }
                          return (
                            <optgroup key={cat} label={labels[cat]}>
                              {group.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </optgroup>
                          )
                        })}
                      </select>
                    )}
                  </div>

                  {/* Show master table items preview in read mode */}
                  {readMode && masterTable && (() => {
                    let masterItems: LootItem[] = []
                    try { masterItems = JSON.parse(masterTable.items) } catch {}
                    if (masterItems.length === 0) return null
                    return (
                      <div style={{ marginBottom: 12 }}>
                        {renderLootReadMode(masterItems, `From ${masterTable.name}`, masterTable.name)}
                      </div>
                    )
                  })()}

                  {/* Extras / inline items */}
                  <div>
                    {readMode ? (
                      renderLootReadMode(
                        extrasTable.items,
                        masterTable ? 'Extra drops' : 'Loot',
                      )
                    ) : (
                      <LootTableEditor
                        value={extrasTable}
                        onChange={t => { setLootTableJson(JSON.stringify(t)); setDirty(true) }}
                        suggestions={lootSuggestions}
                        showPriceWeight={['creature', 'character', 'playerCharacter'].includes(articleType)}
                      />
                    )}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Right sidebar */}
          <div style={{ width: 260, flexShrink: 0, borderLeft: '1px solid var(--border)', position: 'sticky', top: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
              <div style={sidebarSectionLabel}>{article.title}</div>
              {portraitImage ? (
                <div style={{ position: 'relative', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <img src={`file://${portraitImage}`} style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' }} />
                  {!readMode && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: 0, transition: 'all 200ms ease' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.5)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0'; (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0)' }}>
                      <button onClick={() => pickImage(setPortraitImage)} style={imgBtnStyle}><ImageIcon size={11} /> Change</button>
                      <button onClick={() => { setPortraitImage(null); setDirty(true) }} style={{ ...imgBtnStyle, color: '#e05555', borderColor: 'rgba(224,85,85,0.4)' }}><X size={11} /> Remove</button>
                    </div>
                  )}
                </div>
              ) : !readMode ? (
                <button onClick={() => pickImage(setPortraitImage)} style={{ width: '100%', aspectRatio: '3/4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--bg-elevated)', border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, transition: 'all 120ms ease' }}
                  className="hover-gold-border-strong">
                  <ImageIcon size={22} strokeWidth={1} /> Add portrait
                </button>
              ) : null}
            </div>

            {currentTypeTracks.length > 0 && (
              <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                <div style={sidebarSectionLabel}>Details</div>
                {readMode ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {currentTypeTracks.map(([trackName]) => {
                      const val = tracks[trackName]
                      if (!val) return null
                      if (trackName === 'In_World_Date' || trackName === 'Death_Date') {
                        let display = val
                        try { const d = JSON.parse(val); display = `Day ${d.day}, Year ${d.year}` } catch {}
                        const dateColor = trackName === 'Death_Date' ? '#9b7de8' : 'var(--gold)'
                        const dateBg = trackName === 'Death_Date' ? 'rgba(155,125,232,0.1)' : 'rgba(200,168,75,0.1)'
                        const dateBorder = trackName === 'Death_Date' ? 'rgba(155,125,232,0.3)' : 'rgba(200,168,75,0.3)'
                        return (
                          <div key={trackName} style={{ fontSize: 11, fontWeight: 600, color: dateColor, padding: '3px 10px', borderRadius: 99, border: `1px solid ${dateBorder}`, background: dateBg }}>
                            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{formatTrackName(trackName)}: </span>{display}
                          </div>
                        )
                      }
                      // Multi-value tracks (Allies/Rivals) render their entries
                      // joined; single-value tracks keep their status colour.
                      const vals = trackValues(val)
                      if (vals.length === 0) return null
                      const color = vals.length === 1 ? (TRACK_VALUE_COLORS[vals[0]] || '#8a8a8a') : '#8a8a8a'
                      return (
                        <div key={trackName} style={{ fontSize: 11, fontWeight: 600, color, padding: '3px 10px', borderRadius: 99, border: `1px solid ${color}44`, background: `${color}12` }}>
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{formatTrackName(trackName)}: </span>{vals.join(', ')}
                        </div>
                      )
                    })}
                    {currentTypeTracks.every(([n]) => !tracks[n]) && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— none set —</span>}
                  </div>
                ) : (
                  currentTypeTracks.map(([trackName, options]) => {
                    // Item Type and Rarity are owned by the Item Stats block — show them read-only here
                    if (articleType === 'item' && (trackName === 'Type' || trackName === 'Rarity')) {
                      const val = tracks[trackName]
                      return (
                        <div key={articleType + trackName} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 84, flexShrink: 0 }}>{trackName}</span>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <span style={{ fontSize: 12, color: val ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{val || '—'}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>set in Item Stats</span>
                            <span style={{ marginLeft: 'auto' }}>{renderVis(trackName)}</span>
                          </div>
                        </div>
                      )
                    }
                    if (trackName === 'In_World_Date' || trackName === 'Death_Date') {
                      return (
                        <div key={articleType + trackName} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 84, flexShrink: 0 }}>{formatTrackName(trackName)}</span>
                          {renderVis(trackName)}
                          <div style={{ flex: 1 }}>
                            <InWorldDatePicker
                              value={tracks[trackName] || ''}
                              onChange={v => {
                                setTracks(prev => {
                                  const updated = { ...prev, [trackName]: v }
                                  // Auto-set Vitality to Dead when Death_Date is given
                                  if (trackName === 'Death_Date' && v) {
                                    updated['Vitality'] = 'Dead'
                                  }
                                  return updated
                                })
                                setDirty(true)
                              }}
                              label=""
                            />
                          </div>
                        </div>
                      )
                    }
                    // Track values that pull their suggestions from live article
                    // titles rather than a fixed enum. Shared by TrackRow and the
                    // multi-value MultiTrackRow.
                    const dynamicOptions =
                      trackName === 'Religion'           ? religionNames :
                      trackName === 'Culture'            ? cultureNames :
                      trackName === 'Faction'            ? factionNames :
                      trackName === 'Species'            ? [...(ARTICLE_TRACKS[articleType]?.Species ?? []), ...creatureNames] :
                      trackName === 'Location'           ? locationNames :
                      trackName === 'Within'             ? locationNames.filter(n => n !== title) :
                      trackName === 'HQ'                 ? locationNames :
                      trackName === 'Ruler/Leader'       ? characterNames :
                      trackName === 'Controlled_By'      ? factionNames :
                      trackName === 'Owner'              ? characterNames :
                      trackName === 'Sender'             ? characterNames :
                      trackName === 'Intended_Recipient' ? characterNames :
                      trackName === 'Leader'             ? characterNames :
                      trackName === 'Quest_Giver'        ? characterNames :
                      trackName === 'Player_Character'   ? playerCharacterNames :
                      trackName === 'Allies'             ? [...characterNames, ...factionNames, ...religionNames] :
                      trackName === 'Rivals'             ? [...characterNames, ...factionNames, ...religionNames] :
                      trackName === 'Sacred_Sites'       ? locationNames :
                      trackName === 'Domains'            ? (ARTICLE_TRACKS[articleType]?.Domains ?? []) :
                      undefined

                    // Keep the manual-tag / track-tag reconciliation in one place;
                    // both row kinds commit through it.
                    const commit = (v: string) => {
                      setTracks(prev => {
                        const updated = { ...prev, [trackName]: v }
                        // Leaving a personal quest hides Player_Character —
                        // drop the value so it can't linger unseen.
                        if (articleType === 'quest' && trackName === 'Type' && v !== 'Personal') {
                          delete updated.Player_Character
                        }
                        const oldTrackTags = getTrackTags(prev)
                        const newTrackTags = getTrackTags(updated)
                        setTags(prevTags => {
                          const manualTags = prevTags.filter(t => !oldTrackTags.includes(t))
                          return Array.from(new Set([...manualTags, ...newTrackTags]))
                        })
                        return updated
                      })
                      setDirty(true)
                    }

                    if (MULTI_TRACKS.has(trackName)) {
                      return (
                        <MultiTrackRow
                          key={articleType + trackName}
                          name={trackName}
                          value={tracks[trackName] || ''}
                          onChange={commit}
                          dynamicOptions={dynamicOptions}
                          visControl={renderVis(trackName)}
                        />
                      )
                    }
                    return (
                      <TrackRow
                        key={articleType + trackName}
                        trackKey={articleType + trackName}
                        name={trackName}
                        options={options}
                        value={tracks[trackName] || ''}
                        onChange={commit}
                        dynamicOptions={dynamicOptions}
                        visControl={renderVis(trackName)}
                      />
                    )
                  })
                )}
              </div>
            )}

            <TimelineDatesSection
              articleType={articleType}
              tracks={tracks}
              setTracks={setTracks}
              setDirty={setDirty}
              readMode={readMode}
              baseYear={(currentCampaign as any)?.timeline_base_year ?? 1507}
              renderVis={(key, isMs) => renderVis(key, isMs)}
            />

            {currentCampaign && (
              <ClocksSection articleId={article.id} campaignId={currentCampaign.id} readMode={readMode} />
            )}

            {['faction', 'religion'].includes(articleType) && (
              <MemberCountSection articleId={article.id} followerEstimate={tracks.Follower_Count} />
            )}

            {['character', 'playerCharacter'].includes(articleType) && (
              <AffiliationsSection articleId={article.id} />
            )}

            {articleType === 'location' && (
              <GeographySection articleId={article.id} reloadKey={savedTick} />
            )}

            <RelationWebsSection
              articleId={article.id}
              articleTitle={article.title}
              articleType={articleType}
              canCreate={!readMode}
              webs={relationWebs}
              loaded={relationWebsLoaded}
              onReload={reloadRelationWebs}
              onOpenWeb={(webId) => {
                setRelationsOpenWebId(webId)
                setRelationsFocusArticleId(article.id)
                setView('relations')
              }}
            />

            <ArticleRelationsPanel
              articleId={article.id}
              onOpenWeb={(webId) => {
                setRelationsOpenWebId(webId)   // ← tell RelationsPage which web to open
                setRelationsFocusArticleId(article.id)  // ← select + center this article's node
                setView('relations')
              }}
            />

            {(() => {
              const personalQuests = backlinks.filter(a => {
                if (a.article_type !== 'quest') return false
                try {
                  const t = JSON.parse(a.tracks || '{}')
                  return t.Player_Character === article.title
                } catch { return false }
              })
              const otherLinks = backlinks.filter(a => !personalQuests.includes(a))

              const renderLink = (a: ArticleSummary) => {
                const t = ARTICLE_TYPES.find(x => x.value === a.article_type) || ARTICLE_TYPES[ARTICLE_TYPES.length - 1]
                return (
                  <button key={a.id} onClick={() => navigateToArticleByTitle(a.title)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 'var(--radius-sm)', background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', textAlign: 'left', transition: 'all 120ms ease', '--hover-accent': t.color } as React.CSSProperties}
                    className="hover-accent-border">
                    <t.icon size={11} color={t.color} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                  </button>
                )
              }

              return (
                <>
                  {personalQuests.length > 0 && (
                    <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                      <div style={{ ...sidebarSectionLabel, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <ScrollText size={11} /> Personal quests
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {personalQuests.map(renderLink)}
                      </div>
                    </div>
                  )}

                  {otherLinks.length > 0 && (
                    <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                      <div style={{ ...sidebarSectionLabel, display: 'flex', alignItems: 'center', gap: 5 }}><Link size={11} /> Linked from</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {otherLinks.map(renderLink)}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            {(tags.length > 0 || memberWebs.length > 0 || !readMode) && (
              <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                <div style={sidebarSectionLabel}>Tags</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {memberWebs.map(w => (
                    <span key={`web-${w.id}`} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 11, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                      #{w.name}
                    </span>
                  ))}
                  {tags.map(tag => (
                    <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 11, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                      #{tag}
                      {!readMode && <button onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--text-muted)' }}><X size={10} /></button>}
                    </span>
                  ))}
                  {!readMode && (
                    <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }}
                      placeholder="Add tag…"
                      style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 11, color: 'var(--text-secondary)', width: 80 }} />
                  )}
                </div>
              </div>
            )}

            <div style={{ padding: 16, fontSize: 11, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>Created {new Date(article.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <span>Updated {new Date(article.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
