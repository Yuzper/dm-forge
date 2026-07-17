// path: src/components/clocks/ClocksSection.tsx
// Article editor sidebar section: progress clocks attached to this article.
// Hidden entirely when read-mode and the article has no clocks.

import { useState, useEffect, useCallback } from 'react'
import { Timer } from 'lucide-react'
import type { Clock } from '../../types'
import { sidebarSectionLabel } from '../wiki/wikiConstants'
import { ClockList } from './ClockWidget'

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
      </div>
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
