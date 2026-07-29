// path: src/components/map/MeasureOverlay.tsx
// The measure tool's SVG: the saved reference line, the calibration line being
// drawn, and the route legs with their waypoint dots.
//
// Coordinates are percentages of the fitted image box, resolved against this
// SVG's own box — the same space POIs and shapes use. Stroke widths and radii
// divide by the zoom so they hold a constant on-screen size.
import type { MapScale } from '../../types'
import type { MeasurePoint } from '../../hooks/useMapMeasure'

const ACCENT = '#c8733a'
const CALIB = '#f0c674'

export default function MeasureOverlay({
  scale, mapScale, waypoints, isCalibrating, calibPts,
}: {
  /** Current zoom. */
  scale: number
  mapScale: MapScale | null
  waypoints: MeasurePoint[]
  isCalibrating: boolean
  calibPts: { x: number; y: number }[]
}) {
  return (
    <svg style={{
      position: 'absolute', inset: 0, width: '100%', height: '100%',
      overflow: 'visible', pointerEvents: 'none', zIndex: 6,
    }}>
      {/* Saved reference line — muted and dashed, just for orientation */}
      {mapScale && !isCalibrating && (
        <line
          x1={`${mapScale.x1}%`} y1={`${mapScale.y1}%`}
          x2={`${mapScale.x2}%`} y2={`${mapScale.y2}%`}
          stroke="rgba(255,255,255,0.55)" strokeWidth={1.5 / scale}
          strokeDasharray={`${4 / scale} ${3 / scale}`} strokeLinecap="round"
        />
      )}

      {/* The calibration line being placed */}
      {isCalibrating && calibPts.length === 2 && (
        <line
          x1={`${calibPts[0].x}%`} y1={`${calibPts[0].y}%`}
          x2={`${calibPts[1].x}%`} y2={`${calibPts[1].y}%`}
          stroke={CALIB} strokeWidth={2 / scale}
          strokeDasharray={`${5 / scale} ${4 / scale}`} strokeLinecap="round"
        />
      )}
      {isCalibrating && calibPts.map((p, i) => (
        <circle key={`c${i}`} cx={`${p.x}%`} cy={`${p.y}%`} r={4.5 / scale}
          fill={CALIB} stroke="#000" strokeWidth={1 / scale} />
      ))}

      {/* Route legs */}
      {!isCalibrating && waypoints.map((p, i) => i > 0 && (
        <line key={`l${i}`}
          x1={`${waypoints[i - 1].x}%`} y1={`${waypoints[i - 1].y}%`}
          x2={`${p.x}%`} y2={`${p.y}%`}
          stroke={ACCENT} strokeWidth={2.5 / scale}
          strokeLinecap="round" strokeLinejoin="round"
        />
      ))}
      {/* The first waypoint is white so the direction of travel reads at a glance */}
      {!isCalibrating && waypoints.map((p, i) => (
        <circle key={`w${i}`} cx={`${p.x}%`} cy={`${p.y}%`} r={4.5 / scale}
          fill={i === 0 ? '#fff' : ACCENT} stroke="#000" strokeWidth={1 / scale} />
      ))}
    </svg>
  )
}
