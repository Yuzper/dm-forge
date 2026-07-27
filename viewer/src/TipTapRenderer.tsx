// Compact, dependency-free renderer for the TipTap JSON that DM-Forge produces.
// Deliberately self-contained (no @tiptap, no store) so the viewer never pulls
// in the editor stack. Covers the node/mark set the app actually uses; unknown
// nodes render their children (or nothing) rather than throwing.
import type { CSSProperties, ReactNode } from 'react'

interface Node {
  type?: string
  text?: string
  content?: Node[]
  marks?: { type: string; attrs?: any }[]
  attrs?: any
}

// Wrap a text run in its marks (innermost first).
function applyMarks(text: ReactNode, marks: Node['marks'], onWikiLink: (title: string) => void, key: number): ReactNode {
  if (!marks || marks.length === 0) return text
  let el: ReactNode = text
  for (const m of marks) {
    switch (m.type) {
      case 'bold':      el = <strong>{el}</strong>; break
      case 'italic':    el = <em>{el}</em>; break
      case 'underline': el = <u>{el}</u>; break
      case 'strike':    el = <s>{el}</s>; break
      case 'code':      el = <code>{el}</code>; break
      case 'highlight': el = <mark>{el}</mark>; break
      case 'textStyle': {
        const color = m.attrs?.color
        el = color ? <span style={{ color }}>{el}</span> : el
        break
      }
      case 'link': {
        const href = m.attrs?.href
        el = <a href={href} target="_blank" rel="noreferrer noopener">{el}</a>
        break
      }
      case 'wikiLink': {
        const title = String(m.attrs?.title ?? '')
        el = <a className="wikilink" onClick={e => { e.preventDefault(); onWikiLink(title) }} href="#">{el}</a>
        break
      }
      default: break
    }
  }
  return <span key={key}>{el}</span>
}

function alignStyle(attrs: any): CSSProperties | undefined {
  return attrs?.textAlign ? { textAlign: attrs.textAlign } : undefined
}

function renderChildren(nodes: Node[] | undefined, onWikiLink: (t: string) => void): ReactNode[] {
  return (nodes ?? []).map((n, i) => <RenderNode key={i} node={n} onWikiLink={onWikiLink} />)
}

function RenderNode({ node, onWikiLink }: { node: Node; onWikiLink: (title: string) => void }): ReactNode {
  switch (node.type) {
    case 'text':
      // Defence in depth: the publish pipeline strips DM-only runs, but never
      // render one even if a bundle somehow carried it through.
      if (node.marks?.some(m => m.type === 'dmOnly')) return null
      return applyMarks(node.text, node.marks, onWikiLink, 0)
    case 'paragraph':
      return <p style={alignStyle(node.attrs)}>{renderChildren(node.content, onWikiLink)}</p>
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 2), 1), 3)
      const Tag = (`h${level}`) as 'h1' | 'h2' | 'h3'
      return <Tag style={alignStyle(node.attrs)}>{renderChildren(node.content, onWikiLink)}</Tag>
    }
    case 'bulletList':   return <ul>{renderChildren(node.content, onWikiLink)}</ul>
    case 'orderedList':  return <ol>{renderChildren(node.content, onWikiLink)}</ol>
    case 'listItem':     return <li>{renderChildren(node.content, onWikiLink)}</li>
    case 'taskList':     return <ul className="task-list">{renderChildren(node.content, onWikiLink)}</ul>
    case 'taskItem':     return <li className="task-item"><input type="checkbox" checked={!!node.attrs?.checked} readOnly /> <span>{renderChildren(node.content, onWikiLink)}</span></li>
    case 'blockquote':   return <blockquote>{renderChildren(node.content, onWikiLink)}</blockquote>
    case 'codeBlock':    return <pre><code>{renderChildren(node.content, onWikiLink)}</code></pre>
    case 'horizontalRule': return <hr />
    case 'hardBreak':    return <br />
    case 'image':
      return <img src={node.attrs?.src} alt={node.attrs?.alt ?? ''} />
    case 'table':        return <div className="table-wrap"><table><tbody>{renderChildren(node.content, onWikiLink)}</tbody></table></div>
    case 'tableRow':     return <tr>{renderChildren(node.content, onWikiLink)}</tr>
    case 'tableHeader':  return <th colSpan={node.attrs?.colspan} rowSpan={node.attrs?.rowspan}>{renderChildren(node.content, onWikiLink)}</th>
    case 'tableCell':    return <td colSpan={node.attrs?.colspan} rowSpan={node.attrs?.rowspan}>{renderChildren(node.content, onWikiLink)}</td>
    case 'doc':          return <>{renderChildren(node.content, onWikiLink)}</>
    default:
      // Unknown/unsupported node — render any children so nothing silently vanishes.
      return node.content ? <>{renderChildren(node.content, onWikiLink)}</> : null
  }
}

export default function TipTapRenderer({ json, onWikiLink }: {
  json: string
  onWikiLink: (title: string) => void
}) {
  let doc: Node
  try { doc = JSON.parse(json) } catch { return null }
  return <div className="prose"><RenderNode node={doc} onWikiLink={onWikiLink} /></div>
}
