// path: src/components/SectionHeader.tsx
// The header row every top-level section (Wiki, Sessions, DM Notes, Loot
// Tables, Webs, Timeline, Soundboard) now shares: a Back link with a
// divider rule, an icon, the title as an h1, optional meta text and optional
// right-aligned actions. Each section keeps its own icon color via `accent`
// — only the layout and type scale are unified. Lifted out of the wiki's own
// WikiHeaderBar, which every other section had independently (and
// inconsistently) reinvented.
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export default function SectionHeader({ icon: Icon, title, accent = 'var(--gold)', meta, actions, onBack }: {
  icon: LucideIcon
  title: string
  /** The section's own accent color for the icon. Defaults to gold for
   *  sections that don't have one of their own (e.g. Sessions). */
  accent?: string
  meta?: ReactNode
  actions?: ReactNode
  onBack: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', borderRight: '1px solid var(--border)', paddingRight: 12, marginRight: 4, color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', transition: 'color var(--transition)' }}
          className="hover-text">
          <ArrowLeft size={14} /> Back
        </button>
        <Icon size={22} color={accent} />
        <h1 style={{ fontSize: 22, letterSpacing: '0.05em', margin: 0 }}>{title}</h1>
        {meta && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {meta}
          </span>
        )}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{actions}</div>}
    </div>
  )
}
