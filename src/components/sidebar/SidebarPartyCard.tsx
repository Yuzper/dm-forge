// path: src/components/sidebar/SidebarPartyCard.tsx
// PartyStrip, relocated from the map hub into the sidebar's free space —
// pinned at the very bottom of it, below Pinned, which grows above it. The
// same space the session's POI list takes over while a session is open, so
// this only ever competes with Pinned, never with POIList.
//
// It reads the same map selection the campaign hub shows (same localStorage
// key `useMapCollection` already keys on), so "where the party is" matches
// whatever the hub's own map would centre on, without the sidebar needing to
// know anything about the map beyond its POIs.
import { useMemo, useState } from 'react'
import { useStore } from '../../store/store'
import { useMapCollection } from '../../hooks/useMapCollection'
import { buildPartyTrail } from '../../utils/partyTrail'
import PartyStrip from '../campaign/PartyStrip'
import type { Campaign, POI } from '../../types'

export default function SidebarPartyCard({ campaign }: { campaign: Campaign }) {
  const { sessions, navigateToSessionById, setView, setCampaignSubView } = useStore()
  const showTrail = useStore(s => s.partyTrailVisible)
  const setPartyTrailVisible = useStore(s => s.setPartyTrailVisible)

  const [pois, setPois] = useState<POI[]>([])
  useMapCollection({
    owner: { kind: 'campaign', id: campaign.id },
    selectionKey: `worldmap-selected-${campaign.id}`,
    onSelect: map => { setPois([]); if (map) window.api.getPOIs(map.id).then(setPois) },
  })

  const trail = useMemo(() => buildPartyTrail(pois, sessions), [pois, sessions])
  if (trail.length === 0) return null

  return (
    <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)' }}>
      <PartyStrip
        campaign={campaign}
        trail={trail}
        showTrail={showTrail}
        onToggleTrail={() => setPartyTrailVisible(!showTrail)}
        onOpenSession={id => navigateToSessionById(id)}
        // The pin itself can't be centred from outside the hub's own map
        // state — the closest equivalent from here is to open the hub.
        onFocusStop={() => { setView('campaign'); setCampaignSubView('hub') }}
      />
    </div>
  )
}
