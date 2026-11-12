// path: src/pages/TablePage.tsx
// The player-facing table view: what the TV lying flat on the table shows.
// Rendered instead of the app when the window is opened with ?mode=vtt.
//
// It is a pure sink. It holds no campaign state, reads no store and makes no
// IPC calls for data — everything it draws arrived as a cast message that
// DM-Forge chose to send (src/vtt/castProjection.ts). That is the guarantee
// behind "DM-only data never reaches the players' screen": there is no channel
// here for it to arrive on. The points it shows carry a name and a position
// and nothing else — no prose was sent — and when the DM has them switched
// off the list arrives empty.
//
// Nothing on this screen is interactive. It is a display: the DM drives it
// from their own window.
//
// Scale is physical, not a preference. The image is drawn so that one map grid
// square is exactly one inch of glass, which is where a 25 mm base stands. The
// DM pans; nothing here zooms.
import { useEffect, useMemo, useState } from 'react'
import type { CastPOI, CastScene, CastShape, CastViewport, TableCalibration } from '../vtt/protocol'
import { DEFAULT_CALIBRATION } from '../vtt/protocol'
import { subscribeCast, requestCastResend } from '../vtt/castChannel'
import {
  centroidOf, dashArrayFor, ellipseAttrs, polygonPointsAttr, toLocalX, toLocalY,
} from '../utils/mapShapeGeometry'
import { layout, tableScale } from '../vtt/camera'
import { polygonAttr } from '../vtt/lineOfSight'

export default function TablePage() {
  const [scene, setScene] = useState<CastScene | null>(null)
  const [viewport, setViewport] = useState<CastViewport>({ panX: 0, panY: 0 })
  const [calibration, setCalibration] = useState<TableCalibration>(DEFAULT_CALIBRATION)
  const [screen, setScreen] = useState({ w: window.innerWidth, h: window.innerHeight })

  useEffect(() => {
    const off = subscribeCast(msg => {
      if (msg.type === 'scene') setScene(msg.scene)
      else if (msg.type === 'viewport') setViewport(msg.viewport)
      else if (msg.type === 'calibration') setCalibration(msg.calibration)
    })
    // A reload (dev HMR, or a crash) leaves the table blank until the DM next
    // touches something — unless it asks.
    requestCastResend()
    return off
  }, [])

  useEffect(() => {
    const onResize = () => setScreen({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // The DM's minimap cannot know how much map fits here — a windowed fallback
  // is not the display's size, and going fullscreen changes it — so the table
  // reports its own size whenever that changes.
  useEffect(() => {
    void window.api.vttReportSize(screen)
  }, [screen.w, screen.h])

  // Scale and origin come from src/vtt/camera.ts, which the DM's minimap also
  // uses to draw the camera rectangle. Computing either of them here as well
  // would be two implementations of the same inverse, free to disagree.
  const scale = useMemo(
    () => (scene ? tableScale(scene.natural, scene.grid, calibration, screen) : 1),
    [scene, calibration.pxPerInch, screen.w, screen.h],
  )

  if (!scene) return <IdleScreen />

  const { imgW, imgH, originX, originY } = layout(scene.natural, scale, screen, viewport)

  const showGrid = calibration.showGrid && !!scene.grid
  // Gridlines land on the map's own grid art: image origin, plus where that art
  // says the first line falls. The overlay spans the screen, so its phase is
  // that origin taken modulo one square.
  const spacing = calibration.pxPerInch
  const gridX = scene.grid ? originX + scene.grid.offsetX * scale : 0
  const gridY = scene.grid ? originY + scene.grid.offsetY * scale : 0
  const phase = (v: number) => (spacing > 0 ? ((v % spacing) + spacing) % spacing : 0)

  const pois = scene.pois ?? []
  const shapes = scene.shapes ?? []
  const fog = scene.fog ?? null

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000',
      overflow: 'hidden', userSelect: 'none',
      // Nothing here is clickable, so the pointer stays hidden: a stray arrow
      // parked on the battlefield is just a distraction.
      cursor: 'none',
    }}>
      <img
        src={scene.imageUrl}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          left: originX, top: originY, width: imgW, height: imgH,
          pointerEvents: 'none',
        }}
      />

      {showGrid && spacing > 2 && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          opacity: calibration.gridOpacity,
          backgroundImage: [
            `repeating-linear-gradient(to right, ${calibration.gridColor} 0 1px, transparent 1px ${spacing}px)`,
            `repeating-linear-gradient(to bottom, ${calibration.gridColor} 0 1px, transparent 1px ${spacing}px)`,
          ].join(', '),
          backgroundPosition: `${phase(gridX)}px 0, 0 ${phase(gridY)}px`,
        }} />
      )}

      {/* Regions paint between the map and the points, so a district never
          hides a marker — the same stacking the DM's canvas uses. */}
      {shapes.length > 0 && (
        <svg
          width={imgW} height={imgH} viewBox={`0 0 ${imgW} ${imgH}`}
          style={{ position: 'absolute', left: originX, top: originY, pointerEvents: 'none', zIndex: 5 }}
        >
          {shapes.map(sh => <Region key={sh.id} shape={sh} box={{ w: imgW, h: imgH }} />)}
        </svg>
      )}

      {fog && (
        <svg
          width={imgW} height={imgH} viewBox={`0 0 ${imgW} ${imgH}`}
          style={{ position: 'absolute', left: originX, top: originY, pointerEvents: 'none', zIndex: 7 }}
        >
          <defs>
            {/* White is lit, black is hidden. Each viewer punches its own
                visible region out of the darkness; overlapping parties simply
                union, which is what a mask gives for free. */}
            <mask id="fog-mask">
              <rect x={0} y={0} width={imgW} height={imgH} fill="white" />
              {fog.polygons.map((poly, i) => (
                <polygon key={i} points={polygonAttr(poly, { w: imgW, h: imgH })} fill="black" />
              ))}
            </mask>
          </defs>
          {/* Not pure black: a faint sense of the map under the fog keeps the
              table from looking broken, and matches what players expect from
              a battlemap they have partly explored. */}
          <rect x={0} y={0} width={imgW} height={imgH} fill="rgba(0,0,0,0.93)" mask="url(#fog-mask)" />
        </svg>
      )}

      {pois.map(poi => (
        <Marker
          key={poi.id}
          poi={poi}
          left={originX + (poi.x / 100) * imgW}
          top={originY + (poi.y / 100) * imgH}
          labelSize={calibration.poiLabelSize}
        />
      ))}
    </div>
  )
}

// ── Regions ───────────────────────────────────────────────────────────────────

/**
 * One drawing-layer region. Strokes are given in the same local pixel space as
 * the DM's canvas, but with no zoom divisor: the table draws at a fixed
 * physical scale, so a stroke width is already what it will be on the glass.
 */
function Region({ shape, box }: { shape: CastShape; box: { w: number; h: number } }) {
  const dash = dashArrayFor(shape.strokeStyle, 1)
  const common = {
    fill: shape.fillColor,
    fillOpacity: shape.fillOpacity,
    stroke: shape.strokeColor,
    strokeWidth: shape.strokeWidth,
    strokeDasharray: dash,
    strokeLinejoin: 'round' as const,
  }

  const centre = shape.showLabel && shape.label
    ? centroidOf(shape.shapeType, shape.points)
    : null

  return (
    <>
      {shape.shapeType === 'ellipse'
        ? (() => {
            const e = ellipseAttrs(shape.points, box)
            return e ? <ellipse cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} {...common} /> : null
          })()
        : <polygon points={polygonPointsAttr(shape.points, box)} {...common} />}
      {centre && (
        <text
          x={toLocalX(centre.x, box)} y={toLocalY(centre.y, box)}
          textAnchor="middle" dominantBaseline="middle"
          style={{
            fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 600,
            fill: '#f2ead9', paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.75)', strokeWidth: 3,
          }}
        >
          {shape.label}
        </text>
      )}
    </>
  )
}

// ── Points ────────────────────────────────────────────────────────────────────

const PIN_W = 26
const PIN_H = 34

/**
 * A point on the players' map: a map pin with its name above it.
 *
 * A pin rather than the circular badge the DM's canvas draws, because the two
 * screens are read differently — the DM's map is a workspace seen head-on at
 * arm's length, while this one lies flat with physical minis standing on it.
 * A pin's tip says exactly which square it means from any seat at the table;
 * a disc centred on the spot is ambiguous once something is standing near it.
 *
 * So the anchor is the tip, not the centre: translate(-50%, -100%).
 *
 * The name is always on, never a hover tooltip — nobody hovers over a table.
 */
function Marker({ poi, left, top, labelSize }: {
  poi: CastPOI
  left: number
  top: number
  /** From the DM's slider, live. */
  labelSize: number
}) {
  // The plate grows with the text so a large label does not end up as big type
  // crammed into a small box.
  const padV = Math.max(1, Math.round(labelSize * 0.16))
  const padH = Math.max(4, Math.round(labelSize * 0.55))
  return (
    <div
      style={{
        position: 'absolute', left, top,
        transform: 'translate(-50%, -100%)',
        pointerEvents: 'none',
        opacity: poi.ghost ? 0.55 : 1,
        zIndex: 10,
      }}
    >
      <span style={{
        // Above the pin head, out of flow so it cannot shift the tip off the
        // point the pin is marking.
        position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
        marginBottom: 4,
        whiteSpace: 'nowrap',
        fontSize: labelSize, fontWeight: 600, letterSpacing: '0.02em',
        fontFamily: 'Georgia, serif', color: '#f2ead9',
        background: 'rgba(0,0,0,0.62)', border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: Math.max(3, Math.round(labelSize / 3.5)),
        padding: `${padV}px ${padH}px`,
        textShadow: '0 1px 2px rgba(0,0,0,0.9)',
      }}>
        {poi.label}
      </span>
      <svg width={PIN_W} height={PIN_H} viewBox="0 0 26 34" style={{ display: 'block' }}>
        {/* Teardrop: a circular head closing to a point at (13, 34). */}
        <path
          d="M13 33.2C13 33.2 24.5 20.6 24.5 12.6A11.5 11.5 0 0 0 1.5 12.6C1.5 20.6 13 33.2 13 33.2Z"
          fill={poi.color}
          stroke="rgba(0,0,0,0.7)"
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        <circle cx={13} cy={12.4} r={4.1} fill="rgba(0,0,0,0.55)" />
      </svg>
    </div>
  )
}

/**
 * Between scenes. Deliberately says nothing about the campaign — the players
 * are sitting in front of this screen, and a map name or session title is the
 * DM's note to themselves, not a title card.
 */
function IdleScreen() {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000', cursor: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        fontSize: 13, letterSpacing: '0.35em', textTransform: 'uppercase',
        color: 'rgba(200,168,75,0.30)', fontFamily: 'Georgia, serif',
      }}>
        DM-Forge
      </div>
    </div>
  )
}
