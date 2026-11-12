// path: src/components/TableCastPanel.tsx
// The DM's control surface for the table screen.
//
// It does not own the cast — the shared store does (see shared.ts), because a
// map can be put on the table from the Cast button beside Contents on the
// world map, a session map or a wiki map without this panel ever being opened.
//
// Shape, after the controls outgrew a single scrolling column:
//
//   · an action row that never moves, because opening, blanking and going
//     fullscreen are needed from either tab and sometimes in a hurry
//   · Play — what you touch during a session: the map, the fog, the party
//   · Setup — what you set once per television and once per map
//
// The ordering used to be the other way round, so mid-session you scrolled
// past a TV diagonal you set in March to reach the camera. Splitting by how
// often a thing is touched, rather than by what it configures, is the whole
// point of the tabs.
//
// Most of Play is the minimap itself: aiming, the party and the doors all act
// on the picture now rather than on a list beside it. See TableMinimap.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Tv, X, Maximize2, Minimize2, Grid3x3, MonitorPlay, Ban,
  Crosshair, AlertTriangle, DoorOpen, Users,
} from 'lucide-react'
import { useStore } from '../store/store'
import type { VTTDisplayInfo } from '../types'
import type { MapGrid } from '../vtt/protocol'
import { serializeMapGrid } from '../vtt/castProjection'
import {
  loadScreenCalibration, pxPerInchFromDiagonal, saveScreenCalibration,
} from '../vtt/calibration'
import { POI_LABEL_SIZE_MAX, POI_LABEL_SIZE_MIN } from '../vtt/protocol'
import { cameraRect, panToCentre, percentToImage, tableScale } from '../vtt/camera'
import TableMinimap from './vtt/TableMinimap'

type Tab = 'play' | 'setup'

const SIZE_KEY = 'dmforge:vtt:panel-size'
const MIN_W = 300
const MAX_W = 900
const MIN_H = 340

interface PanelSize { w: number; h: number }

function loadSize(): PanelSize {
  const fallback = { w: 360, h: 560 }
  try {
    const raw = localStorage.getItem(SIZE_KEY)
    if (!raw) return fallback
    const p = JSON.parse(raw)
    const w = Number(p?.w), h = Number(p?.h)
    if (!Number.isFinite(w) || !Number.isFinite(h)) return fallback
    return { w, h }
  } catch {
    return fallback
  }
}

export default function TableCastPanel() {
  const setTableCastOpen = useStore(s => s.setTableCastOpen)
  const updateMap = useStore(s => s.updateMap)

  const status = useStore(s => s.tableStatus)
  const setTableStatus = useStore(s => s.setTableStatus)
  const castMapId = useStore(s => s.castMapId)
  const castMapName = useStore(s => s.castMapName)
  const castGrid = useStore(s => s.castGrid)
  const castImage = useStore(s => s.castImage)
  const castPois = useStore(s => s.castPois)
  const castShapes = useStore(s => s.castShapes)
  const castWalls = useStore(s => s.castWalls)
  const castViewers = useStore(s => s.castViewers)
  const castShowFog = useStore(s => s.castShowFog)
  const setCastShowFog = useStore(s => s.setCastShowFog)
  const addCastViewer = useStore(s => s.addCastViewer)
  const moveCastViewer = useStore(s => s.moveCastViewer)
  const removeCastViewer = useStore(s => s.removeCastViewer)
  const clearCastViewers = useStore(s => s.clearCastViewers)
  const toggleCastDoor = useStore(s => s.toggleCastDoor)
  const castShowPois = useStore(s => s.castShowPois)
  const setCastShowPois = useStore(s => s.setCastShowPois)
  const castViewport = useStore(s => s.castViewport)
  const calibration = useStore(s => s.tableCalibration)
  const blankTable = useStore(s => s.blankTable)
  const setCastGrid = useStore(s => s.setCastGrid)
  const setCastViewport = useStore(s => s.setCastViewport)
  const setTableCalibration = useStore(s => s.setTableCalibration)

  const [tab, setTab] = useState<Tab>('play')
  const [size, setSize] = useState<PanelSize>(loadSize)
  const [displays, setDisplays] = useState<VTTDisplayInfo[]>([])
  const [pickedDisplay, setPickedDisplay] = useState<number | null>(null)
  const [diagonal, setDiagonal] = useState(55)

  useEffect(() => {
    void window.api.vttStatus().then(setTableStatus)
    void window.api.vttListDisplays().then(ds => {
      setDisplays(ds)
      setPickedDisplay(prev => prev ?? ds.find(d => !d.primary)?.id ?? ds[0]?.id ?? null)
    })
    return window.api.onVTTStatus(setTableStatus)
  }, [setTableStatus])

  // ── Resize ──────────────────────────────────────────────────────────────────
  // The panel is pinned to the bottom-right, so the grip is the opposite
  // corner and dragging it away from that anchor is what grows the box.
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    resizeRef.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h }
    const move = (ev: PointerEvent) => {
      const s = resizeRef.current
      if (!s) return
      const next = {
        w: Math.max(MIN_W, Math.min(MAX_W, s.w - (ev.clientX - s.x))),
        h: Math.max(MIN_H, Math.min(window.innerHeight - 32, s.h - (ev.clientY - s.y))),
      }
      setSize(next)
    }
    const up = () => {
      resizeRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      // Written at the end of the gesture, not on every frame.
      setSize(cur => {
        try { localStorage.setItem(SIZE_KEY, JSON.stringify(cur)) } catch { /* private mode */ }
        return cur
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ── Calibration follows whichever display the table is actually on ──────────
  const activeDisplayId = status.open ? status.displayId : pickedDisplay
  useEffect(() => {
    if (activeDisplayId == null) return
    const saved = loadScreenCalibration(activeDisplayId)
    if (saved) {
      setDiagonal(saved.diagonalInches)
      setTableCalibration({ pxPerInch: saved.pxPerInch })
      return
    }
    const bounds = displays.find(d => d.id === activeDisplayId)?.bounds
    if (bounds) setTableCalibration({ pxPerInch: pxPerInchFromDiagonal(bounds, diagonal) })
    // `diagonal` is deliberately not a dependency: this is the load path, and
    // re-running it on every keystroke would fight the DM's own edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDisplayId, displays])

  // Persist the grid back onto the map, but not on every nudge.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const commitGrid = useCallback((next: MapGrid | null) => {
    setCastGrid(next)
    if (castMapId == null) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void updateMap(castMapId, { grid: next ? serializeMapGrid(next) : null })
    }, 400)
  }, [castMapId, setCastGrid, updateMap])

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  const applyScreenCalibration = useCallback((nextDiagonal: number, nextPxPerInch: number) => {
    setDiagonal(nextDiagonal)
    setTableCalibration({ pxPerInch: nextPxPerInch })
    if (activeDisplayId != null) {
      saveScreenCalibration(activeDisplayId, { diagonalInches: nextDiagonal, pxPerInch: nextPxPerInch })
    }
  }, [activeDisplayId, setTableCalibration])

  const singleDisplay = displays.length < 2
  const pxPerInch = calibration.pxPerInch

  // How much map the table can hold. Its own reported size when it has sent
  // one; otherwise the chosen display, which is right the moment it opens
  // fullscreen. The 1080p last resort only shows before any table has existed.
  const tableSize = status.screen
    ?? displays.find(d => d.id === activeDisplayId)?.bounds
    ?? { width: 1920, height: 1080 }
  const screen = 'w' in tableSize ? tableSize : { w: tableSize.width, h: tableSize.height }

  const natural = castImage?.natural ?? { w: 0, h: 0 }
  const mapScale = tableScale(natural, castGrid, calibration, screen)
  const doors = castWalls.filter(w => w.kind === 'door')
  const openDoors = doors.filter(d => d.door_open).length

  const centreOn = useCallback((point: { x: number; y: number }) => {
    if (!castImage) return
    setCastViewport(panToCentre(castImage.natural, mapScale, screen, point))
  }, [castImage, mapScale, screen.w, screen.h, setCastViewport])

  // Party markers are dropped at the middle of what the players can currently
  // see, which is almost always where the party is, then dragged from there.
  const addPartyAtView = () => {
    if (!castImage) return
    // Derived from cameraRect rather than from the pan directly: the pan is
    // measured from a base that shifts when the map is smaller than the
    // screen, and re-deriving that here would be a second copy of it.
    const r = cameraRect(castImage.natural, mapScale, screen, castViewport)
    const cx = ((r.x + r.w / 2) / castImage.natural.w) * 100
    const cy = ((r.y + r.h / 2) / castImage.natural.h) * 100
    addCastViewer({
      x: Math.max(0, Math.min(100, cx)),
      y: Math.max(0, Math.min(100, cy)),
    })
  }

  const innerW = size.w - 20

  return (
    <div style={{
      position: 'fixed', right: 16, bottom: 16, zIndex: 900,
      width: size.w, height: size.h, maxHeight: 'calc(100vh - 32px)',
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Resize grip, opposite the anchored corner. */}
      <div
        onPointerDown={startResize}
        title="Drag to resize"
        style={{
          position: 'absolute', left: 0, top: 0, width: 16, height: 16,
          cursor: 'nwse-resize', zIndex: 2,
          background: 'linear-gradient(135deg, var(--border-gold) 0 2px, transparent 2px 4px, var(--border-gold) 4px 6px, transparent 6px)',
          borderTopLeftRadius: 'var(--radius)', opacity: 0.6,
        }}
      />

      <header style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 8px 20px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <Tv size={14} style={{ color: 'var(--gold)' }} />
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em' }}>Table</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: status.open ? 'var(--gold)' : 'var(--text-muted)' }}>
          {status.open ? (status.fullscreen ? 'fullscreen' : 'windowed') : 'closed'}
        </span>
        <button onClick={() => setTableCastOpen(false)} title="Close panel" style={iconBtn}>
          <X size={13} />
        </button>
      </header>

      {/* Always visible: needed from either tab, sometimes in a hurry. */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {!status.open ? (
          <button onClick={() => void window.api.vttOpen(pickedDisplay).then(setTableStatus)} style={primaryBtn}>
            <MonitorPlay size={12} /> Open table
          </button>
        ) : (
          <>
            <button onClick={() => void window.api.vttClose().then(setTableStatus)} style={btn}>Close</button>
            <button onClick={() => void window.api.vttSetFullscreen(!status.fullscreen).then(setTableStatus)} style={btn}>
              {status.fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              {status.fullscreen ? 'Windowed' : 'Full'}
            </button>
            <button
              onClick={blankTable}
              disabled={castMapId == null}
              title={castMapId == null ? 'The table is already blank' : "Clear the players' screen"}
              style={castMapId == null ? disabledBtn : btn}
            >
              <Ban size={12} /> Blank
            </button>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 2, padding: '6px 10px 0', flexShrink: 0 }}>
        <TabButton active={tab === 'play'} onClick={() => setTab('play')} label="Play" />
        <TabButton active={tab === 'setup'} onClick={() => setTab('setup')} label="Setup" />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tab === 'play' ? (
          <>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {castMapId != null
                ? <>On table: <strong style={{ color: 'var(--text-primary)' }}>{castMapName}</strong></>
                : <span style={{ color: 'var(--text-muted)' }}>Table is blank</span>}
            </div>

            {castImage ? (
              <>
                <TableMinimap
                  imageUrl={castImage.url}
                  natural={castImage.natural}
                  scale={mapScale}
                  screen={screen}
                  pan={castViewport}
                  pois={castShowPois ? castPois : []}
                  shapes={castShowPois ? castShapes : []}
                  walls={castWalls}
                  viewers={castViewers}
                  showWalls={castShowFog}
                  width={innerW}
                  maxHeight={Math.max(140, size.h - 300)}
                  onCentre={centreOn}
                  onMoveViewer={moveCastViewer}
                  onRemoveViewer={removeCastViewer}
                  onToggleDoor={toggleCastDoor}
                />
                <Note>
                  Drag to aim · drag the party · click a door to open or shut it
                  · click a pin to centre on it · right-click a party marker to remove it
                </Note>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => centreOn({ x: castImage.natural.w / 2, y: castImage.natural.h / 2 })}
                    style={btn}
                  >
                    <Crosshair size={12} /> Centre
                  </button>
                  <button onClick={addPartyAtView} style={btn}>
                    <Users size={12} /> Add party
                  </button>
                </div>
              </>
            ) : (
              <Note>Cast a map with the Cast button next to its Contents toggle, on the world map, a session map or a wiki map.</Note>
            )}

            <Section title="Fog of war">
              <label style={labelRow}>
                <input type="checkbox" checked={castShowFog} onChange={e => setCastShowFog(e.target.checked)} />
                Hide what the party cannot see
              </label>

              {castWalls.length === 0 ? (
                <Note icon={<AlertTriangle size={11} />}>
                  This map has no walls, so there is nothing to block sight.
                  Import a Dungeon Alchemist scene, or draw walls with the Walls tool.
                </Note>
              ) : !castShowFog ? (
                <Note>{castWalls.length} walls ready. Players currently see the whole map.</Note>
              ) : castViewers.length === 0 ? (
                <Note icon={<AlertTriangle size={11} />}>
                  Nobody placed — press <strong>Add party</strong>, then drag the
                  marker to where they are. Until then the table shows the map unfogged.
                </Note>
              ) : (
                <>
                  <Row label="Party">
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {castViewers.length} marker{castViewers.length === 1 ? '' : 's'}
                    </span>
                    <button onClick={clearCastViewers} style={{ ...btn, flex: '0 0 auto' }}>Clear</button>
                  </Row>
                  {doors.length > 0 && (
                    <Note icon={<DoorOpen size={11} />}>
                      {openDoors} of {doors.length} door{doors.length === 1 ? '' : 's'} open.
                      Click one on the map above to change it.
                    </Note>
                  )}
                </>
              )}
            </Section>

            {castPois.length > 0 && castShowPois && (
              <Section title="Go to point">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {castPois.map(p => (
                    <button
                      key={p.id}
                      onClick={() => centreOn(percentToImage(natural, { x: p.x, y: p.y }))}
                      title={`Point the players' view at ${p.label}`}
                      style={chipBtn}
                    >
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                        background: p.color, border: '1px solid rgba(0,0,0,0.5)',
                      }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.label || 'Unnamed'}
                      </span>
                    </button>
                  ))}
                </div>
              </Section>
            )}
          </>
        ) : (
          <>
            <Section title="Screen">
              <select
                value={pickedDisplay ?? ''}
                onChange={e => setPickedDisplay(Number(e.target.value))}
                disabled={status.open}
                style={input}
              >
                {displays.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.label} — {d.bounds.width}×{d.bounds.height}{d.primary ? ' (primary)' : ''}
                  </option>
                ))}
              </select>
              {singleDisplay && (
                <Note icon={<AlertTriangle size={11} />}>
                  Only one screen detected. The table opens as a window on this one —
                  drag it to the TV and press F11.
                </Note>
              )}
              {status.mode === 'primary-windowed' && !singleDisplay && (
                <Note icon={<AlertTriangle size={11} />}>
                  Opened on the primary screen. Drag it across and press F11.
                </Note>
              )}
            </Section>

            <Section title="Screen calibration">
              <Row label="TV diagonal">
                <input
                  type="number" min={10} max={120} step={0.5} value={diagonal}
                  onChange={e => {
                    const d = Number(e.target.value)
                    const bounds = displays.find(x => x.id === activeDisplayId)?.bounds
                    applyScreenCalibration(d, bounds ? pxPerInchFromDiagonal(bounds, d) : pxPerInch)
                  }}
                  style={{ ...input, width: 70 }}
                />
                <span style={unitText}>in</span>
              </Row>
              <Row label="Pixels / inch">
                <input
                  type="number" min={4} max={400} step={0.1}
                  value={Number(pxPerInch.toFixed(2))}
                  onChange={e => applyScreenCalibration(diagonal, Number(e.target.value))}
                  style={{ ...input, width: 70 }}
                />
                <Nudge onStep={d => applyScreenCalibration(diagonal, Math.max(4, pxPerInch + d))} />
              </Row>
              <Note>
                Hold a ruler to the TV and measure one grid square. It should be
                exactly 1 inch — nudge pixels/inch until it is.
              </Note>
            </Section>

            <Section title="Grid">
              <Row label="Show">
                <input
                  type="checkbox" checked={calibration.showGrid}
                  onChange={e => setTableCalibration({ showGrid: e.target.checked })}
                />
                <input
                  type="color" value={calibration.gridColor}
                  onChange={e => setTableCalibration({ gridColor: e.target.value })}
                  style={{ width: 28, height: 22, padding: 0, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}
                />
                <input
                  type="range" min={0} max={1} step={0.05} value={calibration.gridOpacity}
                  onChange={e => setTableCalibration({ gridOpacity: Number(e.target.value) })}
                  style={{ flex: 1 }}
                />
              </Row>
            </Section>

            <Section title="Points of interest">
              <label style={labelRow}>
                <input
                  type="checkbox" checked={castShowPois}
                  onChange={e => setCastShowPois(e.target.checked)}
                />
                Show points &amp; regions to players
              </label>
              {castShowPois && (
                <Row label="Name size">
                  <input
                    type="range"
                    min={POI_LABEL_SIZE_MIN} max={POI_LABEL_SIZE_MAX} step={1}
                    value={calibration.poiLabelSize}
                    onChange={e => setTableCalibration({ poiLabelSize: Number(e.target.value) })}
                    style={{ flex: 1 }}
                  />
                  <span style={{ ...unitText, width: 30, textAlign: 'right' }}>
                    {calibration.poiLabelSize}px
                  </span>
                </Row>
              )}
              <Note>
                {castShowPois
                  ? 'Captured when you cast. Positions and names only — no notes are sent.'
                  : 'Players see the bare map. No point or region data is sent to the table at all.'}
              </Note>
            </Section>

            {castMapId != null && (
              <Section title="Map grid">
                {!castGrid && (
                  <Note icon={<AlertTriangle size={11} />}>
                    Uncalibrated — the table is fitting this map to the screen, so
                    squares are not 1 inch. A VTT import sets this automatically.
                  </Note>
                )}
                <Row label="Square">
                  <input
                    type="number" min={2} max={1000} step={1}
                    value={Math.round(castGrid?.square ?? 50)}
                    onChange={e => commitGrid({
                      square: Math.max(2, Number(e.target.value)),
                      offsetX: castGrid?.offsetX ?? 0,
                      offsetY: castGrid?.offsetY ?? 0,
                    })}
                    style={{ ...input, width: 70 }}
                  />
                  <span style={unitText}>px</span>
                  <Nudge onStep={d => commitGrid({
                    square: Math.max(2, (castGrid?.square ?? 50) + d),
                    offsetX: castGrid?.offsetX ?? 0,
                    offsetY: castGrid?.offsetY ?? 0,
                  })} />
                </Row>
                {castGrid && (
                  <>
                    <Row label="Offset X">
                      <input
                        type="number" step={1} value={Math.round(castGrid.offsetX)}
                        onChange={e => commitGrid({ ...castGrid, offsetX: Number(e.target.value) })}
                        style={{ ...input, width: 70 }}
                      />
                      <Nudge onStep={d => commitGrid({ ...castGrid, offsetX: castGrid.offsetX + d })} />
                    </Row>
                    <Row label="Offset Y">
                      <input
                        type="number" step={1} value={Math.round(castGrid.offsetY)}
                        onChange={e => commitGrid({ ...castGrid, offsetY: Number(e.target.value) })}
                        style={{ ...input, width: 70 }}
                      />
                      <Nudge onStep={d => commitGrid({ ...castGrid, offsetY: castGrid.offsetY + d })} />
                    </Row>
                    <button onClick={() => commitGrid(null)} style={{ ...btn, alignSelf: 'flex-start', flex: '0 0 auto' }}>
                      <Grid3x3 size={12} /> Clear calibration
                    </button>
                  </>
                )}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Small pieces ──────────────────────────────────────────────────────────────

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '5px 8px', fontSize: 11, cursor: 'pointer',
        fontWeight: active ? 600 : 400,
        background: active ? 'var(--bg-surface)' : 'transparent',
        color: active ? 'var(--gold)' : 'var(--text-muted)',
        border: '1px solid var(--border)',
        borderBottom: active ? '1px solid var(--bg-surface)' : '1px solid var(--border)',
        borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
      }}
    >
      {label}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <h4 style={{
        margin: 0, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--text-muted)', fontWeight: 600,
      }}>{title}</h4>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 78, flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  )
}

function Nudge({ onStep }: { onStep: (delta: number) => void }) {
  return (
    <span style={{ display: 'flex', gap: 2 }}>
      <button style={iconBtn} title="−1" onClick={() => onStep(-1)}>−</button>
      <button style={iconBtn} title="+1" onClick={() => onStep(1)}>+</button>
    </span>
  )
}

function Note({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <p style={{
      margin: 0, fontSize: 10, lineHeight: 1.45, color: 'var(--text-muted)',
      display: 'flex', gap: 5, alignItems: 'flex-start',
    }}>
      {icon && <span style={{ flexShrink: 0, marginTop: 1 }}>{icon}</span>}
      <span>{children}</span>
    </p>
  )
}

const btn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  flex: 1, padding: '5px 8px', fontSize: 11, cursor: 'pointer',
  background: 'var(--bg-surface)', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
}

const primaryBtn: React.CSSProperties = {
  ...btn,
  background: 'rgba(200,168,75,0.14)', color: 'var(--gold)',
  border: '1px solid var(--border-gold)',
}

const disabledBtn: React.CSSProperties = { ...btn, opacity: 0.45, cursor: 'not-allowed' }

const chipBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  maxWidth: '100%', padding: '3px 7px', fontSize: 11, cursor: 'pointer',
  background: 'var(--bg-surface)', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
}

const iconBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 22, padding: 0, fontSize: 12, cursor: 'pointer',
  background: 'var(--bg-surface)', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
}

const input: React.CSSProperties = {
  background: 'var(--bg-surface)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  padding: '4px 6px', fontSize: 11, minWidth: 0,
}

const labelRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7,
  fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary)',
}

const unitText: React.CSSProperties = { fontSize: 10, color: 'var(--text-muted)' }
