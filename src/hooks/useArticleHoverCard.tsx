// path: src/hooks/useArticleHoverCard.tsx
// The hover preview for an article, shared by wiki links in the editor and
// nodes in the wiki graph. Items get ItemCard (rarity, attunement, stat-block
// description); every other type gets ArticlePreviewCard. The summary paints at
// once from the article list; the full article is fetched to fill in the
// picture and text.
//
// Every function returned is stable, so callers can bind them once (the editor
// attaches DOM listeners a single time) without going stale.
import { useCallback, useRef, useState } from 'react'
import { useStore } from '../store/store'
import type { ArticleSummary } from '../types'
import { parseItemStatBlock } from '../types'
import { ItemCard, type ItemCardData } from '../components/ItemCard'
import { ArticlePreviewCard, previewFromSummary, previewExtras, type ArticlePreviewData } from '../components/ArticlePreviewCard'
import { parseDoc } from '../components/RichPreview'
import { parsePreviewCrop } from '../utils/previewCrop'

type At = { x: number; y: number }

/** Shorten to about `max` characters, at a word break, with an ellipsis. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > max - 40 ? cut.slice(0, space) : cut).trimEnd() + '…'
}
type Timer = ReturnType<typeof setTimeout> | undefined

export function useArticleHoverCard({ openDelay = 0 }: {
  /** Wait this long before showing, so sweeping the mouse across many targets doesn't flash cards. */
  openDelay?: number
} = {}) {
  const [item, setItem] = useState<(ItemCardData & At & { id: number }) | null>(null)
  const [article, setArticle] = useState<(ArticlePreviewData & At) | null>(null)
  const closeTimer = useRef<Timer>(undefined)
  const openTimer = useRef<Timer>(undefined)

  const cancelClose = useCallback(() => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])
  const cancelOpen = useCallback(() => { if (openTimer.current) clearTimeout(openTimer.current); openTimer.current = undefined }, [])
  const hide = useCallback(() => { cancelOpen(); cancelClose(); setItem(null); setArticle(null) }, [cancelOpen, cancelClose])
  const scheduleClose = useCallback(() => {
    cancelOpen(); cancelClose()
    closeTimer.current = setTimeout(() => { setItem(null); setArticle(null) }, 150)
  }, [cancelOpen, cancelClose])

  const showSummary = useCallback((summary: ArticleSummary, x: number, y: number) => {
    const campaign = useStore.getState().currentCampaign
    if (summary.article_type !== 'item') {
      setItem(null)
      // Already showing this one: keep it (and its fetched text) where it is.
      setArticle(prev => prev && prev.id === summary.id ? prev : { ...previewFromSummary(summary), x, y })
      if (!campaign) return
      window.api.getArticle(summary.id).then(full => {
        if (!full) return
        const extras = previewExtras(full)
        setArticle(prev => prev && prev.id === summary.id ? { ...prev, body: extras.body, image: extras.image ?? prev.image, crop: extras.crop ?? null } : prev)
      }).catch(() => { /* ignore */ })
      return
    }
    setArticle(null)
    let tracks: Record<string, string> = {}
    try { tracks = JSON.parse(summary.tracks || '{}') } catch { /* ignore */ }
    let tags: string[] = []
    try { const t = JSON.parse(summary.tags || '[]'); if (Array.isArray(t)) tags = t.filter(Boolean) } catch { /* ignore */ }
    setItem(prev => prev && prev.id === summary.id ? prev : {
      id: summary.id, x, y,
      name: summary.title,
      rarity: tracks.Rarity || undefined,
      status: tracks.Status || undefined,
      location: tracks.Location || undefined,
      tags,
      coverImage: summary.cover_image ? `file://${summary.cover_image}` : null,
      desc: undefined,
    })
    if (!campaign) return
    // Enrich from the full article (item stat block + lore) without blocking.
    window.api.getArticle(summary.id).then(full => {
      if (!full) return
      const ib = parseItemStatBlock((full as any).item_block || '')
      const attunement = ib.requiresAttunement
        ? (ib.attunementNote.trim() ? `requires attunement ${ib.attunementNote.trim()}` : 'requires attunement')
        : undefined
      // Stat-block rules text when the item has it; otherwise the article body,
      // shown with its formatting.
      const desc = clip(ib.description.trim(), 600)
      const body = desc ? null : parseDoc(full.content)
      // Prefer the item's portrait, fall back to its cover banner.
      const img = full.portrait_image ? `file://${full.portrait_image}` : full.cover_image ? `file://${full.cover_image}` : null
      setItem(prev => prev && prev.id === summary.id ? {
        ...prev,
        category: ib.category || prev.category,
        rarity: ib.rarity || prev.rarity,
        attunement,
        desc: desc || undefined,
        body,
        coverImage: img ?? prev.coverImage,
        coverCrop: parsePreviewCrop(full.preview_crop, full.portrait_image || full.cover_image),
      } : prev)
    }).catch(() => { /* ignore */ })
  }, [])

  const open = useCallback((find: (list: ArticleSummary[]) => ArticleSummary | undefined, x: number, y: number) => {
    // Live store state: callers may be listeners bound once at mount.
    const summary = find(useStore.getState().allArticles)
    if (!summary) { scheduleClose(); return }
    cancelClose()
    if (openDelay <= 0) { showSummary(summary, x, y); return }
    cancelOpen()
    openTimer.current = setTimeout(() => { openTimer.current = undefined; showSummary(summary, x, y) }, openDelay)
  }, [openDelay, scheduleClose, cancelClose, cancelOpen, showSummary])

  /** Show the card for a wiki-link title (exact match first, then any case). */
  const showByTitle = useCallback((title: string, x: number, y: number) => {
    const lower = title.toLowerCase()
    open(list => list.find(a => a.title === title) ?? list.find(a => a.title.toLowerCase() === lower), x, y)
  }, [open])
  const showById = useCallback((id: number, x: number, y: number) => {
    open(list => list.find(a => a.id === id), x, y)
  }, [open])

  const card = item ? (
    <ItemCard item={item} x={item.x} y={item.y} onMouseEnter={cancelClose} onMouseLeave={() => setItem(null)} />
  ) : article ? (
    <ArticlePreviewCard data={article} x={article.x} y={article.y} onMouseEnter={cancelClose} onMouseLeave={() => setArticle(null)} />
  ) : null

  return { showByTitle, showById, scheduleClose, cancelClose, hide, card }
}
