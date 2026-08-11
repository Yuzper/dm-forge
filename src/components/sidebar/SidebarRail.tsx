// path: src/components/sidebar/SidebarRail.tsx
// The collapsed sidebar: the same nav, reduced to icons. It shares
// `useSidebarNav` with the expanded panel, so a section can never appear in one
// and not the other.
import { Scroll, Layers, Search, PanelLeftOpen } from 'lucide-react'
import { useStore } from '../../store/store'
import { useContextMenu, useMenuCtx } from '../../hooks/useContextMenu'
import { buildLocationMenu } from '../../utils/contextMenus'
import { RailIcon, useSidebarNav, RAIL_WIDTH } from './sidebarShared'
import SidebarFooter from './SidebarFooter'

export default function SidebarRail({ inCampaign, onExpand }: {
  inCampaign: boolean
  onExpand: () => void
}) {
  const { view, setView, currentCampaign, campaignSubView, setCampaignSubView, setSearchOpen } = useStore()
  const nav = useSidebarNav()
  const showMenu = useContextMenu()
  const menuCtx = useMenuCtx()

  return (
    <aside style={{
      width: RAIL_WIDTH,
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      flexShrink: 0, userSelect: 'none',
      padding: '12px 0 8px', gap: 2,
    }}>
      <button
        onClick={() => setView('campaigns')}
        title="All campaigns"
        style={{
          width: 32, height: 32, background: 'var(--gold)', borderRadius: 4, border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          marginBottom: 10, flexShrink: 0,
        }}
      >
        <Scroll size={18} color="var(--text-inverse)" strokeWidth={2} />
      </button>

      {inCampaign && currentCampaign && (
        <>
          <RailIcon
            icon={<Search size={16} />} title="Search campaign (Ctrl+S)"
            onClick={() => setSearchOpen(true)}
          />
          <RailIcon
            icon={<Layers size={16} />} title={`${currentCampaign.name} — campaign hub`}
            active={view === 'campaign' && campaignSubView === 'hub'}
            onClick={() => { setView('campaign'); setCampaignSubView('hub') }}
            onContextMenu={e => showMenu(e, buildLocationMenu({ type: 'campaign', subView: 'hub' }, menuCtx, {
              label: 'Open campaign hub',
            }))}
          />
          <div style={{ height: 1, width: 22, background: 'var(--border)', margin: '5px 0' }} />
          {nav.map(item => (
            <RailIcon
              key={item.key}
              icon={<item.icon size={16} />} title={item.label} accent={item.accent}
              active={item.active} onClick={item.onClick}
              onContextMenu={e => showMenu(e, buildLocationMenu(item.loc, menuCtx, {
                label: `Open ${item.label}`,
              }))}
            />
          ))}
        </>
      )}

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <SidebarFooter rail version="" />
        <RailIcon icon={<PanelLeftOpen size={16} />} title="Expand sidebar" onClick={onExpand} />
      </div>
    </aside>
  )
}
