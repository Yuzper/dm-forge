// path: src/components/sidebar/sidebarShared.tsx
// The sidebar's building blocks, shared by the expanded panel and the collapsed
// rail so the two can never drift apart: one nav row, one rail icon, one group
// label.
//
// The layouts differ only in *chrome* — which sections are visible. What each
// row means, and what it does, is derived once in `useSidebarNav` and rendered
// by both.
import type React from 'react'
import { useStore } from '../../store/store'
import { NAV_ITEMS } from '../../constants/sections'
import type { Location } from '../../store/location'
import type { LucideIcon } from 'lucide-react'
import { Scroll } from 'lucide-react'

export const RAIL_WIDTH = 54

// ── Nav model ─────────────────────────────────────────────────────────────────

export interface SidebarNavItem {
  key: string
  label: string
  icon: LucideIcon
  accent: string
  active: boolean
  /** Where the row points — also what its right-click menu opens. */
  loc: Location
  onClick: () => void
}

/**
 * Sessions plus the six campaign sections, with their active state resolved.
 * The campaign hub is deliberately *not* here: it renders as the campaign's own
 * title row when expanded and as a plain icon on the rail, so it has no single
 * shared presentation.
 */
export function useSidebarNav(): SidebarNavItem[] {
  const { view, campaignSubView, setView, setCampaignSubView } = useStore()

  return [
    {
      key: 'sessions',
      label: 'Sessions',
      icon: Scroll,
      accent: 'var(--gold)',
      active: view === 'campaign' && campaignSubView === 'sessions',
      loc: { type: 'campaign', subView: 'sessions' },
      onClick: () => { setView('campaign'); setCampaignSubView('sessions') },
    },
    ...NAV_ITEMS.map(({ view: v, label, icon, accent }) => ({
      key: v,
      label,
      icon,
      accent,
      active: view === v,
      loc: { type: v } as Location,
      onClick: () => setView(v),
    })),
  ]
}

// ── Rows ──────────────────────────────────────────────────────────────────────

/**
 * The one row shape in the expanded sidebar. Active rows get an accent tint plus
 * a left bar rather than a border, so a run of rows reads as one column instead
 * of a stack of boxes — the thing the old three-bordered-blocks layout got wrong.
 */
export function NavRow({
  icon, label, active = false, accent = 'var(--gold)', size = 'md', display = false,
  title, trailing, className, onClick, onContextMenu,
}: {
  icon: React.ReactNode
  label: React.ReactNode
  active?: boolean
  accent?: string
  size?: 'md' | 'sm'
  /** Display face + wider tracking, for the campaign title row. */
  display?: boolean
  title?: string
  trailing?: React.ReactNode
  /** Merged with the hover utilities — for hooks like `.pin-row`. */
  className?: string
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}) {
  const sm = size === 'sm'
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={title}
      className={[className, active ? '' : 'hover-bg hover-text'].filter(Boolean).join(' ')}
      style={{
        position: 'relative',
        width: '100%', display: 'flex', alignItems: 'center', gap: sm ? 8 : 9,
        height: sm ? 26 : 30,
        padding: sm ? '0 8px 0 11px' : '0 8px 0 12px',
        background: active ? `color-mix(in srgb, ${accent} 13%, transparent)` : 'transparent',
        border: 'none', borderRadius: 'var(--radius-sm)',
        color: active ? accent : 'var(--text-secondary)',
        fontFamily: display ? 'var(--font-display)' : 'var(--font-ui)',
        fontSize: display ? 13 : sm ? 11.5 : 12.5,
        fontWeight: active && !display ? 600 : 500,
        letterSpacing: display ? '0.03em' : '0.01em',
        cursor: 'pointer', textAlign: 'left',
        transition: 'background var(--transition), color var(--transition)',
      }}
    >
      {active && (
        <span style={{
          position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
          width: 2.5, height: '58%', borderRadius: 2, background: accent,
        }} />
      )}
      <span style={{ display: 'flex', flexShrink: 0, opacity: active ? 1 : 0.85 }}>{icon}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {trailing}
    </button>
  )
}

/** Collapsed-rail equivalent of NavRow. */
export function RailIcon({ icon, title, active = false, accent = 'var(--gold)', onClick, onContextMenu }: {
  icon: React.ReactNode
  title: string
  active?: boolean
  accent?: string
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={title}
      className={active ? '' : 'hover-bg hover-text'}
      style={{
        width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? `color-mix(in srgb, ${accent} 14%, transparent)` : 'transparent',
        border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        color: active ? accent : 'var(--text-secondary)',
        transition: 'background var(--transition), color var(--transition)',
      }}
    >
      {icon}
    </button>
  )
}

/** Small uppercase heading above a group of rows. */
export function GroupLabel({ icon, label, right }: {
  icon?: React.ReactNode
  label: string
  right?: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5, height: 24, padding: '0 10px 0 12px',
      fontSize: 9.5, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase',
      color: 'var(--text-muted)', flexShrink: 0,
    }}>
      {icon}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {right}
    </div>
  )
}

