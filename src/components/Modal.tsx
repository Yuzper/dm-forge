import { useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { GripVertical, X } from 'lucide-react'

interface ModalProps {
  title: ReactNode
  // When omitted, clicking the overlay does nothing (for confirm-style modals
  // that must be answered with a button).
  onClose?: () => void
  children: ReactNode
  style?: CSSProperties
  titleStyle?: CSSProperties
  /**
   * Renders as a movable panel instead of a centered, dimmed dialog: the
   * backdrop stays clear and click-through so whatever it's editing (a map,
   * a canvas) stays visible and usable underneath, and the title bar drags
   * the panel out of the way instead of blocking the view of it.
   */
  floating?: boolean
}

export default function Modal({ title, onClose, children, style, titleStyle, floating = false }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  const startDrag = (e: React.MouseEvent) => {
    if (!floating || !modalRef.current) return
    // Ignore drags started from the close button.
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const rect = modalRef.current.getBoundingClientRect()
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos?.x ?? rect.left, origY: pos?.y ?? rect.top }
    const onMove = (mv: MouseEvent) => {
      if (!dragRef.current) return
      setPos({
        x: dragRef.current.origX + (mv.clientX - dragRef.current.startX),
        y: dragRef.current.origY + (mv.clientY - dragRef.current.startY),
      })
    }
    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose?.()}
      style={floating ? { background: 'transparent', backdropFilter: 'none', pointerEvents: 'none' } : undefined}>
      <div ref={modalRef} className="modal" style={{
        ...style,
        ...(floating ? { pointerEvents: 'auto' } : undefined),
        ...(floating && pos ? { position: 'fixed', left: pos.x, top: pos.y, margin: 0 } : undefined),
      }}>
        <div className="modal-title" onMouseDown={startDrag}
          style={floating
            ? { ...titleStyle, cursor: 'grab', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
            : titleStyle}>
          {floating ? (
            <>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <GripVertical size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
                {title}
              </span>
              {onClose && (
                <button onClick={onClose}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2, flexShrink: 0 }}>
                  <X size={16} />
                </button>
              )}
            </>
          ) : title}
        </div>
        {children}
      </div>
    </div>
  )
}
