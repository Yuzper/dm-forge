// path: src/pages/StatBlockPage.tsx
import { useState, useEffect } from 'react'
import StatBlockView from '../components/StatBlockView'
import type { Article } from '../types'
import { parseStatBlock } from '../types'

interface Props {
  articleId: number
  statblockOverride?: string | null
  nameOverride?: string | null
}

export default function StatBlockPage({ articleId, statblockOverride, nameOverride }: Props) {
  const [article, setArticle] = useState<Article | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    window.api.getArticle(articleId).then(a => {
      if (a) setArticle(a)
      else setError('Article not found')
    }).catch(() => setError('Failed to load stat block'))
  }, [articleId])

  if (error) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-base)', color: 'var(--text-muted)', fontSize: 13,
        fontFamily: 'var(--font-ui)',
      }}>
        {error}
      </div>
    )
  }

  if (!article) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-base)', color: 'var(--text-muted)', fontSize: 13,
        fontFamily: 'var(--font-ui)',
      }}>
        Loading…
      </div>
    )
  }

  // Use override if provided (variant statblock from combat), otherwise parse article statblock
  const statblock = parseStatBlock(statblockOverride ?? article.statblock)
  const displayName = nameOverride ?? article.title

  return (
    <div style={{
      height: '100vh', overflowY: 'auto',
      background: 'var(--bg-base)',
      padding: 12,
    }}>
      <StatBlockView
        statblock={statblock}
        name={displayName}
        articleType={article.article_type}
      />
    </div>
  )
}