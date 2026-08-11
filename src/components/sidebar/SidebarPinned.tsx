// path: src/components/sidebar/SidebarPinned.tsx
// The sidebar's pinned list, which replaced the old five-item Recent trail.
//
// Recent answered "where have I been", which the tab strip and its back button
// already answer better. This answers "what do I keep coming back to", so it is
// curated, persisted per campaign, and deliberately unbounded — it scrolls
// instead of truncating.
//
// Rows are Locations, so anything with a context menu anywhere in the app can be
// pinned into this list and resolves its own label here.
import { Pin, PinOff, ChevronDown, ChevronRight, Scroll, BookOpen, Clock,
  FileText, Layers, Sparkles, ShoppingBag, Network, Music2 } from 'lucide-react'
import { useStore } from '../../store/store'
import type { Location } from '../../store/location'
import { locationLabel, sameLocation } from '../../store/location'
import { useContextMenu, useMenuCtx } from '../../hooks/useContextMenu'
import { buildLocationMenu, truncate } from '../../utils/contextMenus'
import { GroupLabel, NavRow } from './sidebarShared'

function pinIcon(loc: Location) {
  switch (loc.type) {
    case 'campaign':    return <Layers size={12} />
    case 'session':     return <Scroll size={12} />
    case 'wiki':        return <BookOpen size={12} />
    case 'article':     return <FileText size={12} />
    case 'relations':   return <Network size={12} />
    case 'dm-notes':    return <Sparkles size={12} />
    case 'loot-tables': return <ShoppingBag size={12} />
    case 'timeline':    return <Clock size={12} />
    case 'soundboard':  return <Music2 size={12} />
    default:            return <FileText size={12} />
  }
}

export default function SidebarPinned({ grow, open, onToggleOpen }: {
  /** Take the free space (no session POI list competing for it). */
  grow: boolean
  open: boolean
  onToggleOpen: () => void
}) {
  const {
    pinnedLocations, togglePin, currentCampaign,
    tabs, activeTabId, selectTab, openTab,
    sessions, drafts, allArticles, locationNames,
  } = useStore()
  const showMenu = useContextMenu()
  const menuCtx = useMenuCtx()

  // A pin whose row was deleted resolves to null and simply drops out, the same
  // way a dead tab does.
  const rows = pinnedLocations
    .map(loc => ({ loc, label: locationLabel(loc, { campaignName: currentCampaign?.name, sessions, drafts, allArticles, locationNames }) }))
    .filter((x): x is { loc: Location; label: string } => x.label !== null)

  const activeLocation = tabs.find(t => t.id === activeTabId)?.location

  // Reuse a tab already pointed there, else open one — the same rule the Recent
  // list used, and what makes a pinned row feel like a bookmark bar.
  const go = (loc: Location) => {
    const existing = tabs.find(t => sameLocation(t.location, loc))
    if (existing) selectTab(existing.id)
    else openTab(loc)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minHeight: 0,
      ...(grow ? { flex: 1 } : { flexShrink: 0, maxHeight: '42%', borderTop: '1px solid var(--border)' }),
      padding: '6px 6px 4px',
    }}>
      <GroupLabel
        icon={<Pin size={10} />}
        label="Pinned"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {rows.length > 0 && <span style={{ opacity: 0.8 }}>{rows.length}</span>}
            <button
              onClick={onToggleOpen}
              title={open ? 'Hide pinned' : 'Show pinned'}
              className="hover-gold"
              style={{
                display: 'flex', alignItems: 'center', background: 'none', border: 'none',
                cursor: 'pointer', color: 'var(--text-muted)', padding: 1,
                transition: 'color var(--transition)',
              }}
            >
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          </div>
        }
      />

      {open && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {rows.length === 0 ? (
            <div style={{
              padding: '4px 10px 8px', fontSize: 10.5, lineHeight: 1.5,
              color: 'var(--text-muted)', fontStyle: 'italic',
            }}>
              Right-click an article, session or section and choose <span style={{ fontStyle: 'normal' }}>Pin to sidebar</span> to keep it here.
            </div>
          ) : rows.map(({ loc, label }, i) => (
            <NavRow
              key={`${loc.type}:${i}`}
              size="sm"
              className="pin-row"
              icon={pinIcon(loc)}
              label={label}
              title={label}
              active={!!activeLocation && sameLocation(activeLocation, loc)}
              onClick={() => go(loc)}
              onContextMenu={e => showMenu(e, buildLocationMenu(loc, menuCtx, {
                label: `Open “${truncate(label)}”`,
              }))}
              trailing={
                <span
                  role="button"
                  title="Unpin"
                  className="pin-unpin"
                  onClick={e => { e.stopPropagation(); togglePin(loc) }}
                  style={{ display: 'flex', alignItems: 'center', flexShrink: 0, padding: '0 1px' }}
                >
                  <PinOff size={11} />
                </span>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
