// path: src/utils/partyTrail.ts
// Where the party has been, derived rather than stored. A world-map pin can
// already link to a session (POI.hub_links), so the pins that carry a session
// link, ordered by session number, *are* the campaign's route: the last one is
// where they stand now.
//
// Consecutive sessions at the same pin collapse into one stop. Without that a
// party who spent four nights in one town gets four dots and four labels on
// the same spot, and the strip ends up saying "1 day since Iron Mines" while
// standing in Iron Mines. A later *return* to a place is still its own stop —
// the route really did go back there.
//
// Nothing here writes anything. A campaign that never links pins to sessions
// simply has an empty trail, and the sidebar's party card stays hidden.

import type { POI, Session } from '../types'
import { parseHubLinks } from './hubLinks'

export interface TrailVisit {
  sessionId: number
  number: number
  sub: string
  name: string
  endDay: number | null
}

export interface TrailStop {
  poiId: number
  /** Percent coordinates of the fitted image box — the space POIs live in. */
  x: number
  y: number
  label: string
  /** Every consecutive session spent here, in order. Always at least one. */
  visits: TrailVisit[]
  /** In-world day the last of those sessions ended. */
  endDay: number | null
}

/** "S12", or "S7–S9" for a stay of several sessions. */
export function stopLabel(stop: TrailStop): string {
  const first = stop.visits[0]
  const last = stop.visits[stop.visits.length - 1]
  const tag = (v: TrailVisit) => `S${v.number}${v.sub}`
  return first === last ? tag(first) : `${tag(first)}–${tag(last)}`
}

export function lastVisit(stop: TrailStop): TrailVisit {
  return stop.visits[stop.visits.length - 1]
}

interface RawStop extends TrailVisit { poiId: number; x: number; y: number; label: string }

/** Sessions sort by number then sub ("4a" before "4b"), the order the sessions list uses. */
function bySession(a: RawStop, b: RawStop): number {
  if (a.number !== b.number) return a.number - b.number
  return a.sub.localeCompare(b.sub)
}

export function buildPartyTrail(pois: POI[], sessions: Session[]): TrailStop[] {
  const byId = new Map(sessions.map(s => [s.id, s]))
  const raw: RawStop[] = []

  for (const poi of pois) {
    const links = parseHubLinks((poi as { hub_links?: string }).hub_links || '[]')
    for (const link of links) {
      if (link.type !== 'session' || !link.session_id) continue
      const session = byId.get(link.session_id) as (Session & { in_world_day?: number | null; in_world_day_end?: number | null }) | undefined
      if (!session) continue          // pin still points at a deleted session
      raw.push({
        poiId: poi.id, x: poi.x, y: poi.y, label: poi.label,
        sessionId: session.id,
        number: session.session_number,
        sub: session.session_sub ?? '',
        name: session.name,
        endDay: session.in_world_day_end ?? session.in_world_day ?? null,
      })
    }
  }

  raw.sort(bySession)

  const stops: TrailStop[] = []
  for (const r of raw) {
    const visit: TrailVisit = { sessionId: r.sessionId, number: r.number, sub: r.sub, name: r.name, endDay: r.endDay }
    const open = stops[stops.length - 1]
    if (open && open.poiId === r.poiId) {
      open.visits.push(visit)
      open.endDay = r.endDay ?? open.endDay
    } else {
      stops.push({ poiId: r.poiId, x: r.x, y: r.y, label: r.label, visits: [visit], endDay: r.endDay })
    }
  }
  return stops
}
