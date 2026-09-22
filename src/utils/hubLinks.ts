// path: src/utils/hubLinks.ts
// Links from a map feature (POI or drawing shape) to wiki articles and sessions,
// plus the plain-description convention both use for their TipTap `content`
// column. Extracted from HubWorldMap so shapes reuse one implementation rather
// than growing a parallel copy.

export interface HubLink {
  type: 'wiki' | 'session'
  article_id?: number
  title?: string
  session_id?: number
  session_number?: number
  session_sub?: string
  name?: string
  /**
   * Set by resolveHubLinks when the target no longer exists. Never stored —
   * strip it before saving (stripResolved).
   */
  missing?: boolean
}

export function parseHubLinks(raw: string): HubLink[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Map features store a one-paragraph description inside a full TipTap doc, so
// the same renderer can display them as any other rich content.
export function extractDescription(contentJson: string): string {
  try {
    const doc = JSON.parse(contentJson)
    for (const node of doc?.content ?? []) {
      if (node.type === 'paragraph') {
        const text = (node.content ?? []).map((c: any) => c.text ?? '').join('')
        if (text.trim()) return text.trim()
      }
    }
  } catch { /* malformed doc → no description */ }
  return ''
}

export function makeDescriptionDoc(description: string): string {
  return JSON.stringify({
    type: 'doc',
    content: description.trim()
      ? [{ type: 'paragraph', content: [{ type: 'text', text: description.trim() }] }]
      : [{ type: 'paragraph' }],
  })
}

// ── Keeping links honest ──────────────────────────────────────────────────────
// A link stores a *snapshot* of its target: a session's number, sub and name, an
// article's title. That snapshot is what the picker saw the day the link was
// made, so renaming a session (or renumbering one, or reordering them) leaves
// every pin still announcing the old name — the drift you see on the world map.
//
// The ids are the durable part, so resolve through them at render time. That
// also fixes navigation for wiki links, which jump by *title*: after a rename,
// the stored title points at nothing.
//
// Nothing here writes. Saving a feature re-persists the resolved copy, so the
// snapshots heal as you touch them, but display never waits for that.

export interface LinkTargets {
  sessions: { id: number; name: string; session_number: number; session_sub?: string | null }[]
  articles?: { id: number; title: string }[]
}

export function resolveHubLinks(links: HubLink[], { sessions, articles }: LinkTargets): HubLink[] {
  const sessionById = new Map(sessions.map(s => [s.id, s]))
  const articleById = articles ? new Map(articles.map(a => [a.id, a])) : null

  return links.map(link => {
    if (link.type === 'session' && link.session_id != null) {
      const live = sessionById.get(link.session_id)
      if (!live) return { ...link, missing: true }
      return {
        ...link,
        session_number: live.session_number,
        session_sub: live.session_sub ?? '',
        name: live.name,
        missing: false,
      }
    }
    // An article link with no index to check against keeps what it has, rather
    // than claiming a target is missing on no evidence.
    if (link.type === 'wiki' && link.article_id != null && articleById) {
      const live = articleById.get(link.article_id)
      if (!live) return { ...link, missing: true }
      return { ...link, title: live.title, missing: false }
    }
    return link
  })
}

/** The shape that goes back into the database — no resolution flags. */
export function stripResolved(links: HubLink[]): HubLink[] {
  return links.map(({ missing: _missing, ...rest }) => rest)
}

/** How a session link reads once resolved. */
export function sessionLinkLabel(link: HubLink): string {
  if (link.missing) return link.name ? `${link.name} (deleted)` : 'Deleted session'
  return `Session ${link.session_number}${link.session_sub ?? ''}: ${link.name}`
}
