// path: src/hooks/useConfirmDelete.ts
import { useState, useCallback } from 'react'

export function useConfirmDelete(timeout = 3000) {
  const [confirming, setConfirming] = useState(false)

  const trigger = useCallback((onConfirm: () => void) => {
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), timeout)
    } else {
      setConfirming(false)
      onConfirm()
    }
  }, [confirming, timeout])

  return { confirming, trigger }
}