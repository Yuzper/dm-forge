// path: src/components/FindBar.tsx
import { useState, useEffect, useRef } from 'react'
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react'

// Ctrl+F find bar backed by Chromium's native find-in-page: every match on the
// current page is highlighted, the active match is scrolled into view, and the
// count arrives via the 'find:result' event forwarded from the main process.
export default function FindBar() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [result, setResult] = useState<{ matches: number; active: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
    window.api.onFindResult(r => setResult(r))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setOpen(true)
        setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 0)
      } else if (e.key === 'Escape' && openRef.current) {
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const close = () => {
    setOpen(false)
    setText('')
    setResult(null)
    window.api.stopFindInPage()
  }

  // Live search: restart on every edit; clear highlights when emptied.
  useEffect(() => {
    if (!open) return
    if (text.trim() === '') {
      setResult(null)
      window.api.stopFindInPage()
      return
    }
    window.api.findInPage(text, { findNext: false })
  }, [text, open])

  const step = (forward: boolean) => {
    if (text.trim() === '') return
    window.api.findInPage(text, { forward, findNext: true })
  }

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      step(!e.shiftKey)
    }
  }

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', top: 14, right: 18, zIndex: 250,
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
      padding: '7px 10px',
    }}>
      <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <input
        ref={inputRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={onInputKey}
        placeholder="Find on page…"
        style={{ width: 180, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}
      />
      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 40, textAlign: 'right', flexShrink: 0 }}>
        {text.trim() && result ? `${result.matches === 0 ? 0 : result.active}/${result.matches}` : ''}
      </span>
      <button onClick={() => step(false)} title="Previous (Shift+Enter)"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
        <ChevronUp size={14} />
      </button>
      <button onClick={() => step(true)} title="Next (Enter)"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
        <ChevronDown size={14} />
      </button>
      <button onClick={close} title="Close (Esc)"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
        <X size={14} />
      </button>
    </div>
  )
}
