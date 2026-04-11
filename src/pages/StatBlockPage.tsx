// path: src/pages/StatBlockPage.tsx
import { useState, useEffect } from 'react'
import StatBlockView from '../components/StatBlockView'
import type { Article } from '../types'
import { parseStatBlock } from '../types'

interface Props {
  articleId: number
}

export default function StatBlockPage({ articleId }: Props) {
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

  const statblock = parseStatBlock(article.statblock)

  return (
    <div style={{
      height: '100vh', overflowY: 'auto',
      background: 'var(--bg-base)',
      padding: 12,
    }}>
      <StatBlockView
        statblock={statblock}
        name={article.title}
        articleType={article.article_type}
      />
    </div>
  )
}
