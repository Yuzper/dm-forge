// path: src/pages/LootTablesPage.tsx
import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../store/store'
import {
  ShoppingBag, Plus, Trash2, ArrowLeft, RotateCcw,
  ChevronDown, ChevronUp, Pencil, Check,
} from 'lucide-react'
import type { MasterLootTable, LootTableCategory, LootItem } from '../types'
import { useConfirmDelete } from '../hooks/useConfirmDelete'
import LootTableEditor from '../components/LootTableEditor'
import SectionDivider from '../components/SectionDivider'

// ── Category config ────────────────────────────────────────────────────────────

const CATEGORIES: { value: LootTableCategory; label: string; color: string }[] = [
  { value: 'creature', label: 'Creature',  color: '#36a502' },
  { value: 'vendor',   label: 'Vendor',    color: '#49c185' },
  { value: 'location', label: 'Location',  color: '#c8a84b' },
  { value: 'custom',   label: 'Custom',    color: '#8a8a8a' },
]

function categoryColor(cat: LootTableCategory) {
  return CATEGORIES.find(c => c.value === cat)?.color ?? '#8a8a8a'
}
function categoryLabel(cat: LootTableCategory) {
  return CATEGORIES.find(c => c.value === cat)?.label ?? cat
}

// ── Create Modal ───────────────────────────────────────────────────────────────

function CreateTableModal({ campaignId, onClose, onCreate }: {
  campaignId: number
  onClose: () => void
  onCreate: (t: MasterLootTable) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<LootTableCategory>('creature')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    const t = await window.api.createLootTable({
      campaign_id: campaignId,
      name: name.trim(),
      description: description.trim(),
      category,
      items: '[]',
    })
    onCreate(t)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">New Loot Table</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="input-group">
            <label className="input-label">Name</label>
            <input className="input" placeholder="Bandit, Alchemist…" value={name}
              onChange={e => setName(e.target.value)} autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>
          <div className="input-group">
            <label className="input-label">Description (optional)</label>
            <input className="input" placeholder="Short note about this table…" value={description}
              onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="input-group">
            <label className="input-label">Category</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CATEGORIES.map(c => (
                <button key={c.value} onClick={() => setCategory(c.value)} style={{
                  padding: '4px 12px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
                  border: `1px solid ${category === c.value ? c.color : 'var(--border-light)'}`,
                  background: category === c.value ? `${c.color}18` : 'transparent',
                  color: category === c.value ? c.color : 'var(--text-muted)',
                  transition: 'all 120ms ease',
                }}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim() || saving}>
            {saving ? 'Creating…' : 'Create Table'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Table Editor Panel ─────────────────────────────────────────────────────────

function TableEditorPanel({ table, onUpdate, onDelete }: {
  table: MasterLootTable
  onUpdate: (updated: MasterLootTable) => void
  onDelete: () => void
}) {
  const { articles } = useStore()
  const { confirming, trigger } = useConfirmDelete()

  const [name, setName] = useState(table.name)
  const [description, setDescription] = useState(table.description)
  const [category, setCategory] = useState<LootTableCategory>(table.category)
  const [items, setItems] = useState<LootItem[]>(() => {
    try { return JSON.parse(table.items) } catch { return [] }
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  // Reset when table changes
  useEffect(() => {
    setName(table.name)
    setDescription(table.description)
    setCategory(table.category)
    try { setItems(JSON.parse(table.items)) } catch { setItems([]) }
    setDirty(false)
  }, [table.id])

  const save = useCallback(async () => {
    if (!dirty) return
    setSaving(true)
    const updated = await window.api.updateLootTable(table.id, {
      name: name.trim() || table.name,
      description: description.trim(),
      category,
      items: JSON.stringify(items),
    })
    onUpdate(updated)
    setDirty(false)
    setSaving(false)
  }, [table.id, dirty, name, description, category, items])

  // Auto-save
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(save, 1500)
    return () => clearTimeout(t)
  }, [dirty, name, description, category, items])

  const lootSuggestions = articles
    .filter(a => ['item', 'artifact'].includes(a.article_type))
    .map(a => a.title)

  const accent = categoryColor(category)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '0 24px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'stretch', minHeight: 52, flexShrink: 0,
        background: 'var(--bg-surface)',
      }}>
        <input
          value={name}
          onChange={e => { setName(e.target.value); setDirty(true) }}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500,
            color: 'var(--text-primary)', letterSpacing: '0.03em',
          }}
          placeholder="Table name…"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderLeft: '1px solid var(--border)', paddingLeft: 16, flexShrink: 0 }}>
          {dirty
            ? <button className="btn btn-sm" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : <><Check size={12} /> Save</>}
              </button>
            : <span style={{ fontSize: 11, color: 'var(--gold-dim)' }}>Saved</span>
          }
          <button
            onClick={() => trigger(onDelete)}
            className="btn btn-ghost btn-icon btn-sm"
            style={{ color: confirming ? '#ff7777' : 'var(--text-muted)' }}
            title={confirming ? 'Click again to confirm' : 'Delete table'}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {/* Description */}
        <div style={{ marginBottom: 16 }}>
          <input
            className="input"
            style={{ fontSize: 13 }}
            placeholder="Description (optional)…"
            value={description}
            onChange={e => { setDescription(e.target.value); setDirty(true) }}
          />
        </div>

        {/* Category */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {CATEGORIES.map(c => (
            <button key={c.value} onClick={() => { setCategory(c.value); setDirty(true) }} style={{
              padding: '3px 10px', borderRadius: 99, fontSize: 11, cursor: 'pointer',
              border: `1px solid ${category === c.value ? c.color : 'var(--border-light)'}`,
              background: category === c.value ? `${c.color}18` : 'transparent',
              color: category === c.value ? c.color : 'var(--text-muted)',
              transition: 'all 120ms ease',
            }}>
              {c.label}
            </button>
          ))}
        </div>

        {table.is_default && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 16,
            background: `${accent}10`, border: `1px solid ${accent}30`,
            borderRadius: 'var(--radius-sm)', fontSize: 12, color: accent,
          }}>
            <ShoppingBag size={12} />
            Default table — changes apply to all articles and POIs referencing this table
          </div>
        )}

        <SectionDivider label={`Items (${items.length})`} />
        <LootTableEditor
            value={{ name, items }}
            onChange={t => { setItems(t.items); setDirty(true) }}
            suggestions={lootSuggestions}
            />
      </div>
    </div>
  )
}

// ── Sidebar Table List ─────────────────────────────────────────────────────────

function TableListItem({ table, isActive, onClick }: {
  table: MasterLootTable
  isActive: boolean
  onClick: () => void
}) {
  const accent = categoryColor(table.category)
  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 10px', borderRadius: 'var(--radius-sm)',
        cursor: isActive ? 'default' : 'pointer',
        background: isActive ? 'var(--bg-active)' : 'transparent',
        border: `1px solid ${isActive ? accent + '40' : 'transparent'}`,
        transition: 'all 120ms ease',
        display: 'flex', alignItems: 'center', gap: 8,
      }}
      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: accent, flexShrink: 0 }} />
      <span style={{
        flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontFamily: 'var(--font-ui)',
      }}>
        {table.name}
      </span>
      {table.is_default && (
        <span style={{ fontSize: 9, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 99, border: '1px solid var(--border-light)', flexShrink: 0 }}>
          default
        </span>
      )}
    </div>
  )
}

// ── Category Group ─────────────────────────────────────────────────────────────

function CategoryGroup({ category, tables, activeId, onSelect, onCreateInCategory }: {
  category: LootTableCategory
  tables: MasterLootTable[]
  activeId: number | null
  onSelect: (t: MasterLootTable) => void
  onCreateInCategory: (cat: LootTableCategory) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const color = categoryColor(category)
  const label = categoryLabel(category)

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 4px 2px' }}>
        <button
          onClick={() => setCollapsed(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', flex: 1, textAlign: 'left', padding: 0 }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, color, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '0 5px', borderRadius: 99, border: '1px solid var(--border-light)' }}>
            {tables.length}
          </span>
          {collapsed
            ? <ChevronDown size={11} style={{ color: 'var(--text-muted)', marginLeft: 'auto' }} />
            : <ChevronUp size={11} style={{ color: 'var(--text-muted)', marginLeft: 'auto' }} />
          }
        </button>
        <button
          onClick={() => onCreateInCategory(category)}
          title={`New ${label} table`}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2, borderRadius: 'var(--radius-sm)', transition: 'color 120ms ease' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = color}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
        >
          <Plus size={12} />
        </button>
      </div>

      {!collapsed && (
        <div style={{ paddingLeft: 8, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {tables.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 8px', fontStyle: 'italic' }}>
              No tables yet
            </div>
          ) : tables.map(t => (
            <TableListItem
              key={t.id}
              table={t}
              isActive={activeId === t.id}
              onClick={() => onSelect(t)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Loot Tables Page ───────────────────────────────────────────────────────────

export default function LootTablesPage() {
  const { currentCampaign, setView, setCampaignSubView } = useStore()
  const [tables, setTables] = useState<MasterLootTable[]>([])
  const [activeTable, setActiveTable] = useState<MasterLootTable | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [preselectedCategory, setPreselectedCategory] = useState<LootTableCategory>('creature')
  const [resetting, setResetting] = useState(false)

  const loadTables = useCallback(async () => {
    if (!currentCampaign) return
    const ts = await window.api.getLootTables(currentCampaign.id)
    setTables(ts)
    return ts
  }, [currentCampaign?.id])

  useEffect(() => {
    loadTables().then(ts => {
      if (ts && ts.length > 0 && !activeTable) setActiveTable(ts[0])
    })
  }, [currentCampaign?.id])

  const handleCreate = (cat: LootTableCategory) => {
    setPreselectedCategory(cat)
    setShowCreate(true)
  }

  const handleCreated = (t: MasterLootTable) => {
    setTables(prev => [...prev, t])
    setActiveTable(t)
  }

  const handleUpdate = (updated: MasterLootTable) => {
    setTables(prev => prev.map(t => t.id === updated.id ? updated : t))
    if (activeTable?.id === updated.id) setActiveTable(updated)
  }

  const handleDelete = async () => {
    if (!activeTable) return
    await window.api.deleteLootTable(activeTable.id)
    const remaining = tables.filter(t => t.id !== activeTable.id)
    setTables(remaining)
    setActiveTable(remaining.length > 0 ? remaining[0] : null)
  }

  const handleResetDefaults = async () => {
    if (!currentCampaign || resetting) return
    setResetting(true)
    const fresh = await window.api.resetDefaultTables(currentCampaign.id)
    // Reload all to get accurate state
    const all = await window.api.getLootTables(currentCampaign.id)
    setTables(all)
    if (fresh.length > 0) setActiveTable(fresh[0])
    setResetting(false)
  }

  const tablesByCategory = (cat: LootTableCategory) =>
    tables.filter(t => t.category === cat).sort((a, b) => a.name.localeCompare(b.name))

  if (!currentCampaign) return null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{
        padding: '0 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12,
        minHeight: 48, flexShrink: 0, background: 'var(--bg-surface)',
      }}>
        <button
          onClick={() => { setView('campaign'); setCampaignSubView('hub') }}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '0 12px 0 0', background: 'transparent', border: 'none',
            borderRight: '1px solid var(--border)', height: '100%', minHeight: 48,
            color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
            transition: 'color var(--transition)',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <ShoppingBag size={13} color="#49c185" />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: '#49c185', letterSpacing: '0.04em', flex: 1 }}>
          Loot Tables
        </span>
        <button
          onClick={handleResetDefaults}
          disabled={resetting}
          title="Reset all default tables to original values"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', background: 'transparent',
            border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)', fontSize: 11, cursor: resetting ? 'wait' : 'pointer',
            transition: 'all var(--transition)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#49c185'; (e.currentTarget as HTMLElement).style.color = '#49c185' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
        >
          <RotateCcw size={11} /> {resetting ? 'Resetting…' : 'Reset defaults'}
        </button>
        <button
          onClick={() => handleCreate('custom')}
          className="btn btn-primary btn-sm"
        >
          <Plus size={13} /> New Table
        </button>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{
          width: 230, flexShrink: 0, borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-surface)', overflow: 'hidden',
        }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '10px 8px' }}>
            {CATEGORIES.map(c => (
              <CategoryGroup
                key={c.value}
                category={c.value}
                tables={tablesByCategory(c.value)}
                activeId={activeTable?.id ?? null}
                onSelect={setActiveTable}
                onCreateInCategory={handleCreate}
              />
            ))}

            {tables.length === 0 && (
              <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
                No tables yet.
                <br />
                <button
                  onClick={() => handleCreate('creature')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#49c185', fontSize: 12, padding: '4px 0', marginTop: 4 }}
                >
                  Create your first table
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Editor */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activeTable ? (
            <TableEditorPanel
              key={activeTable.id}
              table={activeTable}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)' }}>
              <ShoppingBag size={40} strokeWidth={1} color="var(--border-light)" />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', marginBottom: 4 }}>No table selected</div>
                <div style={{ fontSize: 13 }}>Select a table from the sidebar or create a new one</div>
              </div>
              <button className="btn btn-primary" onClick={() => handleCreate('creature')}>
                <Plus size={14} /> New Table
              </button>
            </div>
          )}
        </div>
      </div>

      {showCreate && currentCampaign && (
        <CreateTableModal
          campaignId={currentCampaign.id}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreated}
        />
      )}
    </div>
  )
}