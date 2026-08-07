// path: src/components/map/MapPOIMarker.tsx
// One pin renderer for every map surface. Previously the world map drew plain
// coloured dots while article and session maps drew a type icon in a ring, which
// is why a pin looked like a different object depending on where you met it.
//
// Sizing policy stays with the host rather than living here: the world map sizes
// pins from `hub_size` (the per-pin slider), while article and session maps use
// one fixed size. Sharing the *rendering* is the win; forcing one size rule
// would have shrunk every dungeon pin or grown every world pin.
import { useState } from 'react'
import { getPoiColor, getPoiIcon } from '../../constants/POITypes'
import type { POI } from '../../types'

// The `pois.color` column's default. It is also, deliberately, the 'location'
// type colour — so a pin nobody has recoloured looks identical under either
// rule, and the check below can't produce a surprise.
export const DEFAULT_POI_COLOR = '#c8a84b'

// Below this the glyph stops being readable, so the marker falls back to a
// plain dot. That keeps small world-map pins legible instead of showing a
// smudge, without forcing the user's chosen sizes to grow.
const MIN_ICON_DIAMETER = 17

/**
 * A pin's colour: whatever the user chose, else its type's colour.
 *
 * Only the world map exposes a colour picker, so article and session pins all
 * sit at the default and correctly resolve to their type colour; a recoloured
 * world-map pin keeps the colour that was picked for it.
 */
export function poiColor(poi: POI): string {
  return poi.color && poi.color.toLowerCase() !== DEFAULT_POI_COLOR
    ? poi.color
    : getPoiColor(poi.poi_type)
}

export interface MapPOIMarkerProps {
  poi: POI
  /** Outer diameter in image-space px, before the inverse-zoom correction. */
  size: number
  /** Current zoom, so the marker can hold a constant on-screen size. */
  scale: number
  selected?: boolean
  hovered?: boolean
  /** From another visit layer: dimmed, hoverable for its label, otherwise inert. */
  ghost?: boolean
  /** Show the move cursor and let the host start a drag. */
  draggable?: boolean
  /** Opacity from the per-pin slider; hover and selection always override to 1. */
  opacity?: number
  onSelect?: (poi: POI, e: React.MouseEvent) => void
  onMouseDown?: (poi: POI, e: React.MouseEvent) => void
  onContextMenu?: (poi: POI, e: React.MouseEvent) => void
  onHoverChange?: (id: number | null) => void
  /** Extra content pinned to the marker, e.g. the selection pulse ring. */
  children?: React.ReactNode
}

export default function MapPOIMarker({
  poi, size, scale, selected = false, hovered = false, ghost = false,
  draggable = false, opacity = 1,
  onSelect, onMouseDown, onContextMenu, onHoverChange, children,
}: MapPOIMarkerProps) {
  const [selfHover, setSelfHover] = useState(false)
  const showLabel = selfHover || hovered || selected

  const color = poiColor(poi)
  const Icon = getPoiIcon(poi.poi_type)
  const diameter = selected ? size * 1.2 : size
  const withIcon = diameter >= MIN_ICON_DIAMETER

  return (
    <div
      data-poi="1"
      onMouseDown={e => onMouseDown?.(poi, e)}
      onClick={e => onSelect?.(poi, e)}
      onContextMenu={e => onContextMenu?.(poi, e)}
      onMouseEnter={() => { setSelfHover(true); onHoverChange?.(poi.id) }}
      onMouseLeave={() => { setSelfHover(false); onHoverChange?.(null) }}
      style={{
        position: 'absolute',
        left: `${poi.x}%`,
        top: `${poi.y}%`,
        // The inverse scale is what keeps pins a constant on-screen size while
        // the map zooms underneath them.
        transform: `translate(-50%, -50%) scale(${1 / scale})`,
        zIndex: ghost ? 5 : selected ? 20 : 10,
        cursor: ghost ? 'default' : draggable ? 'grab' : 'pointer',
        opacity: ghost ? 0.45 : (selfHover || hovered || selected) ? 1 : opacity,
        transition: 'opacity 150ms ease',
      }}
    >
      <div style={{
        width: diameter, height: diameter, borderRadius: '50%',
        // Icon markers need a dark plate for contrast; a bare dot is the colour.
        background: withIcon ? 'hsla(0, 0%, 0%, 0.90)' : color,
        border: withIcon ? `2px solid ${color}` : '1.5px solid rgba(0,0,0,0.55)',
        boxShadow: selected ? `0 0 0 3px ${color}66, 0 4px 12px rgba(0,0,0,0.7)`
          : (selfHover || hovered) ? `0 0 0 3px ${color}55`
          : '0 2px 8px rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'width 150ms ease, height 150ms ease, box-shadow 150ms ease',
        pointerEvents: 'none',
      }}>
        {withIcon && <Icon size={Math.round(diameter * 0.5)} color={color} strokeWidth={2} />}
      </div>

      {children}

      {showLabel && !!poi.label && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', border: `1px solid ${color}44`,
          borderRadius: 4, padding: '3px 8px',
          fontSize: 11, fontFamily: 'var(--font-ui)', fontWeight: 600,
          color: 'var(--text-primary)', whiteSpace: 'nowrap',
          boxShadow: 'var(--shadow-sm)', pointerEvents: 'none',
        }}>
          {poi.label}
        </div>
      )}
    </div>
  )
}
