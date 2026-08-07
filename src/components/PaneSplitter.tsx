// path: src/components/PaneSplitter.tsx
// The draggable divider between two panes. Pointer capture keeps the drag alive
// over the panes' own content, which would otherwise swallow the move events.
import { useRef, useState } from 'react'
import { useStore } from '../store/store'

export default function PaneSplitter() {
  const { setSplitRatio, persistWorkspace } = useStore()
  const [dragging, setDragging] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const row = ref.current?.parentElement
    if (!row) return
    setDragging(true)
    ref.current!.setPointerCapture(e.pointerId)

    const onMove = (ev: PointerEvent) => {
      const rect = row.getBoundingClientRect()
      setSplitRatio((ev.clientX - rect.left) / rect.width)
    }
    const onUp = () => {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      persistWorkspace()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onDoubleClick={() => { setSplitRatio(0.5); persistWorkspace() }}
      title="Drag to resize · double-click to even out"
      style={{
        width: 6, flexShrink: 0, cursor: 'col-resize',
        background: dragging ? 'var(--gold)' : 'var(--border)',
        transition: dragging ? 'none' : 'background 120ms',
      }}
      className={dragging ? '' : 'hover-bg-gold'}
    >
      {/* Hit area is the full 6px; the visible line is the background itself. */}
    </div>
  )
}
