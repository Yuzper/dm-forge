// path: src/components/POIList.tsx
import { useStore } from '../store/store'
import { MapPin, MousePointerClick, Edit3 } from 'lucide-react'
import { TYPE_ORDER, getPoiColor, getPoiIcon } from '../constants/POITypes'
import type { POI } from '../types'

function POIListItem({ poi, isSelected }: { poi: POI; isSelected: boolean }) {
  const { selectPOI } = useStore()
  const Icon = getPoiIcon(poi.poi_type)
  const color = getPoiColor(poi.poi_type)

  return (
    <div
      onClick={() => selectPOI(isSelected ? null : poi)}
      title={poi.label}
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '7px 12px', cursor: 'pointer',
        borderLeft: `2px solid ${isSelected ? color : 'transparent'}`,
        background: isSelected ? `${color}12` : 'transparent',
        transition: 'all 120ms ease', userSelect: 'none',
      }}
      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <div style={{
        width: 24, height: 24, borderRadius: 4,
        background: `${color}18`, border: `1px solid ${color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={12} color={color} strokeWidth={2} />
      </div>
      <span style={{
        fontSize: 12,
        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontWeight: isSelected ? 500 : 400,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        flex: 1, minWidth: 0,
      }}>
        {poi.label}
      </span>
    </div>
  )
}

export default function POIList() {
  const { pois, selectedPOI, editMode } = useStore()

  const grouped = TYPE_ORDER.reduce<Record<string, POI[]>>((acc, type) => {
    const group = pois.filter(p => p.poi_type === type)
    if (group.length > 0) acc[type] = group
    return acc
  }, {})

  const hasGroups = Object.keys(grouped).length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, background: 'var(--bg-elevated)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Points of Interest
        </span>
        <span style={{
          fontSize: 11,
          color: pois.length > 0 ? 'var(--gold-dim)' : 'var(--text-muted)',
          fontWeight: 600,
          background: pois.length > 0 ? 'var(--gold-glow)' : 'transparent',
          padding: '1px 6px', borderRadius: 99,
          border: pois.length > 0 ? '1px solid var(--border-gold)' : 'none',
        }}>
          {pois.length}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
        {!hasGroups ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 10, padding: '32px 16px', color: 'var(--text-muted)', textAlign: 'center',
          }}>
            {editMode ? (
              <>
                <MousePointerClick size={28} strokeWidth={1} color="var(--border-light)" />
                <span style={{ fontSize: 12, lineHeight: 1.5 }}>Click anywhere on the map to place a point of interest</span>
              </>
            ) : (
              <>
                <MapPin size={28} strokeWidth={1} color="var(--border-light)" />
                <span style={{ fontSize: 12, lineHeight: 1.5 }}>
                  No POIs yet.<br />
                  Switch to <strong style={{ color: 'var(--text-secondary)' }}>Edit</strong> mode to add some.
                </span>
              </>
            )}
          </div>
        ) : (
          TYPE_ORDER.map(type => {
            const group = grouped[type]
            if (!group) return null
            const color = getPoiColor(type)
            const Icon = getPoiIcon(type)
            return (
              <div key={type}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 12px 4px',
                  fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                }}>
                  <Icon size={9} color={color} />
                  <span style={{ color }}>{type}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{group.length}</span>
                </div>
                {group.map(poi => (
                  <POIListItem key={poi.id} poi={poi} isSelected={selectedPOI?.id === poi.id} />
                ))}
              </div>
            )
          })
        )}
      </div>

      {editMode && hasGroups && (
        <div style={{
          padding: '8px 12px', borderTop: '1px solid var(--border)',
          fontSize: 10, color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
        }}>
          <Edit3 size={9} color="var(--gold-dim)" />
          <span>Click map to add</span>
        </div>
      )}
    </div>
  )
}