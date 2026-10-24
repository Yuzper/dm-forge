// path: src/components/map/CastMapButton.tsx
// "Cast" — puts this map on the table screen. Sits beside the Contents toggle
// on every map surface: the campaign world map, session maps and wiki/article
// maps (the last two share MapCanvas).
//
// Clicking is a toggle, so the same button takes the map off the table again.
// Casting opens the table window if it is closed — "cast" means show it, and a
// button that silently did nothing because a window was shut would be a bug
// report waiting to happen.
//
// The two hosts have different chrome (MapCanvas floats dark controls over the
// art; the hub map has its own strip), so the look is a variant rather than
// two copies of the component.
import { Tv } from 'lucide-react'
import { useStore } from '../../store/store'
import type { GameMap, MapShape, MapShapeLayer, POI } from '../../types'

export type CastButtonVariant = 'canvas' | 'hub'

export default function CastMapButton({ map, pois = [], ghostIds, shapes, shapeLayers, variant = 'canvas' }: {
  map: GameMap | null
  /**
   * The points currently on screen for the DM — already filtered by whichever
   * layers and visits they have enabled. Captured as-is at the moment of the
   * click; the host does the filtering because only it knows the rules.
   */
  pois?: POI[]
  /** Of those, the ones drawn dimmed (ghosted visit layers). */
  ghostIds?: number[]
  /** Drawing-layer regions, with their layers so visibility can be resolved. */
  shapes?: MapShape[]
  shapeLayers?: MapShapeLayer[]
  variant?: CastButtonVariant
}) {
  const castMapId = useStore(s => s.castMapId)
  const castMap = useStore(s => s.castMap)
  const blankTable = useStore(s => s.blankTable)

  // A mapless scene has no image to show.
  const castable = !!map?.image_path
  const on = !!map && castMapId === map.id

  if (!map) return null

  const base: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 4,
    borderRadius: 4, fontSize: 11,
    cursor: castable ? 'pointer' : 'not-allowed',
    opacity: castable ? 1 : 0.45,
    transition: 'all var(--transition)',
  }

  const skin: React.CSSProperties = variant === 'canvas'
    ? {
        padding: '4px 8px',
        background: on ? 'rgba(200,115,58,0.2)' : 'rgba(21,18,14,0.85)',
        border: `1px solid ${on ? 'rgba(200,115,58,0.4)' : 'var(--border-light)'}`,
        color: on ? '#c8733a' : 'var(--text-secondary)',
        backdropFilter: 'blur(8px)',
      }
    : {
        padding: '3px 8px',
        background: on ? 'rgba(200,115,58,0.2)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${on ? 'rgba(200,115,58,0.4)' : 'rgba(255,255,255,0.12)'}`,
        color: on ? '#c8733a' : 'rgba(255,255,255,0.55)',
      }

  return (
    <button
      onClick={e => {
        e.stopPropagation()
        if (!castable) return
        if (on) blankTable()
        else void castMap(map, { pois, ghostIds, shapes, shapeLayers })
      }}
      disabled={!castable}
      title={
        !castable ? 'This scene has no map image to cast'
          : on ? 'On the table — click to blank the table screen'
          : 'Show this map on the table screen'
      }
      style={{ ...base, ...skin }}
    >
      <Tv size={12} /> {on ? 'On table' : 'Cast'}
    </button>
  )
}
