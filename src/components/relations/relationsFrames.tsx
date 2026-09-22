// path: src/components/relations/relationsFrames.tsx
// Portrait frames for card-style relation nodes. A frame is a square overlay
// drawn on top of the portrait; it owns the aperture (how far the portrait is
// inset, and what shape it's cut to) so the art and the image always line up.
// The track tint painted on the card sits *below* all of this.
import { useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'

// ── Frame spec ────────────────────────────────────────────────────────────────
// Stored per node (relation_nodes.frame) and per web (relation_webs.node_style).
// A built-in is just its id; a custom image round-trips as JSON so the aperture
// inset the DM dialled in travels with it.
export interface FrameSpec {
  id: string
  src?: string     // custom frame image (absolute path)
  inset?: number   // aperture inset, % of the frame box — custom frames only
}

export function parseFrame(raw: string | null | undefined): FrameSpec | null {
  if (!raw) return null
  if (raw.startsWith('{')) {
    try {
      const o = JSON.parse(raw)
      return o && typeof o.id === 'string' ? o as FrameSpec : null
    } catch { return null }
  }
  return { id: raw }
}

export function serializeFrame(spec: FrameSpec | null): string {
  if (!spec) return ''
  return spec.id === 'custom' ? JSON.stringify(spec) : spec.id
}

// Node override wins; otherwise the web default; otherwise plain.
export function resolveFrame(nodeFrame: string | null | undefined, webFrame: FrameSpec | null): FrameSpec {
  return parseFrame(nodeFrame) ?? webFrame ?? { id: 'none' }
}

// ── Built-in frames ───────────────────────────────────────────────────────────

interface FrameDef {
  id: string
  label: string
  inset: number            // aperture inset, % of the box
  portraitRadius?: string  // CSS border-radius for the portrait inside the aperture
  plate?: string           // colour shown behind a missing portrait
  overlay: () => React.ReactNode
}

const svgProps = {
  viewBox: '0 0 100 100',
  preserveAspectRatio: 'none' as const,
  style: { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', pointerEvents: 'none' as const },
}

// Four copies of a corner motif, rotated into place.
function Corners({ children }: { children: React.ReactNode }) {
  return (
    <>
      {[0, 90, 180, 270].map(deg => (
        <g key={deg} transform={`rotate(${deg} 50 50)`}>{children}</g>
      ))}
    </>
  )
}

function MetalFrame({ light, mid, dark, id }: { light: string; mid: string; dark: string; id: string }) {
  return (
    <svg {...svgProps}>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor={light} />
          <stop offset="45%"  stopColor={mid} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
      </defs>
      <rect x="1.2" y="1.2" width="97.6" height="97.6" rx="1.5" fill="none" stroke={`url(#${id}-g)`} strokeWidth="6" />
      <rect x="4.4" y="4.4" width="91.2" height="91.2" fill="none" stroke={dark} strokeWidth="0.8" opacity="0.7" />
      <rect x="1.4" y="1.4" width="97.2" height="97.2" fill="none" stroke={light} strokeWidth="0.6" opacity="0.6" />
      <Corners>
        <path d="M4 4 L14 4 L4 14 Z" fill={light} opacity="0.85" />
        <circle cx="9" cy="9" r="1.6" fill={dark} />
      </Corners>
    </svg>
  )
}

export const FRAMES: FrameDef[] = [
  {
    id: 'none', label: 'None', inset: 0,
    overlay: () => null,
  },
  {
    id: 'thin', label: 'Thin', inset: 3,
    overlay: () => (
      <svg {...svgProps}>
        <rect x="1" y="1" width="98" height="98" rx="2" fill="none" stroke="var(--border-light)" strokeWidth="2" />
        <Corners>
          <path d="M1 12 L1 1 L12 1" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" />
        </Corners>
      </svg>
    ),
  },
  {
    id: 'double', label: 'Double rule', inset: 6,
    overlay: () => (
      <svg {...svgProps}>
        <rect x="1" y="1" width="98" height="98" fill="none" stroke="var(--border-light)" strokeWidth="1.6" />
        <rect x="5" y="5" width="90" height="90" fill="none" stroke="var(--border-light)" strokeWidth="0.9" opacity="0.8" />
      </svg>
    ),
  },
  {
    id: 'gold', label: 'Gilt', inset: 7,
    plate: '#2a2317',
    overlay: () => <MetalFrame id="fr-gold" light="#f0d98c" mid="#c8a84b" dark="#6e5417" />,
  },
  {
    id: 'silver', label: 'Silver', inset: 7,
    plate: '#1f2228',
    overlay: () => <MetalFrame id="fr-silver" light="#e8ecf2" mid="#a8b0bd" dark="#565e6b" />,
  },
  {
    id: 'stone', label: 'Stone', inset: 8,
    plate: '#24252a',
    overlay: () => (
      <svg {...svgProps}>
        <defs>
          <linearGradient id="fr-stone-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9a9a96" />
            <stop offset="100%" stopColor="#5d5d5a" />
          </linearGradient>
        </defs>
        {/* Notched corners give the slab a chiselled outline */}
        <path
          d="M10 1 H90 L99 10 V90 L90 99 H10 L1 90 V10 Z"
          fill="none" stroke="url(#fr-stone-g)" strokeWidth="7" strokeLinejoin="miter"
        />
        <path d="M10 1 H90 L99 10 V90 L90 99 H10 L1 90 V10 Z" fill="none" stroke="#3c3c3a" strokeWidth="0.9" />
        <path d="M13 6 H87 L94 13 V87 L87 94 H13 L6 87 V13 Z" fill="none" stroke="#33332f" strokeWidth="1" opacity="0.8" />
      </svg>
    ),
  },
  {
    id: 'wood', label: 'Carved wood', inset: 8,
    plate: '#241b14',
    overlay: () => (
      <svg {...svgProps}>
        <defs>
          <linearGradient id="fr-wood-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor="#a5754a" />
            <stop offset="50%"  stopColor="#7a4f2c" />
            <stop offset="100%" stopColor="#4a2d18" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="98" height="98" rx="2" fill="none" stroke="url(#fr-wood-g)" strokeWidth="7" />
        <rect x="4.8" y="4.8" width="90.4" height="90.4" fill="none" stroke="#2e1c0f" strokeWidth="1" />
        {/* Grain — on the rails only, never across the portrait */}
        <path
          d="M1 30 H8 M92 30 H99 M1 62 H8 M92 62 H99 M32 1 V8 M32 92 V99 M68 1 V8 M68 92 V99"
          stroke="#3b2413" strokeWidth="0.5" opacity="0.55"
        />
        <Corners>
          <rect x="2" y="2" width="9" height="9" fill="#8a5c34" stroke="#2e1c0f" strokeWidth="0.8" />
        </Corners>
      </svg>
    ),
  },
  {
    id: 'medallion', label: 'Medallion', inset: 9, portraitRadius: '50%',
    plate: '#22242b',
    overlay: () => (
      <svg {...svgProps}>
        <defs>
          <linearGradient id="fr-med-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#d9c07a" />
            <stop offset="100%" stopColor="#7a6128" />
          </linearGradient>
          <mask id="fr-med-m">
            <rect x="0" y="0" width="100" height="100" fill="white" />
            <circle cx="50" cy="50" r="41" fill="black" />
          </mask>
        </defs>
        {/* Plate with a round hole, so the square card reads as a mounted medallion */}
        <rect x="1" y="1" width="98" height="98" rx="3" fill="var(--bg-elevated)" mask="url(#fr-med-m)" opacity="0.92" />
        <rect x="1" y="1" width="98" height="98" rx="3" fill="none" stroke="var(--border)" strokeWidth="1.4" />
        <circle cx="50" cy="50" r="41" fill="none" stroke="url(#fr-med-g)" strokeWidth="4" />
        <circle cx="50" cy="50" r="44.5" fill="none" stroke="var(--border-light)" strokeWidth="0.8" />
      </svg>
    ),
  },
  {
    id: 'arch', label: 'Gothic arch', inset: 8,
    portraitRadius: '46% 46% 4px 4px / 34% 34% 4px 4px',
    plate: '#1e2029',
    overlay: () => (
      <svg {...svgProps}>
        <defs>
          <mask id="fr-arch-m">
            <rect x="0" y="0" width="100" height="100" fill="white" />
            <path d="M8 96 V44 A42 42 0 0 1 92 44 V96 Z" fill="black" />
          </mask>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="var(--bg-elevated)" mask="url(#fr-arch-m)" opacity="0.94" />
        <path d="M8 96 V44 A42 42 0 0 1 92 44 V96" fill="none" stroke="#8c7fd0" strokeWidth="2.6" />
        <path d="M4 99 V43 A46 46 0 0 1 96 43 V99" fill="none" stroke="var(--border-light)" strokeWidth="1.2" />
        <rect x="1" y="1" width="98" height="98" fill="none" stroke="var(--border)" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    id: 'banner', label: 'Banner', inset: 6,
    overlay: () => (
      <svg {...svgProps}>
        <rect x="1" y="1" width="98" height="98" fill="none" stroke="var(--border-light)" strokeWidth="2" />
        {/* Ribbon across the foot of the portrait */}
        <path d="M0 78 H100 V93 L92 86 H8 L0 93 Z" fill="var(--bg-elevated)" opacity="0.93" />
        <path d="M0 78 H100" stroke="var(--border-light)" strokeWidth="1.2" />
        <path d="M0 93 L8 86 H92 L100 93" fill="none" stroke="var(--border-light)" strokeWidth="1.2" />
      </svg>
    ),
  },
]

export const FRAMES_BY_ID: Record<string, FrameDef> = Object.fromEntries(FRAMES.map(f => [f.id, f]))

// Aperture geometry for a spec — built-ins carry their own, custom images use
// the DM's inset (the art decides where the window is, so we can't guess).
export function frameGeometry(spec: FrameSpec): { inset: number; radius?: string; plate?: string } {
  if (spec.id === 'custom') return { inset: spec.inset ?? 12 }
  const def = FRAMES_BY_ID[spec.id]
  return { inset: def?.inset ?? 0, radius: def?.portraitRadius, plate: def?.plate }
}

// ── Overlay ───────────────────────────────────────────────────────────────────

export function FrameOverlay({ spec }: { spec: FrameSpec }) {
  if (spec.id === 'custom') {
    if (!spec.src) return null
    return (
      <img
        src={`file://${spec.src}`} alt="" draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', userSelect: 'none' }}
      />
    )
  }
  return <>{FRAMES_BY_ID[spec.id]?.overlay() ?? null}</>
}

// ── Picker ────────────────────────────────────────────────────────────────────

function FrameSwatch({ spec, size = 46 }: { spec: FrameSpec; size?: number }) {
  const geo = frameGeometry(spec)
  const pad = (geo.inset / 100) * size
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        position: 'absolute', left: pad, top: pad, right: pad, bottom: pad,
        background: geo.plate ?? 'var(--bg-base)', borderRadius: geo.radius ?? 2,
      }} />
      <FrameOverlay spec={spec} />
    </div>
  )
}

export function FramePicker({
  value, onChange, allowInherit, inheriting, onInherit,
}: {
  value: FrameSpec
  onChange: (spec: FrameSpec) => void
  allowInherit?: boolean       // per-node pickers can fall back to the web default
  inheriting?: boolean
  onInherit?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const isCustom = value.id === 'custom'

  const pickImage = async () => {
    setBusy(true)
    try {
      const rel = await (window as any).api.selectImageFile()
      if (!rel) return
      const full = await (window as any).api.getImagePath(rel)
      onChange({ id: 'custom', src: String(full).replace('file://', ''), inset: value.inset ?? 12 })
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {FRAMES.map(f => {
          const active = !inheriting && !isCustom && value.id === f.id
          return (
            <button
              key={f.id}
              onClick={() => onChange({ id: f.id })}
              title={f.label}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '5px 2px', cursor: 'pointer', background: active ? 'var(--bg-elevated)' : 'transparent',
                border: `1px solid ${active ? '#AFA9EC' : 'transparent'}`,
                borderRadius: 'var(--radius-sm)',
              }}
              className="hover-bg-elevated"
            >
              <FrameSwatch spec={{ id: f.id }} />
              <span style={{ fontSize: 9, color: active ? '#7F77DD' : 'var(--text-muted)', textAlign: 'center', lineHeight: 1.2 }}>
                {f.label}
              </span>
            </button>
          )
        })}
        {/* Custom image slot */}
        <button
          onClick={pickImage}
          disabled={busy}
          title="Use your own frame image"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '5px 2px', cursor: 'pointer', background: isCustom ? 'var(--bg-elevated)' : 'transparent',
            border: `1px dashed ${isCustom && !inheriting ? '#AFA9EC' : 'var(--border)'}`,
            borderRadius: 'var(--radius-sm)',
          }}
          className="hover-bg-elevated"
        >
          {isCustom && value.src
            ? <FrameSwatch spec={value} />
            : (
              <div style={{ width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <ImagePlus size={17} />
              </div>
            )}
          <span style={{ fontSize: 9, color: isCustom ? '#7F77DD' : 'var(--text-muted)' }}>Custom…</span>
        </button>
      </div>

      {/* Custom art can put its window anywhere, so the inset is dialled by hand */}
      {isCustom && value.src && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Aperture inset</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{value.inset ?? 12}%</span>
              <button
                onClick={() => onChange({ id: 'none' })}
                title="Remove custom frame"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 1 }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
          <input
            type="range" min={0} max={35} step={1}
            value={value.inset ?? 12}
            onChange={e => onChange({ ...value, inset: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#7F77DD' }}
          />
        </div>
      )}

      {allowInherit && (
        <button
          onClick={onInherit}
          style={{
            marginTop: 8, width: '100%', padding: '4px 8px', fontSize: 11, cursor: 'pointer',
            background: inheriting ? 'var(--bg-elevated)' : 'none',
            border: `1px solid ${inheriting ? '#AFA9EC' : 'var(--border)'}`,
            borderRadius: 'var(--radius-sm)',
            color: inheriting ? '#7F77DD' : 'var(--text-muted)',
          }}
          className="hover-bg-elevated"
        >
          Use web default
        </button>
      )}
    </div>
  )
}
