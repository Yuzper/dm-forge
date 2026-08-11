// path: src/components/sidebar/Sidebar.tsx
// The app's left rail. Four bands, top to bottom: identity, search, navigation
// and the pinned list — over a slim footer bar of popovers. In a session the
// map's POI list takes the space between nav and Pinned; elsewhere Pinned has
// that space to itself.
//
// The previous version stacked three separately-bordered blocks over a column of
// six full-width setting buttons, which spent the bottom third on preferences.
// Sections here are separated by rhythm rather than rules, and the settings are
// collapsed into SidebarFooter's two popovers.
import { useEffect, useState } from 'react'
import { useStore } from '../../store/store'
import { ChevronLeft, Scroll, Layers, Search } from 'lucide-react'
import { useContextMenu, useMenuCtx } from '../../hooks/useContextMenu'
import { buildLocationMenu } from '../../utils/contextMenus'
import { StoreMapProvider } from '../../context/MapContext'
import POIList from '../POIList'
import { NavRow, useSidebarNav } from './sidebarShared'
import SidebarPinned from './SidebarPinned'
import SidebarRail from './SidebarRail'
import SidebarFooter from './SidebarFooter'

const IN_CAMPAIGN_VIEWS = new Set([
  'campaign', 'session', 'wiki', 'dm-notes', 'loot-tables', 'relations', 'timeline', 'soundboard',
])

export default function Sidebar() {
  const {
    view, setView, currentCampaign,
    campaignSubView, setCampaignSubView, setSearchOpen,
  } = useStore()
  // The sidebar sits under ActivePaneProvider, so its menus act on the focused
  // pane — which is what "open this pinned thing" should mean from out here.
  const showMenu = useContextMenu()
  const menuCtx = useMenuCtx()
  const nav = useSidebarNav()

  const inCampaignContext = IN_CAMPAIGN_VIEWS.has(view)
  const [version, setVersion] = useState('')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true')
  const [pinnedOpen, setPinnedOpen] = useState(() => localStorage.getItem('sidebar-pinned-open') !== 'false')

  const toggleCollapsed = () => setCollapsed(c => {
    localStorage.setItem('sidebar-collapsed', String(!c))
    return !c
  })
  const togglePinnedOpen = () => setPinnedOpen(o => {
    localStorage.setItem('sidebar-pinned-open', String(!o))
    return !o
  })

  useEffect(() => {
    window.api.getAppVersion().then(setVersion)
  }, [])

  if (collapsed) {
    return <SidebarRail inCampaign={inCampaignContext} onExpand={toggleCollapsed} />
  }

  const showNav = inCampaignContext && currentCampaign

  return (
    <aside style={{
      width: 'var(--sidebar-width)',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0, userSelect: 'none', overflow: 'hidden',
    }}>
      {/* Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 10px 12px 14px' }}>
        <div style={{
          width: 30, height: 30, background: 'var(--gold)', borderRadius: 5,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Scroll size={17} color="var(--text-inverse)" strokeWidth={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14.5, color: 'var(--gold)', letterSpacing: '0.05em', lineHeight: 1.2 }}>
            DM Forge
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 2 }}>
            Dungeon Master
          </div>
        </div>
      </div>

      {/* Search — the visible entry point for the Ctrl+S palette */}
      {currentCampaign && (
        <div style={{ padding: '0 10px 10px' }}>
          <button
            onClick={() => setSearchOpen(true)}
            title="Search articles, sessions, notes & map pins"
            className="hover-gold-border"
            style={{
              width: '100%', height: 30, display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 8px 0 10px', background: 'var(--bg-base)',
              border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-ui)',
              cursor: 'pointer', transition: 'all var(--transition)',
            }}
          >
            <Search size={13} />
            <span style={{ flex: 1, textAlign: 'left' }}>Search campaign…</span>
            <kbd style={{
              fontFamily: 'var(--font-mono, monospace)', fontSize: 9.5,
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 3, padding: '1px 5px', color: 'var(--text-muted)',
            }}>
              Ctrl+S
            </kbd>
          </button>
        </div>
      )}

      {/* Navigation */}
      {showNav && (
        <div style={{ padding: '0 6px 8px', flexShrink: 0 }}>
          <button
            onClick={() => setView('campaigns')}
            className="hover-gold"
            style={{
              display: 'flex', alignItems: 'center', gap: 4, height: 20, padding: '0 6px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontFamily: 'var(--font-ui)',
              fontSize: 9.5, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase',
              transition: 'color var(--transition)',
            }}
          >
            <ChevronLeft size={11} /> All campaigns
          </button>

          <NavRow
            display
            icon={<Layers size={14} />}
            label={currentCampaign.name}
            title={`${currentCampaign.name} — campaign hub`}
            active={view === 'campaign' && campaignSubView === 'hub'}
            onClick={() => { setView('campaign'); setCampaignSubView('hub') }}
            onContextMenu={e => showMenu(e, buildLocationMenu({ type: 'campaign', subView: 'hub' }, menuCtx, {
              label: 'Open campaign hub',
            }))}
          />

          <div style={{ marginTop: 4 }}>
            {nav.map(item => (
              <NavRow
                key={item.key}
                icon={<item.icon size={14} />}
                label={item.label}
                accent={item.accent}
                active={item.active}
                onClick={item.onClick}
                onContextMenu={e => showMenu(e, buildLocationMenu(item.loc, menuCtx, {
                  label: `Open ${item.label}`,
                }))}
              />
            ))}
          </div>
        </div>
      )}

      {/* In a session the map's POIs take the free space and Pinned caps itself
          below them; everywhere else Pinned has the space to itself. */}
      {view === 'session' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <StoreMapProvider>
            <POIList />
          </StoreMapProvider>
        </div>
      )}

      {/* Pinned belongs to a campaign, so it goes away on the campaigns list
          along with the nav it complements. */}
      {showNav
        ? <SidebarPinned grow={view !== 'session'} open={pinnedOpen} onToggleOpen={togglePinnedOpen} />
        : view !== 'session' && <div style={{ flex: 1 }} />}

      {/* The collapse control lives in the footer so it doesn't move when the
          sidebar collapses — the rail's expand button is in the same corner. */}
      <SidebarFooter version={version} onCollapse={toggleCollapsed} />
    </aside>
  )
}
