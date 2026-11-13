// path: src/hooks/useThrottledCommit.ts
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A control that streams values while it is being dragged (the colour picker,
 * a slider) without streaming them into the store.
 *
 * Every store update re-renders each component that reads the whole store -- the
 * app root and the open map canvas among them -- and also writes localStorage
 * and sends a message to the table window. The native colour picker fires an
 * input event on every pixel of a drag, so committing each one made the picker
 * stutter. The control follows the pointer through local state (instant, cheap)
 * and the store is only updated about every `ms`, plus once more at the end so
 * the final value is never lost.
 */
export function useThrottledCommit<T>(committed: T, commit: (v: T) => void, ms = 90) {
  const [draft, setDraft] = useState<T>(committed)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<{ v: T } | null>(null)
  const lastAt = useRef(0)
  const commitRef = useRef(commit)
  commitRef.current = commit

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (pending.current) {
      const { v } = pending.current
      pending.current = null
      lastAt.current = Date.now()
      commitRef.current(v)
    }
  }, [])

  // Follow outside changes (another surface, a reset) but never fight a drag.
  useEffect(() => { if (!pending.current) setDraft(committed) }, [committed])
  useEffect(() => flush, [flush])

  const update = useCallback((v: T) => {
    setDraft(v)
    pending.current = { v }
    const wait = ms - (Date.now() - lastAt.current)
    if (wait <= 0) flush()
    else if (!timer.current) timer.current = setTimeout(flush, wait)
  }, [ms, flush])

  return [draft, update, flush] as const
}
