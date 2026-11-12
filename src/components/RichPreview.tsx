// path: src/components/RichPreview.tsx
// A short, read-only rendering of an article's stored TipTap JSON, for hover
// cards: headings, paragraphs, emphasis, lists, quotes and links keep their
// shape, and the text stops after a character budget. Images and tables are
// left out (the card has its own picture; a table won't fit a card).
// Styled by .rich-preview in index.css.
import type { ReactNode } from 'react'

export type PMNode = {
  type: string
  text?: string
  attrs?: Record<string, any>
  marks?: { type: string; attrs?: Record<string, any> }[]
  content?: PMNode[]
}

const LINK_MARKS = new Set(['wikiLink', 'sessionLink', 'spellLink', 'soundLink', 'webLink'])
const SKIP = new Set(['image', 'table'])

/** Parse stored content; null when there's nothing to show. */
export function parseDoc(raw: string | null | undefined): PMNode | null {
  try {
    const doc = raw ? JSON.parse(raw) : null
    return doc && Array.isArray(doc.content) ? doc : null
  } catch { return null }
}

function hasText(n: PMNode): boolean {
  if (n.type === 'text') return !!n.text?.trim()
  return (n.content ?? []).some(hasText)
}

export function RichPreview({ doc, budget = 420 }: { doc: PMNode; budget?: number }) {
  let left = budget
  let key = 0

  const text = (n: PMNode): ReactNode => {
    if (left <= 0) return null
    let t = n.text ?? ''
    if (t.length > left) {
      // Stop at the last whole word when one is close by, not mid-word.
      const cut = t.slice(0, left)
      const space = cut.lastIndexOf(' ')
      t = (space > left - 30 && space > 0 ? cut.slice(0, space) : cut).trimEnd() + '…'
      left = 0
    } else left -= t.length
    let out: ReactNode = t
    for (const m of n.marks ?? []) {
      if (m.type === 'bold') out = <strong>{out}</strong>
      else if (m.type === 'italic') out = <em>{out}</em>
      else if (m.type === 'underline') out = <u>{out}</u>
      else if (m.type === 'strike') out = <s>{out}</s>
      else if (m.type === 'highlight') out = <mark>{out}</mark>
      else if (m.type === 'code') out = <code>{out}</code>
      else if (m.type === 'dmOnly') out = <span className="rp-dm">{out}</span>
      else if (LINK_MARKS.has(m.type)) out = <span className="rp-link">{out}</span>
    }
    return <span key={key++}>{out}</span>
  }

  const kids = (n: PMNode): ReactNode[] => {
    const out: ReactNode[] = []
    for (const c of n.content ?? []) {
      if (left <= 0) break
      const r = node(c)
      if (r != null) out.push(r)
    }
    return out
  }

  const node = (n: PMNode): ReactNode => {
    if (left <= 0 || SKIP.has(n.type)) return null
    const k = key++
    switch (n.type) {
      case 'text': return text(n)
      case 'hardBreak': return <br key={k} />
      case 'paragraph': return hasText(n) ? <p key={k}>{kids(n)}</p> : null
      case 'heading': {
        if (!hasText(n)) return null
        const level = Math.min(3, Math.max(1, Number(n.attrs?.level) || 1))
        // Headings cost a little extra so a page of short headings still stops.
        left -= 20
        return <div key={k} className={`rp-h rp-h${level}`}>{kids(n)}</div>
      }
      case 'bulletList': return <ul key={k}>{kids(n)}</ul>
      case 'orderedList': return <ol key={k} start={n.attrs?.start ?? 1}>{kids(n)}</ol>
      case 'listItem': return hasText(n) ? <li key={k}>{kids(n)}</li> : null
      case 'blockquote': return <blockquote key={k}>{kids(n)}</blockquote>
      case 'codeBlock': return <pre key={k}>{kids(n)}</pre>
      case 'horizontalRule': return <hr key={k} />
      default: {
        // Wrappers (DM-only blocks and the like): show what's inside.
        const inner = kids(n)
        return inner.length ? <div key={k}>{inner}</div> : null
      }
    }
  }

  // Top level by hand, so a heading or rule left at the end with nothing under
  // it (an unfinished section, or where the budget ran out) can be dropped.
  const body: { el: ReactNode; trailing: boolean }[] = []
  for (const c of doc.content ?? []) {
    if (left <= 0) break
    const el = node(c)
    if (el != null) body.push({ el, trailing: c.type === 'heading' || c.type === 'horizontalRule' })
  }
  while (body.length && body[body.length - 1].trailing) body.pop()
  return body.length ? <div className="rich-preview">{body.map(b => b.el)}</div> : null
}
