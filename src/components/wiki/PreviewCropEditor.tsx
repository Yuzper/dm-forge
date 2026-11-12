// path: src/components/wiki/PreviewCropEditor.tsx
// Edit-mode framing for the hover card picture: the whole image, with a box at
// the card's aspect showing which part the card shows. Drag the box to move it,
// drag a corner to resize it (the aspect stays fixed). Saved on release.
import { useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { RotateCcw } from 'lucide-react'
import { PREVIEW_ASPECT, defaultCropRect, fitCropToAspect, parsePreviewCrop, type CropRect } from '../../utils/previewCrop'

type Corner = 'tl' | 'tr' | 'bl' | 'br'
type Gesture =
  | { kind: 'move'; px: number; py: number; start: CropRect }
  | { kind: 'resize'; corner: Corner; start: CropRect }

const MIN_BOX_PX = 36
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function PreviewCropEditor({ path, value, onChange }: {
  /** Image path as stored on the article (no file:// prefix). */
  path: string
  /** The stored crop JSON ('' = default). */
  value: string
  onChange: (json: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [live, setLive] = useState<CropRect | null>(null)   // during a gesture
  const gesture = useRef<Gesture | null>(null)

  // A crop saved for an older card shape is reshaped to the current one.
  const parsed = parsePreviewCrop(value, path)
  const saved = parsed && dims ? fitCropToAspect(parsed, dims.w, dims.h) : parsed
  const base: CropRect | null = saved ?? (dims ? defaultCropRect(dims.w, dims.h) : null)
  const crop = live ?? base
  const custom = !!saved

  // h = k · w keeps the box at the card's aspect in image pixels.
  const k = dims ? dims.w / (PREVIEW_ASPECT * dims.h) : 1

  const frac = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect()
    return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, rw: r.width }
  }

  const begin = (e: RPointerEvent, g: Gesture) => {
    if (e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    gesture.current = g
    setLive(g.start)
  }

  const onMove = (e: RPointerEvent) => {
    const g = gesture.current
    if (!g || !dims) return
    const { fx, fy, rw } = frac(e)
    if (g.kind === 'move') {
      const s = g.start
      setLive({ ...s, x: clamp(s.x + fx - g.px, 0, 1 - s.w), y: clamp(s.y + fy - g.py, 0, 1 - s.h) })
      return
    }
    // Resize about the opposite corner, which stays put.
    const s = g.start
    const right = g.corner === 'tr' || g.corner === 'br'
    const bottom = g.corner === 'bl' || g.corner === 'br'
    const ax = right ? s.x : s.x + s.w
    const ay = bottom ? s.y : s.y + s.h
    const want = Math.max(Math.abs(fx - ax), Math.abs(fy - ay) / k)
    const maxW = Math.min(right ? 1 - ax : ax, (bottom ? 1 - ay : ay) / k)
    const minW = Math.min(maxW, MIN_BOX_PX / rw)
    const w = clamp(want, minW, maxW)
    const h = w * k
    setLive({ w, h, x: right ? ax : ax - w, y: bottom ? ay : ay - h })
  }

  const end = () => {
    const g = gesture.current
    gesture.current = null
    if (!g || !live) { setLive(null); return }
    const moved = (['x', 'y', 'w', 'h'] as const).some(key => Math.abs(live[key] - g.start[key]) > 1e-4)
    if (moved) {
      const r = (n: number) => Math.round(n * 10000) / 10000
      onChange(JSON.stringify({ src: path, x: r(live.x), y: r(live.y), w: r(live.w), h: r(live.h) }))
    }
    setLive(null)
  }

  const handle = (corner: Corner) => (
    <div
      key={corner}
      onPointerDown={e => crop && begin(e, { kind: 'resize', corner, start: crop })}
      style={{
        position: 'absolute', width: 10, height: 10,
        background: 'var(--gold)', border: '1px solid #000', borderRadius: 2,
        cursor: corner === 'tl' || corner === 'br' ? 'nwse-resize' : 'nesw-resize',
        ...(corner[0] === 't' ? { top: -6 } : { bottom: -6 }),
        ...(corner[1] === 'l' ? { left: -6 } : { right: -6 }),
      }}
    />
  )

  return (
    <div>
      <div
        ref={wrapRef}
        data-preview-crop
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
        style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-sm)', userSelect: 'none', touchAction: 'none' }}
      >
        <img
          src={`file://${path}`}
          draggable={false}
          onLoad={e => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          style={{ width: '100%', display: 'block' }}
        />
        {crop && (
          <div
            data-crop-box
            title="Hover-card picture. Drag to move, drag a corner to resize."
            onPointerDown={e => begin(e, { kind: 'move', ...(() => { const { fx, fy } = frac(e); return { px: fx, py: fy } })(), start: crop })}
            style={{
              position: 'absolute',
              left: `${crop.x * 100}%`, top: `${crop.y * 100}%`,
              width: `${crop.w * 100}%`, height: `${crop.h * 100}%`,
              border: `1.5px ${custom || live ? 'solid' : 'dashed'} var(--gold)`,
              // Dim everything outside the box.
              boxShadow: '0 0 0 2000px rgba(0,0,0,0.6)',
              cursor: live && gesture.current?.kind === 'move' ? 'grabbing' : 'grab',
            }}
          >
            {(['tl', 'tr', 'bl', 'br'] as const).map(handle)}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.35 }}>
        <span style={{ flex: 1 }}>
          Box = hover-card picture. Drag to move, corners to resize.
        </span>
        {custom && (
          <button onClick={() => onChange('')} title="Back to the default framing"
            style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10.5, padding: 0, flexShrink: 0 }}
            className="hover-text">
            <RotateCcw size={10} /> Reset
          </button>
        )}
      </div>
    </div>
  )
}
