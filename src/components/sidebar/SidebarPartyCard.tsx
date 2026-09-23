// path: src/components/sidebar/SidebarPartyCard.tsx
// "Where are we, and when." A status card pinned at the very bottom of the
// sidebar's free space, below Pinned, which grows above it. The same space the
// session's POI list takes over while a session is open, so this only ever
// competes with Pinned, never with POIList.
//
// Everything on it is derived: the last world-map pin linked to a session is
// where the party stands, and that session's in-world day is the date. A
// campaign that links no pins to sessions gets no card at all.
//
// It reads the same map selection the campaign hub shows (same localStorage
// key `useMapCollection` already keys on), so "where the party is" matches
// whatever the hub's own map would centre on, without the sidebar needing to
// know anything about the map beyond its POIs.
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Calendar, Footprints, Hourglass, ScrollText } from 'lucide-react'
import { useStore } from '../../store/store'
import { useMapCollection } from '../../hooks/useMapCollection'
import { buildPartyTrail, lastVisit, stopLabel } from '../../utils/partyTrail'
import { getCampaignCalendar, formatCalendarDay } from '../../utils/timelineGeometry'
import type { Campaign, POI } from '../../types'

const tint = (pct: number) => `color-mix(in srgb, var(--success) ${pct}%, transparent)`

// Long session and place names wrap rather than clip — the card is the only
// place this is shown, so none of it should hide behind a tooltip.
function Detail({ icon, text, hint, strong = false }: {
  icon: ReactNode; text: string; hint: string; strong?: boolean
}) {
  return (
    <span title={hint} style={{
      display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 11, lineHeight: 1.35,
      fontFamily: 'var(--font-body)', color: strong ? 'var(--text-secondary)' : 'var(--text-muted)',
    }}>
      <span style={{ display: 'flex', flexShrink: 0, marginTop: 2, opacity: 0.8 }}>{icon}</span>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{text}</span>
    </span>
  )
}

export default function SidebarPartyCard({ campaign }: { campaign: Campaign }) {
  const { sessions, setView, setCampaignSubView, navigateToSessionById } = useStore()
  const requestWorldMapFocus = useStore(s => s.requestWorldMapFocus)

  const [pois, setPois] = useState<POI[]>([])
  useMapCollection({
    owner: { kind: 'campaign', id: campaign.id },
    selectionKey: `worldmap-selected-${campaign.id}`,
    onSelect: map => { setPois([]); if (map) window.api.getPOIs(map.id).then(setPois) },
  })

  const trail = useMemo(() => buildPartyTrail(pois, sessions), [pois, sessions])
  if (trail.length === 0) return null

  const here = trail[trail.length - 1]
  const previous = trail.length > 1 ? trail[trail.length - 2] : null
  const cal = getCampaignCalendar(campaign)
  const date = here.endDay != null ? formatCalendarDay(here.endDay, cal) : null
  // Only meaningful when both ends carry an in-world day.
  const elapsed = here.endDay != null && previous?.endDay != null ? here.endDay - previous.endDay : null
  const since = elapsed != null && elapsed > 0 && previous
    ? `${elapsed} day${elapsed !== 1 ? 's' : ''} since ${previous.label || 'the last stop'}`
    : null
  const latest = lastVisit(here)
  const showOnMap = () => {
    setView('campaign'); setCampaignSubView('hub')
    requestWorldMapFocus(here.poiId)
  }

  return (
    <div style={{ flexShrink: 0, padding: '6px 10px 10px' }}>
      {/* The card opens the hub and centres its world map on the party's pin;
          the map answers once it has loaded, so this works from any view,
          including the hub itself. A div rather than a <button> because the
          session line inside is its own button, and buttons can't nest. */}
      <div
        role="button"
        tabIndex={0}
        onClick={showOnMap}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showOnMap() } }}
        title="Show on the world map"
        className="hover-border-accent"
        style={{
          width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '9px 10px', textAlign: 'left', cursor: 'pointer',
          background: tint(6), border: `1px solid ${tint(20)}`,
          borderRadius: 8, transition: 'border-color var(--transition)',
        }}
      >
        <span style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0, marginTop: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: tint(16), color: 'var(--success)',
        }}>
          <Footprints size={15} />
        </span>

        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 9.5, letterSpacing: '0.09em', textTransform: 'uppercase',
            fontWeight: 600, color: 'var(--success)', fontFamily: 'var(--font-ui)',
          }}>
            The party
            <span style={{ marginLeft: 'auto', letterSpacing: '0.02em', color: 'var(--text-muted)', fontWeight: 500 }}>
              {stopLabel(here)}
            </span>
          </span>
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 14.5, color: 'var(--gold)',
            letterSpacing: '0.03em', overflowWrap: 'anywhere',
          }}>
            {here.label || 'Unnamed pin'}
          </span>

          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
            {date && (
              <Detail icon={<Calendar size={10} />} text={date} strong
                hint={`In-world date at the end of ${latest.name}`} />
            )}
            {since && previous && (
              <Detail icon={<Hourglass size={10} />} text={since}
                hint={`In-world days between leaving ${previous.label || 'the last stop'} (end of ${lastVisit(previous).name}) and the end of ${latest.name}`} />
            )}
            <button
              onClick={e => { e.stopPropagation(); navigateToSessionById(latest.sessionId) }}
              onKeyDown={e => e.stopPropagation()}
              title={`The latest session linked to this pin. Open ${latest.name}`}
              className="hover-gold"
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 11, lineHeight: 1.35,
                fontFamily: 'var(--font-body)', color: 'var(--text-muted)',
                background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ display: 'flex', flexShrink: 0, marginTop: 2, opacity: 0.8 }}><ScrollText size={10} /></span>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere', textDecoration: 'underline', textDecorationColor: 'var(--border-light)', textUnderlineOffset: 2 }}>
                After {latest.name}
              </span>
            </button>
          </span>
        </span>
      </div>
    </div>
  )
}
