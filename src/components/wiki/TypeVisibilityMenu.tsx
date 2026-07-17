// path: src/components/wiki/TypeVisibilityMenu.tsx
// Shared "Hide types" control + persistence hook, used by both the wiki list
// and the wiki graph to remove whole article types from view. Each view keeps
// its own preference (own storage key + default) but shares this UI.

import { useState, useRef } from 'react'
import { EyeOff, ChevronDown, Check } from 'lucide-react'
import { ARTICLE_TYPES } from './wikiConstants'
import { useMenuClose } from '../../hooks/useMenuClose'

export function useExcludedTypes(storageKey: string, computeDefault: () => Set<string>) {
  const [excluded, setExcluded] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) return new Set(JSON.parse(saved))
    } catch {}
    return computeDefault()
  })
  const persist = (next: Set<string>) => localStorage.setItem(storageKey, JSON.stringify([...next]))
  const toggle = (type: string) => setExcluded(prev => {
    const next = new Set(prev)
    next.has(type) ? next.delete(type) : next.add(type)
    persist(next)
    return next
  })
  const clear = () => setExcluded(() => { persist(new Set()); return new Set() })
  return { excluded, toggle, clear }
}

export function TypeVisibilityMenu({ excluded, onToggle, onClear }: {
  excluded: Set<string>
  onToggle: (type: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useMenuClose(open, ref, setOpen)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Hide whole article types from this view"
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99,
          border: `1px solid ${excluded.size > 0 ? 'var(--border-gold)' : 'var(--border-light)'}`,
          background: open ? 'var(--bg-elevated)' : 'transparent',
          color: excluded.size > 0 ? 'var(--gold)' : 'var(--text-muted)',
          fontSize: 11, cursor: 'pointer', transition: 'all 120ms ease',
        }}>
        <EyeOff size={11} /> Hide types
        {excluded.size > 0 && (
          <span style={{ fontSize: 10, background: 'var(--gold-glow)', color: 'var(--gold)', borderRadius: 99, padding: '0 6px' }}>
            {excluded.size}
          </span>
        )}
        <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 100,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
          minWidth: 190, padding: '4px 0', maxHeight: 340, overflowY: 'auto',
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 14px 4px' }}>
            Show in view
          </div>
          {ARTICLE_TYPES.map(t => {
            const Icon = t.icon
            const shown = !excluded.has(t.value)
            return (
              <button key={t.value} onClick={() => onToggle(t.value)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '7px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: shown ? 'var(--text-secondary)' : 'var(--text-muted)', textAlign: 'left' }}
                className="hover-bg">
                <div style={{
                  width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                  border: `1.5px solid ${shown ? t.color : 'var(--border)'}`,
                  background: shown ? t.color : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {shown && <Check size={9} color="#000" />}
                </div>
                <Icon size={12} color={t.color} style={{ opacity: shown ? 1 : 0.5, flexShrink: 0 }} />
                <span style={{ textDecoration: shown ? 'none' : 'line-through' }}>{t.label}</span>
              </button>
            )
          })}
          {excluded.size > 0 && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <button onClick={onClear}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', textAlign: 'left' }}
                className="hover-bg">
                Show all types
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
