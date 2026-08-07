// path: src/hooks/useTabShortcuts.ts
// Browser-standard tab chords. Ctrl+W is available because Stage 0's app menu
// deliberately left it unbound — with Electron's stock menu it would have closed
// the window before ever reaching the renderer.
import { useEffect } from 'react'
import { useStore } from '../store/store'

/** Typing in a field or the rich editor must win over every chord here. */
function inTextEntry(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export function useTabShortcuts() {
  const { tabs, closeTab, cycleTab, selectTabByIndex, openTab, activeTabId, currentCampaign } = useStore()

  useEffect(() => {
    if (!currentCampaign) return

    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return

      // Ctrl+Tab cycles even from inside the editor — it can't be a text chord.
      if (e.key === 'Tab') {
        e.preventDefault()
        void cycleTab(e.shiftKey ? -1 : 1)
        return
      }

      if (inTextEntry(e.target)) return

      const key = e.key.toLowerCase()
      if (key === 't') {
        e.preventDefault()
        void openTab({ type: 'campaign', subView: 'hub' })
      } else if (key === 'w') {
        e.preventDefault()
        if (activeTabId) void closeTab(activeTabId)
      } else if (/^[1-9]$/.test(e.key)) {
        e.preventDefault()
        // Ctrl+9 is "last tab", matching browsers; selectTabByIndex clamps.
        void selectTabByIndex(e.key === '9' ? tabs.length - 1 : Number(e.key) - 1)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tabs.length, activeTabId, currentCampaign, closeTab, cycleTab, selectTabByIndex, openTab])
}
