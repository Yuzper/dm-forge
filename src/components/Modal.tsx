import type { ReactNode, CSSProperties } from 'react'

interface ModalProps {
  title: ReactNode
  // When omitted, clicking the overlay does nothing (for confirm-style modals
  // that must be answered with a button).
  onClose?: () => void
  children: ReactNode
  style?: CSSProperties
  titleStyle?: CSSProperties
}

export default function Modal({ title, onClose, children, style, titleStyle }: ModalProps) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={style}>
        <div className="modal-title" style={titleStyle}>{title}</div>
        {children}
      </div>
    </div>
  )
}
