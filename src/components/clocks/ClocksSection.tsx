// path: src/components/clocks/ClocksSection.tsx
// Article editor sidebar section: progress clocks attached to this article.
// Hidden entirely when read-mode and the article has no clocks.

import { useState, useEffect, useCallback } from 'react'
import { Timer, Info } from 'lucide-react'
import type { Clock } from '../../types'
import { sidebarSectionLabel } from '../wiki/wikiConstants'
import { ClockList } from './ClockWidget'

// In-depth explainer shown on the (i) hover next to the Clocks heading.
export const CLOCKS_INFO = [
  'Progress clocks track something advancing over time — a faction’s scheme, a countdown, a race against the party.',
  '',
  'Click a segment to fill the clock; click the last filled segment to tick back down. When every segment fills, the clock completes (it turns gold) — untick it to bring it back.',
  '',
  'Give bigger or slower threats more segments (8–12) and imminent ones fewer (2–4). Clocks here are attached to this article; add campaign-wide ones from the hub’s “Ticking clocks” panel.',
].join('\n')

export function ClocksSection({ articleId, campaignId, readMode }: {
  articleId: number
  campaignId: number
  readMode: boolean
}) {
  const [clocks, setClocks] = useState<Clock[]>([])

  const reload = useCallback(() => {
    window.api.getArticleClocks(articleId).then(setClocks)
  }, [articleId])
  useEffect(() => { reload() }, [reload])

  if (readMode && clocks.length === 0) return null

  return (
    <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
      <div style={{ ...sidebarSectionLabel, display: 'flex', alignItems: 'center', gap: 5 }}>
        <Timer size={11} /> Clocks
        <span title={CLOCKS_INFO} style={{ display: 'inline-flex', cursor: 'help', color: 'var(--text-muted)' }} className="hover-text">
          <Info size={11} />
        </span>
      </div>
      {!readMode && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: 8 }}>
          Track something ticking toward a payoff — a scheme, a countdown, or a race against the party.
        </div>
      )}
      <ClockList
        clocks={clocks}
        readOnly={readMode}
        onTick={(c, filled) => window.api.updateClock(c.id, { filled }).then(reload)}
        onRename={(c, name) => window.api.updateClock(c.id, { name }).then(reload)}
        onDelete={c => window.api.deleteClock(c.id).then(reload)}
        onCreate={(name, segments) =>
          window.api.createClock({ campaign_id: campaignId, article_id: articleId, name, segments }).then(reload)}
      />
    </div>
  )
}
