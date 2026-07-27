// path: src/components/campaign/TravelMeasurePanel.tsx
// Floating panel for the world-map measure tool: shows the map scale, the summed
// route distance (mi/km toggle), and 5E travel time + forced-march CON saves.
// Pure presentation + local UI state; the parent (HubWorldMap) owns the scale,
// the waypoints and the calibration flow.
import { useState } from 'react'
import { Ruler, X, Undo2, Trash2, Footprints, AlertTriangle } from 'lucide-react'
import type { MapScale, TravelPace } from '../../types'
import {
  PACES, pathMiles, computeTravel, forcedMarchSaves,
  formatDistance, formatDuration, HOURS_PER_DAY,
} from '../../utils/travel'

const ACCENT = '#c8733a'

// Draft endpoints of the reference line, awaiting a real distance.
export interface CalibDraft { x1: number; y1: number; x2: number; y2: number }

export default function TravelMeasurePanel({
  scale, natural, waypoints,
  isCalibrating, calibDraft,
  onExit, onBeginCalibrate, onCancelCalibrate, onCommitScale,
  onUndoPoint, onClearRoute,
}: {
  scale: MapScale | null
  natural: { w: number; h: number } | null
  waypoints: { x: number; y: number; label?: string }[]
  isCalibrating: boolean
  calibDraft: CalibDraft | null
  onExit: () => void
  onBeginCalibrate: () => void
  onCancelCalibrate: () => void
  onCommitScale: (distance: number, unit: 'mi' | 'km') => void
  onUndoPoint: () => void
  onClearRoute: () => void
}) {
  const [pace, setPace] = useState<TravelPace>('normal')
  const [mounted, setMounted] = useState(false)
  const [displayUnit, setDisplayUnit] = useState<'mi' | 'km'>(scale?.unit ?? 'mi')
  const [calibValue, setCalibValue] = useState('')
  const [calibUnit, setCalibUnit] = useState<'mi' | 'km'>(scale?.unit ?? 'mi')

  const { segments, total } = scale && natural
    ? pathMiles(waypoints, scale, natural)
    : { segments: [] as number[], total: 0 }

  const travel = computeTravel({ miles: total, pace, mounted })
  const march = forcedMarchSaves(travel.hours)

  const wrap: React.CSSProperties = {
    width: 236, display: 'flex', flexDirection: 'column', zIndex: 16,
    background: 'rgba(0,0,0,0.68)', backdropFilter: 'blur(6px)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, overflow: 'hidden',
    fontFamily: 'var(--font-ui)', color: 'rgba(255,255,255,0.85)',
    maxHeight: 'calc(100% - 100px)',
  }
  const sectionLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)', marginBottom: 6,
  }
  const smallBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)',
    borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer',
  }

  const commitScale = () => {
    const v = parseFloat(calibValue)
    if (!isFinite(v) || v <= 0) return
    onCommitScale(v, calibUnit)
    setCalibValue('')
    setDisplayUnit(calibUnit)
  }

  return (
    <div style={wrap}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <Ruler size={13} style={{ color: ACCENT }} />
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)' }}>
          Measure &amp; Travel
        </span>
        <button onClick={onExit} title="Exit measure mode"
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex', padding: 2 }}>
          <X size={13} />
        </button>
      </div>

      <div style={{ overflowY: 'auto', padding: '10px' }}>

        {/* ── Scale ────────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 12 }}>
          <div style={sectionLabel}>Map scale</div>

          {calibDraft ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                That line represents:
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="number" min="0" step="any" autoFocus value={calibValue}
                  onChange={e => setCalibValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitScale() }}
                  placeholder="e.g. 40"
                  style={{ flex: 1, height: 26, fontSize: 12, padding: '0 8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 4, color: '#fff', outline: 'none' }}
                />
                <UnitToggle value={calibUnit} onChange={setCalibUnit} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={commitScale} disabled={!(parseFloat(calibValue) > 0)}
                  style={{ ...smallBtn, flex: 1, justifyContent: 'center', background: 'rgba(200,115,58,0.22)', borderColor: 'rgba(200,115,58,0.45)', color: ACCENT, opacity: parseFloat(calibValue) > 0 ? 1 : 0.5 }}>
                  Save scale
                </button>
                <button onClick={onCancelCalibrate} style={{ ...smallBtn, justifyContent: 'center' }}>Cancel</button>
              </div>
            </div>
          ) : isCalibrating ? (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
              Click two points a known distance apart on the map.
              <button onClick={onCancelCalibrate} style={{ ...smallBtn, marginTop: 7 }}>Cancel</button>
            </div>
          ) : scale ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
                Reference = <strong>{scale.distance} {scale.unit}</strong>
              </span>
              <button onClick={onBeginCalibrate} style={{ ...smallBtn, marginLeft: 'auto' }}>Recalibrate</button>
            </div>
          ) : (
            <button onClick={onBeginCalibrate}
              style={{ ...smallBtn, width: '100%', justifyContent: 'center', padding: '6px 8px', background: 'rgba(200,115,58,0.18)', borderColor: 'rgba(200,115,58,0.4)', color: ACCENT }}>
              <Ruler size={12} /> Set map scale
            </button>
          )}
        </div>

        {/* ── Route & travel (needs a scale) ──────────────────────────────── */}
        {scale && !isCalibrating && !calibDraft && (
          <>
            {/* Route */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={sectionLabel}>Route</span>
                <UnitToggle value={displayUnit} onChange={setDisplayUnit} small />
              </div>
              {waypoints.length < 2 ? (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
                  Click points on the map to trace a route.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 22, fontWeight: 600, color: '#fff', lineHeight: 1.1 }}>
                    {formatDistance(total, displayUnit)}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                    {segments.length} leg{segments.length === 1 ? '' : 's'}
                    {segments.length > 1 && ` · ${segments.map(s => formatDistance(s, displayUnit).replace(` ${displayUnit}`, '')).join(' + ')} ${displayUnit}`}
                  </div>
                </>
              )}
              {waypoints.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={onUndoPoint} style={smallBtn}><Undo2 size={11} /> Undo point</button>
                  <button onClick={onClearRoute} style={smallBtn}><Trash2 size={11} /> Clear</button>
                </div>
              )}
            </div>

            {/* Travel */}
            {waypoints.length >= 2 && (
              <div>
                <div style={sectionLabel}>Travel</div>

                {/* Pace */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 7 }}>
                  {(Object.keys(PACES) as TravelPace[]).map(p => (
                    <button key={p} onClick={() => setPace(p)}
                      style={{
                        flex: 1, padding: '5px 0', fontSize: 11, borderRadius: 4, cursor: 'pointer',
                        border: `1px solid ${pace === p ? 'rgba(200,115,58,0.5)' : 'rgba(255,255,255,0.12)'}`,
                        background: pace === p ? 'rgba(200,115,58,0.22)' : 'rgba(255,255,255,0.05)',
                        color: pace === p ? ACCENT : 'rgba(255,255,255,0.6)',
                      }}
                      title={`${PACES[p].mph} mph · ${PACES[p].perDay} mi/day`}>
                      {PACES[p].label}
                    </button>
                  ))}
                </div>

                {/* Mode: on foot / mounted */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 9 }}>
                  <button onClick={() => setMounted(false)}
                    style={modeBtn(!mounted)}>
                    <Footprints size={11} /> On foot
                  </button>
                  <button onClick={() => setMounted(true)}
                    style={modeBtn(mounted)}
                    title="Mount gallops at double speed for the first hour, then travels at the chosen pace.">
                    🐴 Mounted
                  </button>
                </div>

                {/* Time */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '2px 0' }}>
                  <span style={{ fontSize: 20, fontWeight: 600, color: '#fff' }}>≈ {formatDuration(travel.hours)}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    {travel.days >= 1 ? `${Math.round(travel.days * 10) / 10} days @ ${HOURS_PER_DAY} h/day` : 'within a day'}
                  </span>
                </div>
                {mounted && travel.gallopMiles > 0 && (
                  <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>
                    Gallop hour covers {formatDistance(travel.gallopMiles, displayUnit)}, then {PACES[pace].label.toLowerCase()} pace.
                  </div>
                )}

                {/* Forced march */}
                {march.count > 0 && (
                  <div style={{ marginTop: 10, padding: '8px 9px', background: 'rgba(200,60,50,0.12)', border: '1px solid rgba(200,60,50,0.3)', borderRadius: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                      <AlertTriangle size={12} style={{ color: '#e08a7a' }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#eaa' }}>
                        Forced march — {march.count} CON save{march.count === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 5 }}>
                      {march.saves.map(s => (
                        <span key={s.hour} style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 3, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.75)' }}>
                          h{s.hour} · DC {s.dc}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', lineHeight: 1.45 }}>
                      Each failed save = 1 level of exhaustion (past {HOURS_PER_DAY} h in one day).
                      {mounted && ' Reflects pushing past 8 h of riding.'}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function modeBtn(active: boolean): React.CSSProperties {
  return {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    padding: '5px 0', fontSize: 11, borderRadius: 4, cursor: 'pointer',
    border: `1px solid ${active ? 'rgba(200,115,58,0.5)' : 'rgba(255,255,255,0.12)'}`,
    background: active ? 'rgba(200,115,58,0.22)' : 'rgba(255,255,255,0.05)',
    color: active ? '#c8733a' : 'rgba(255,255,255,0.6)',
  }
}

// Compact mi/km segmented toggle.
function UnitToggle({ value, onChange, small }: {
  value: 'mi' | 'km'; onChange: (u: 'mi' | 'km') => void; small?: boolean
}) {
  return (
    <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 4, overflow: 'hidden' }}>
      {(['mi', 'km'] as const).map(u => (
        <button key={u} onClick={() => onChange(u)}
          style={{
            padding: small ? '1px 7px' : '0 9px', height: small ? 18 : 26, fontSize: 10.5, cursor: 'pointer', border: 'none',
            background: value === u ? 'rgba(200,115,58,0.28)' : 'transparent',
            color: value === u ? '#c8733a' : 'rgba(255,255,255,0.5)',
          }}>
          {u}
        </button>
      ))}
    </div>
  )
}
