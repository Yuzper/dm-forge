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
