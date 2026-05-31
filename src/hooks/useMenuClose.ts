import { useEffect, RefObject } from 'react'

export function useMenuClose(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  setOpen: (v: boolean) => void,
) {
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
}
