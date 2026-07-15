// path: src/components/DropdownPortal.tsx
// Dropdown menu rendered into document.body with fixed positioning so it
// overlays overflow:hidden ancestors (e.g. quest substep/reward rows) instead
// of being clipped by them. Closes on outside click, scroll, resize or Escape.

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export default function DropdownPortal({ anchor, align = 'left', minWidth = 120, onClose, children }: {
  anchor: HTMLElement | null
  align?: 'left' | 'right'
  minWidth?: number
  onClose: () => void
  children: React.ReactNode
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null)

  // Position after first render so the menu height is measurable; flip upward
  // when there isn't enough room below the anchor.
  useLayoutEffect(() => {
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const menuH = menuRef.current?.offsetHeight ?? 0
    const openUp = rect.bottom + 4 + menuH > window.innerHeight && rect.top - menuH - 4 > 0
    const top = openUp ? rect.top - menuH - 4 : rect.bottom + 4
    setPos(align === 'left'
      ? { top, left: rect.left }
      : { top, right: window.innerWidth - rect.right })
  }, [anchor, align])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || anchor?.contains(t)) return
      onClose()
    }
    const onScrollOrResize = () => onClose()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: pos?.top ?? 0,
        left: pos?.left,
        right: pos?.right,
        visibility: pos ? 'visible' : 'hidden',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-light)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)',
        zIndex: 1000,
        overflow: 'hidden',
        minWidth,
      }}
    >
      {children}
    </div>,
    document.body
  )
}
