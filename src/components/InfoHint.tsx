// path: src/components/InfoHint.tsx
// Small inline "(i)" affordance: a hover tooltip that explains a feature which
// has no visible button of its own — a keyboard shortcut, a typed macro, or a
// non-obvious rule. Sits next to a section heading or toolbar control.
import { Info } from 'lucide-react'

export function InfoHint({ text, size = 12, stopPropagation = false }: {
  text: string
  size?: number
  // Set when the hint lives inside a clickable header/button (e.g. a collapsible
  // panel title) so clicking the icon doesn't also trigger that action.
  stopPropagation?: boolean
}) {
  return (
    <span
      title={text}
      onClick={stopPropagation ? e => e.stopPropagation() : undefined}
      className="hover-text"
      style={{ display: 'inline-flex', cursor: 'help', color: 'var(--text-muted)' }}
    >
      <Info size={size} />
    </span>
  )
}
