// path: src/components/POIPanel.tsx
import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../store/store'
import { X, PackageOpen } from 'lucide-react'
import { POI_TYPE_LIST } from '../constants/POITypes'
import RichEditor from './RichEditor'
import LootTableEditor from './LootTableEditor'
import LootResultModal from './LootResultModal'
import type { POIType, LootItem } from '../types'
import { parseLootTable, generateLoot } from '../types'
import CombatPanel from './CombatPanel'
import SectionDivider from './SectionDivider'
import { useConfirmDelete } from '../hooks/useConfirmDelete'


export default function POIPanel({ readMode }: { readMode?: boolean }) {
  const { selectedPOI, poiPanelOpen, selectPOI, updatePOI, deletePOI } = useStore()
  const [label, setLabel] = useState('')
  const [poiType, setPoiType] = useState<POIType>('location')
  const [content, setContent] = useState('')
  const [lootTableJson, setLootTableJson] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const { confirming: confirmDelete, trigger: triggerDelete } = useConfirmDelete()
  const [lootResult, setLootResult] = useState<LootItem[] | null>(null)
  

  useEffect(() => {
    if (selectedPOI) {
      setLabel(selectedPOI.label)
      setPoiType(selectedPOI.poi_type)
      setContent(selectedPOI.content)
      setLootTableJson(selectedPOI.loot_table || '{"name":"Loot","items":[]}')
      setDirty(false)
      setLootResult(null)
    }
  }, [selectedPOI?.id])

  const save = useCallback(async () => {
    if (!selectedPOI || !dirty) return
    setSaving(true)
    await updatePOI(selectedPOI.id, { label, poi_type: poiType, content, loot_table: lootTableJson })
    setDirty(false)
    setSaving(false)
  }, [selectedPOI, dirty, label, poiType, content, lootTableJson, updatePOI])

  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(save, 1500)
    return () => clearTimeout(timer)
  }, [dirty, label, poiType, content, lootTableJson])

  const handleClose = async () => {
    if (dirty && selectedPOI) {
      setSaving(true)
      await updatePOI(selectedPOI.id, { label, poi_type: poiType, content, loot_table: lootTableJson })
      setSaving(false)
    }
    selectPOI(null)
  }

  const handleGenerateLoot = () => {
    const table = parseLootTable(lootTableJson)
    const result = generateLoot(table.items)
    setLootResult(result)
  }

  const typeInfo = POI_TYPE_LIST.find(t => t.value === poiType) || POI_TYPE_LIST[0]
  const TypeIcon = typeInfo.icon

  if (!poiPanelOpen || !selectedPOI) return null

  if (selectedPOI.poi_type === 'combat') {
    return <CombatPanel readMode={readMode} />
  }

  const lootTable = parseLootTable(lootTableJson)
  const hasLootItems = lootTable.items.length > 0

  return (
    <div style={{
      width: 'var(--panel-width)',
      background: 'var(--bg-surface)',
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0, animation: 'slideIn 200ms ease', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
        flexShrink: 0, background: 'var(--bg-elevated)',
      }}>
        <div style={{ width: 28, height: 28, borderRadius: 4, background: `${typeInfo.color}22`, border: `1px solid ${typeInfo.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <TypeIcon size={14} color={typeInfo.color} />
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
            placeholder="Location name…"
          />
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {dirty && !readMode && (
            <button className="btn btn-sm" onClick={save} disabled={saving} style={{ padding: '3px 8px', fontSize: 11 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
          {!readMode && (
            <button
              className="btn btn-sm btn-danger"
              onClick={() => triggerDelete(async () => { if (selectedPOI) await deletePOI(selectedPOI.id) })}
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

      {/* Type picker — edit mode only */}
      {!readMode && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {POI_TYPE_LIST.map(t => {
              const Icon = t.icon
              const active = t.value === poiType
              return (
                <button
                  key={t.value}
                  onClick={() => { setPoiType(t.value); setDirty(true) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 9px', borderRadius: 99,
                    border: `1px solid ${active ? t.color + '88' : 'var(--border-light)'}`,
                    background: active ? t.color + '18' : 'transparent',
                    color: active ? t.color : 'var(--text-muted)',
                    fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    transition: 'all 120ms ease', letterSpacing: '0.03em',
                  }}
                >
                  <Icon size={10} /> {t.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Scrollable content area */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* Rich editor */}
        <div style={{ flexShrink: 0 }}>
          <RichEditor
            key={selectedPOI.id}
            content={selectedPOI.content}
            onChange={v => { setContent(v); setDirty(true) }}
            placeholder="Describe this location… what do the players see? hear? smell?"
            readOnly={readMode}
            expandable
          />
        </div>

        {/* ── Loot section ── */}
        <div style={{ padding: '0 14px 20px' }}>
          {/* Divider + heading */}
          <SectionDivider label={lootTable.name || 'Loot'} margin="8px 0 14px" />

          {readMode ? (
            // Read mode: show generate button if items exist, else placeholder
            hasLootItems ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {lootTable.items.length} item{lootTable.items.length !== 1 ? 's' : ''} in table
                  {' · '}{lootTable.items.filter(i => i.chance === 100).length} guaranteed
                  {' · '}{lootTable.items.filter(i => i.chance < 100).length} random
                </div>
                <button
                  className="btn btn-sm"
                  onClick={handleGenerateLoot}
                  style={{ alignSelf: 'flex-start', gap: 6 }}
                >
                  <PackageOpen size={12} /> Generate Loot
                </button>
              </div>
            ) : (
              <div style={{
                padding: '16px', textAlign: 'center',
                border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)', fontSize: 12,
              }}>
                No loot table — switch to Edit to add items
              </div>
            )
          ) : (
            // Edit mode: show full loot table editor
            <LootTableEditor
              value={lootTable}
              onChange={t => { setLootTableJson(JSON.stringify(t)); setDirty(true) }}
              defaultName="Loot"
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
        <span>x: {selectedPOI.x.toFixed(1)}%</span>
        <span>y: {selectedPOI.y.toFixed(1)}%</span>
        {!dirty && <span style={{ marginLeft: 'auto', color: 'var(--gold-dim)' }}>Saved</span>}
      </div>

      {/* Loot result modal — rerollable for POIs */}
      {lootResult && (
        <LootResultModal
          creatureName={label || 'Loot'}
          items={lootResult}
          onClose={() => setLootResult(null)}
          onRegenerate={handleGenerateLoot}
        />
      )}
    </div>
  )
}
