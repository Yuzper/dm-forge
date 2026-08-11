// path: src/components/TabStrip.tsx
// Browser-style tabs for the pane. Visual language deliberately matches the map
// tab strip in SessionPage, which the same drag-to-reorder interaction already
// established.
import { useState } from 'react'
import { useStore } from '../store/store'
import {
  Layers, Scroll, BookOpen, FileText, Network, Sparkles,
  ShoppingBag, Clock, Music2, X, Plus, ArrowLeft, ArrowRight, HelpCircle,
  Columns2, PanelRightClose,
} from 'lucide-react'
import type { Location } from '../store/location'
import { locationLabel } from '../store/location'
import { getPane, type PaneId } from '../store/paneRegistry'
import { useContextMenu, useMenuCtx } from '../hooks/useContextMenu'
import { buildTabMenu } from '../utils/contextMenus'

// Payload for dragging a tab, so a drop on the other pane's strip knows what
// arrived and where from.
const DRAG_MIME = 'application/x-dmforge-tab'

function locationIcon(loc: Location, size = 12) {
  switch (loc.type) {
    case 'campaign':    return <Layers size={size} />
    case 'session':     return <Scroll size={size} />
    case 'wiki':        return <BookOpen size={size} />
    case 'article':     return <FileText size={size} />
    case 'relations':   return <Network size={size} />
    case 'dm-notes':    return <Sparkles size={size} />
    case 'loot-tables': return <ShoppingBag size={size} />
    case 'timeline':    return <Clock size={size} />
    case 'soundboard':  return <Music2 size={size} />
  }
}

export default function TabStrip({ paneId }: { paneId: PaneId }) {
  const {
    tabs, activeTabId, selectTab, closeTab, moveTab, openTab,
    closeOtherTabs, closeTabsToRight, duplicateTab, moveTabToPane,
    navigateBack, navigateForward,
    currentCampaign, sessions, drafts, allArticles, locationNames,
    paneIds, activePaneId, splitPane, closePane,
  } = useStore()
  const showMenu = useContextMenu()
  const menuCtx = useMenuCtx()

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState(false)

  // Tabs belong to a campaign; the all-campaigns list has none.
  if (!currentCampaign || tabs.length === 0) return null

  const ctx = { campaignName: currentCampaign.name, sessions, drafts, allArticles, locationNames }
  const active = tabs.find(t => t.id === activeTabId)
  const canBack = !!active?.back.length
  const canFwd = !!active?.forward.length
  const split = paneIds.length > 1
  // While split, only the focused pane's active tab wears the gold. Both panes
  // lighting one up said nothing about which of them Ctrl+T would open into —
  // and this is the signal the eye is already looking at.
  const live = !split || activePaneId === paneId

  const handleDrop = (targetIndex: number) => {
    if (dragIndex !== null && dragIndex !== targetIndex) moveTab(dragIndex, targetIndex)
    setDragIndex(null)
    setOverIndex(null)
  }

  // A tab dropped from the *other* pane's strip is a hand-over, not a reorder.
  // The move is owned by the source pane (it has the tab), so it is invoked on
  // that pane's store rather than this component's.
  const handleStripDrop = (e: React.DragEvent) => {
    setDropTarget(false)
    const raw = e.dataTransfer.getData(DRAG_MIME)
    if (!raw) return
    try {
      const { tabId, fromPane } = JSON.parse(raw)
      if (fromPane === paneId) return
      e.preventDefault()
      const source = getPane(fromPane as PaneId)
      if (source) void source.getState().moveTabToPane(tabId, paneId)
    } catch { /* not our payload */ }
  }

  return (
    <div
      data-tab-strip={paneId}
      onDragOver={e => {
        if (e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); setDropTarget(true) }
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={handleStripDrop}
      // Blank strip. Tab menus stop propagation, so this only sees empty space —
      // and there is no one tab to ring, so nothing gets marked.
      onContextMenu={e => showMenu(e, [
        { label: 'New tab', accelerator: 'Ctrl+T', click: () => void openTab({ type: 'campaign', subView: 'hub' }) },
      ], { target: null })}
      style={{
        display: 'flex', alignItems: 'stretch', gap: 2,
        padding: '5px 8px 0', flexShrink: 0,
        background: dropTarget ? 'var(--bg-elevated)'
          : live ? 'var(--bg-surface)' : 'var(--bg-base)',
        borderBottom: `1px solid ${live && split ? 'var(--border-gold)' : 'var(--border)'}`,
        userSelect: 'none', overflowX: 'auto',
      }}>
      {/* Per-tab history */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 1, paddingRight: 6, marginRight: 2, borderRight: '1px solid var(--border)' }}>
        <NavButton icon={<ArrowLeft size={13} />} title="Back" disabled={!canBack} onClick={navigateBack} />
        <NavButton icon={<ArrowRight size={13} />} title="Forward" disabled={!canFwd} onClick={navigateForward} />
      </div>

      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTabId
        const label = locationLabel(tab.location, ctx)
        const dead = label === null
        return (
          <div
            key={tab.id}
            draggable
            onDragStart={e => {
              setDragIndex(index)
              e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ tabId: tab.id, fromPane: paneId }))
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={e => { e.preventDefault(); setOverIndex(index) }}
            onDragEnd={() => { setDragIndex(null); setOverIndex(null) }}
            onDrop={e => { e.preventDefault(); handleDrop(index) }}
            onClick={() => selectTab(tab.id)}
            // Middle-click closes, like every browser.
            onAuxClick={e => { if (e.button === 1) { e.preventDefault(); closeTab(tab.id) } }}
            onContextMenu={e => showMenu(e, buildTabMenu(
              {
                tabCount: tabs.length, isLast: index === tabs.length - 1, split,
                pinned: menuCtx.pinned(tab.location),
              },
              {
                togglePin:       () => menuCtx.togglePin(tab.location),
                close:           () => void closeTab(tab.id),
                closeOthers:     () => void closeOtherTabs(tab.id),
                closeToRight:    () => void closeTabsToRight(tab.id),
                duplicate:       () => void duplicateTab(tab.id),
                moveToOtherPane: () => {
                  const other = paneIds.find(p => p !== paneId)
                  if (other) void moveTabToPane(tab.id, other)
                },
                openInOtherPane: () => menuCtx.goPane(tab.location),
                newTab:          () => void openTab({ type: 'campaign', subView: 'hub' }),
              },
            ))}
            title={dead ? 'This item no longer exists' : label}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 8px 6px 10px',
              maxWidth: 190, minWidth: 90,
              cursor: 'pointer',
              fontSize: 12, fontFamily: 'var(--font-ui)',
              color: dead ? 'var(--text-muted)'
                : isActive ? (live ? 'var(--gold)' : 'var(--text-secondary)')
                : 'var(--text-secondary)',
              background: isActive ? (live ? 'var(--bg-elevated)' : 'var(--bg-surface)') : 'transparent',
              border: '1px solid',
              borderColor: isActive ? (live && split ? 'var(--border-gold)' : 'var(--border)') : 'transparent',
              borderBottom: isActive
                ? `1px solid ${live ? 'var(--bg-elevated)' : 'var(--bg-surface)'}`
                : '1px solid transparent',
              borderTopLeftRadius: 'var(--radius-sm)', borderTopRightRadius: 'var(--radius-sm)',
              marginBottom: -1,
              opacity: dragIndex === index ? 0.4 : 1,
              boxShadow: overIndex === index && dragIndex !== null && dragIndex !== index
                ? 'inset 2px 0 0 var(--gold)' : 'none',
              transition: 'background 120ms, color 120ms',
            }}
            className={isActive ? '' : 'hover-bg'}
          >
            <span style={{ flexShrink: 0, opacity: dead ? 0.5 : 0.8, display: 'flex' }}>
              {dead ? <HelpCircle size={12} /> : locationIcon(tab.location)}
            </span>
            <span style={{
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
              fontStyle: dead ? 'italic' : 'normal',
            }}>
              {dead ? 'Unavailable' : label}
            </span>
            <button
              onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
              title="Close tab"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', cursor: 'pointer', padding: 1,
                borderRadius: 3, color: 'inherit', opacity: 0.55, flexShrink: 0,
              }}
              className="hover-gold"
            >
              <X size={11} />
            </button>
          </div>
        )
      })}

      <button
        onClick={() => openTab({ type: 'campaign', subView: 'hub' })}
        title="New tab (Ctrl+T)"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', padding: '0 8px', alignSelf: 'center',
          borderRadius: 'var(--radius-sm)', flexShrink: 0,
        }}
        className="hover-gold"
      >
        <Plus size={14} />
      </button>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2, paddingLeft: 8 }}>
        {!split && (
          <StripButton icon={<Columns2 size={14} />} title="Split view — open this beside the current tab"
            onClick={() => splitPane()} />
        )}
        {split && (
          <StripButton icon={<PanelRightClose size={14} />} title="Close this pane"
            onClick={() => closePane(paneId)} />
        )}
      </div>
    </div>
  )
}

function StripButton({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, background: 'none', border: 'none',
        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        color: 'var(--text-muted)', flexShrink: 0,
      }}
      className="hover-gold"
    >
      {icon}
    </button>
  )
}

function NavButton({ icon, title, disabled, onClick }: {
  icon: React.ReactNode; title: string; disabled: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, background: 'none', border: 'none',
        borderRadius: 'var(--radius-sm)',
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--border-light)' : 'var(--text-muted)',
        transition: 'color var(--transition)',
      }}
      className={disabled ? '' : 'hover-gold'}
    >
      {icon}
    </button>
  )
}
