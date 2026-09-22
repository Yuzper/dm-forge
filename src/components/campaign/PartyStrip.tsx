// path: src/components/campaign/PartyStrip.tsx
// "Where are we, and when." Not a panel — a status strip pinned to the map
// hub's bottom-left, always visible, no collapse. Everything in it is derived
// from data the campaign already has: the last world-map pin linked to a
// session is where the party stands, and that session's in-world day is the
// date. A campaign that links no pins to sessions gets no strip at all.

import { Footprints, Calendar, Route, ScrollText } from 'lucide-react'
import { lastVisit, type TrailStop } from '../../utils/partyTrail'
import { getCampaignCalendar, formatCalendarDay } from '../../utils/timelineGeometry'
import type { Campaign } from '../../types'

export default function PartyStrip({ campaign, trail, showTrail, onToggleTrail, onOpenSession, onFocusStop }: {
  campaign: Campaign
  trail: TrailStop[]
  showTrail: boolean
  onToggleTrail: () => void
  onOpenSession: (sessionId: number) => void
  onFocusStop: (stop: TrailStop) => void
}) {
  if (trail.length === 0) return null

  const here = trail[trail.length - 1]
  const session = lastVisit(here)
  const previous = trail.length > 1 ? trail[trail.length - 2] : null
  const cal = getCampaignCalendar(campaign)
  const date = here.endDay != null ? formatCalendarDay(here.endDay, cal) : null
  // Only meaningful when both ends carry an in-world day.
  const elapsed = here.endDay != null && previous?.endDay != null ? here.endDay - previous.endDay : null

  const chip: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 99,
    fontSize: 11, cursor: 'pointer', transition: 'all 120ms ease',
    border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-muted)',
    fontFamily: 'var(--font-ui)',
  }

  return (
    <div style={{ padding: '9px 12px 10px', width: 296 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
        <Footprints size={13} color="var(--success)" />
        <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--success)', fontWeight: 600 }}>
          The party
        </span>
        <button
          onClick={() => onOpenSession(session.sessionId)}
          title={`Open ${session.name}`}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 10.5, color: 'var(--text-muted)' }}
          className="hover-gold">
          after session {session.number}{session.sub}
          {here.visits.length > 1 && ` · ${here.visits.length} here`}
        </button>
      </div>

      <button
        onClick={() => onFocusStop(here)}
        title="Centre the map here"
        style={{ display: 'block', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
        className="hover-opacity">
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--gold)', letterSpacing: '0.03em' }}>
          {here.label || 'Unnamed pin'}
        </span>
      </button>

      {date && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, fontSize: 11.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
          <Calendar size={11} />
          {date}
          {elapsed != null && elapsed > 0 && previous && (
            <span style={{ color: 'var(--text-muted)' }}>
              · {elapsed} day{elapsed !== 1 ? 's' : ''} since {previous.label || 'the last stop'}
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
        <button
          onClick={onToggleTrail}
          title={showTrail ? 'Hide the route across the map' : `Draw the route through all ${trail.length} stop${trail.length !== 1 ? 's' : ''}`}
          style={showTrail
            ? { ...chip, borderColor: 'var(--success-border)', background: 'var(--success-bg)', color: 'var(--success)' }
            : chip}
          className="hover-gold-border">
          <Route size={11} /> Trail
          <span style={{ opacity: 0.75 }}>{trail.length}</span>
        </button>
        <button
          onClick={() => onOpenSession(session.sessionId)}
          style={chip}
          className="hover-gold-border">
          <ScrollText size={11} /> Last session
        </button>
      </div>
    </div>
  )
}
