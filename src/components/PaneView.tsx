// path: src/components/PaneView.tsx
// One pane: its tab strip plus the page its active tab points at. Rendered once
// when unsplit, twice side by side when split.
import { Fragment } from 'react'
import { useStore } from '../store/store'
import { PaneProvider } from '../context/PaneContext'
import type { PaneId } from '../store/paneRegistry'
import TabStrip from './TabStrip'
import CampaignsPage from '../pages/CampaignsPage'
import CampaignDetailPage from '../pages/CampaignDetailPage'
import SessionPage from '../pages/SessionPage'
import WikiPage from '../pages/WikiPage'
import DMNotesPage from '../pages/DMNotesPage'
import LootTablesPage from '../pages/LootTablesPage'
import RelationsPage from '../pages/RelationsPage'
import TimelinePage from '../pages/TimelinePage'
import SoundboardPage from '../pages/SoundboardPage'

function PaneBody({ paneId }: { paneId: PaneId }) {
  const { view, activeTabId, paneIds, activePaneId, focusPane } = useStore()
  const split = paneIds.length > 1
  const focused = activePaneId === paneId

  return (
    <div
      data-pane-id={paneId}
      // Capture so a click anywhere in the pane claims focus before the click's
      // own handler runs — the sidebar and Ctrl+T must act on the pane you just
      // clicked into, not the one you left.
      onPointerDownCapture={() => { if (split) focusPane(paneId) }}
      style={{
        flex: 1, minWidth: 0, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        // Only mark focus while split; a lone pane is always "the" pane.
        boxShadow: split && focused ? 'inset 0 2px 0 var(--gold)' : 'none',
        opacity: split && !focused ? 0.92 : 1,
        transition: 'opacity 120ms',
      }}
    >
      <TabStrip paneId={paneId} />
      {/* Keyed by tab: two tabs of the same kind (two relation webs, two
          timelines) are separate pages, so the subtree must remount on a
          switch. Without this they share the page's local state and the
          second tab's contents leak into the first. A Fragment key remounts
          without adding a DOM node, so page layout is untouched. */}
      <Fragment key={activeTabId ?? 'no-tab'}>
        {view === 'campaigns'   && <CampaignsPage />}
        {view === 'campaign'    && <CampaignDetailPage />}
        {view === 'session'     && <SessionPage />}
        {view === 'wiki'        && <WikiPage />}
        {view === 'dm-notes'    && <DMNotesPage />}
        {view === 'loot-tables' && <LootTablesPage />}
        {view === 'relations'   && <RelationsPage />}
        {view === 'timeline'    && <TimelinePage />}
        {view === 'soundboard'  && <SoundboardPage />}
      </Fragment>
    </div>
  )
}

export default function PaneView({ paneId }: { paneId: PaneId }) {
  return (
    <PaneProvider paneId={paneId}>
      <PaneBody paneId={paneId} />
    </PaneProvider>
  )
}
