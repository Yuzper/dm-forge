// path: src/components/map/PartyTrailOverlay.tsx
// The route the party has walked, drawn over the world map: a dashed line
// through every session-linked pin in session order, a ring on each stop and a
// filled marker on the last one.
//
// Coordinates are percentages of the fitted image box, resolved against this
// SVG's own box — the same space POIs, shapes and the measure overlay use.
// Strokes and radii divide by the zoom so they hold a constant on-screen size.

import { stopLabel, type TrailStop } from '../../utils/partyTrail'

const TRAIL = '#49c185'

export default function PartyTrailOverlay({ scale, trail }: {
  /** Current zoom. */
  scale: number
  trail: TrailStop[]
}) {
  if (trail.length === 0) return null

  return (
    <svg style={{
      position: 'absolute', inset: 0, width: '100%', height: '100%',
      overflow: 'visible', pointerEvents: 'none', zIndex: 5,
    }}>
      {/* One <line> per leg rather than a polyline: `points` takes no
          percentages, but line endpoints do. */}
      {trail.slice(1).map((stop, i) => {
        const from = trail[i]
        return (
          <line
            key={`leg-${from.poiId}-${stop.poiId}-${i}`}
            x1={`${from.x}%`} y1={`${from.y}%`} x2={`${stop.x}%`} y2={`${stop.y}%`}
            stroke={TRAIL} strokeWidth={2 / scale} strokeLinecap="round"
            strokeDasharray={`${1 / scale} ${6 / scale}`} opacity={0.9}
          />
        )
      })}
      {trail.map((stop, i) => {
        const isLast = i === trail.length - 1
        // A route that returns to a place puts two dots on one spot; step the
        // label down for each repeat so the names don't print on top of one
        // another. (Consecutive stays are already collapsed upstream.)
        const repeat = trail.slice(0, i).filter(s => s.poiId === stop.poiId).length
        return (
          <g key={`${stop.poiId}-${stop.visits[0].sessionId}`}>
            <circle
              cx={`${stop.x}%`} cy={`${stop.y}%`} r={(isLast ? 6 : 4) / scale}
              fill={isLast ? TRAIL : 'rgba(13,11,9,0.85)'}
              stroke={TRAIL} strokeWidth={2 / scale}
              opacity={isLast ? 1 : 0.8}
            />
            <text
              x={`${stop.x}%`} y={`${stop.y}%`}
              dx={9 / scale} dy={(-8 + repeat * 11) / scale}
              fill={TRAIL} fontSize={10 / scale} fontFamily="var(--font-ui)"
              opacity={isLast ? 1 : 0.75}
              style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.7)', strokeWidth: 2 / scale }}
            >
              {stopLabel(stop)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
