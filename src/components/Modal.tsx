import type { ReactNode, CSSProperties } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  style?: CSSProperties
}

export default function Modal({ title, onClose, children, style }: ModalProps) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={style}>
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  )
}
