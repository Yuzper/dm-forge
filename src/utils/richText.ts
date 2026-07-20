// path: src/utils/richText.ts
// Flatten a TipTap document (stored as JSON text) to readable plain text —
// used for previews, search matching and hover cards.

interface TipTapNode {
  type?: string
  text?: string
  content?: TipTapNode[]
}

export function richTextToPlain(json: string): string {
  try {
    const walk = (node: TipTapNode): string =>
      node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(walk).join(' ')
    return walk(JSON.parse(json)).replace(/\s+/g, ' ').trim()
  } catch { return '' }
}
