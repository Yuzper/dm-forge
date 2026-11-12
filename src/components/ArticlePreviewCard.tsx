// path: src/components/ArticlePreviewCard.tsx
// Hover preview for a wiki link to any non-item article (items keep ItemCard,
// which knows about rarity and attunement). Same shell as ItemCard: picture,
// title in the type's colour, a grid of the article's filled-in details in the
// order its Details panel shows them, then the opening of the article with its
// formatting kept (headings, emphasis, lists — see RichPreview), and tags.
import { useLayoutEffect, useRef, useState } from 'react'
import type { ArticleSummary } from '../types'
import { ARTICLE_TRACKS, ARTICLE_TYPES } from './wiki/wikiConstants'
import { formatTrackName, trackValues } from '../../shared/tracks'
import { RichPreview, parseDoc, type PMNode } from './RichPreview'
import { CroppedImage } from './CroppedImage'
import { parsePreviewCrop, PREVIEW_HEIGHT, type CropRect } from '../utils/previewCrop'

export type ArticlePreviewData = {
  id: number
  title: string
  typeLabel: string
  color: string
  image?: string | null
  /** The article's chosen framing of that image (null = default). */
  crop?: CropRect | null
  details: [label: string, value: string][]
  /** The article's stored content, rendered short with its formatting. */
  body?: PMNode | null
  tags: string[]
}

const CARD_W = 320
const MAX_DETAILS = 4

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try { return raw ? JSON.parse(raw) ?? fallback : fallback } catch { return fallback }
}

/** The card's data from the list summary alone — enough to paint at once. */
export function previewFromSummary(a: ArticleSummary): ArticlePreviewData {
  const type = ARTICLE_TYPES.find(t => t.value === a.article_type) ?? ARTICLE_TYPES[ARTICLE_TYPES.length - 1]
  const tracks = parseJson<Record<string, string>>(a.tracks, {})
  // Defined tracks first, in the Details panel's order; then any custom ones.
  const defined = Object.keys(ARTICLE_TRACKS[a.article_type as keyof typeof ARTICLE_TRACKS] ?? {})
  const keys = [...defined, ...Object.keys(tracks).filter(k => !defined.includes(k))]
  const details: [string, string][] = []
  for (const k of keys) {
    const v = trackValues(typeof tracks[k] === 'string' ? tracks[k] : '').join(', ')
    if (v) details.push([formatTrackName(k), v])
    if (details.length === MAX_DETAILS) break
  }
  const tags = parseJson<unknown>(a.tags, [])
  return {
    id: a.id,
    title: a.title,
    typeLabel: type.label,
    color: type.color,
    image: a.cover_image ? `file://${a.cover_image}` : null,
    details,
    tags: Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string' && !!t) : [],
  }
}

/** What the full article adds: its portrait (preferred over the banner) and its text. */
export function previewExtras(full: { content?: string; portrait_image?: string | null; cover_image?: string | null; preview_crop?: string }): Partial<ArticlePreviewData> {
  return {
    body: parseDoc(full.content),
    crop: parsePreviewCrop(full.preview_crop, full.portrait_image || full.cover_image),
    image: full.portrait_image ? `file://${full.portrait_image}` : full.cover_image ? `file://${full.cover_image}` : undefined,
  }
}

export function ArticlePreviewCard({ data, x, y, onMouseEnter, onMouseLeave }: {
  data: ArticlePreviewData
  x: number
  y: number
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  // Sit above the cursor when there is room, else below; measured, so a short
  // card doesn't float far from the link and a tall one never leaves the window.
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(260)
  useLayoutEffect(() => { if (ref.current) setHeight(ref.current.offsetHeight) })
  const left = Math.max(8, Math.min(x, window.innerWidth - CARD_W - 16))
  const above = y - height - 12
  const top = above >= 8 ? above : Math.min(y + 16, window.innerHeight - height - 8)
  const accent = data.color

  return (
    <div
      ref={ref}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed', left, top: Math.max(8, top),
        width: CARD_W, zIndex: 2000, pointerEvents: 'auto',
        background: 'var(--bg-elevated)',
        border: `1px solid ${accent}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }}
    >
      {data.image && (
        <CroppedImage src={data.image} crop={data.crop} height={PREVIEW_HEIGHT} style={{ borderBottom: `1px solid ${accent}` }} />
      )}
      <div style={{ padding: '10px 14px', background: 'var(--bg-surface)', borderBottom: `1px solid ${accent}` }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: accent, letterSpacing: '0.04em', marginBottom: 2 }}>
          {data.title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>{data.typeLabel}</div>
      </div>
      {data.details.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
          {data.details.map(([label, val]) => (
            <div key={label} style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-light)', borderRight: '1px solid var(--border-light)', minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={val}>{val}</div>
            </div>
          ))}
        </div>
      )}
      {(data.body || data.tags.length > 0) && (
        <div style={{ padding: '10px 14px', maxHeight: 240, overflowY: 'auto' }}>
          {data.body && <RichPreview doc={data.body} />}
          {data.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: data.body ? 8 : 0 }}>
              {data.tags.map(t => (
                <span key={t} style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 99, padding: '1px 7px' }}>{t}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
