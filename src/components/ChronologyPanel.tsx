// path: src/components/ChronologyPanel.tsx
// Canon audit dropdown for the Timeline page. Mirrors the wiki-health idiom
// (grouped sections, click a row to jump to the thing) but reports chronology
// problems rather than article completeness.
import { useState } from 'react'
import { X, AlertTriangle, HelpCircle, ArrowUpDown, Clock } from 'lucide-react'
import { ARTICLE_TYPE_COLORS } from '../constants/articleTypes'
import {
  ISSUE_ORDER, ISSUE_LABEL, groupIssues, countBySeverity,
  type ChronologyIssue, type IssueKind, type IssueSeverity,
} from '../utils/chronologyAudit'

const SEVERITY_COLOR: Record<IssueSeverity, string> = {
  error: 'var(--danger)',
  warn:  'var(--warning)',
  info:  'var(--text-muted)',
}

const KIND_ICON: Record<IssueKind, typeof AlertTriangle> = {
  'impossible-span': AlertTriangle,
  'unreadable': HelpCircle,
  'session-order': ArrowUpDown,
  'undated': Clock,
}

const SECTION_LIMIT = 4

export function ChronologyPanel({ issues, onSelect, onClose }: {
  issues: ChronologyIssue[]
  onSelect: (issue: ChronologyIssue) => void
  onClose: () => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const grouped = groupIssues(issues)
  const counts = countBySeverity(issues)

  return (
    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', width: 380, maxHeight: 460, overflowY: 'auto', zIndex: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 6px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 1 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Chronology</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {counts.error > 0 && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{counts.error} to fix</span>}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><X size={13} /></button>
        </div>
      </div>

      {issues.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--success)', padding: '14px 14px' }}>
          <span>✓</span> Nothing contradicts itself
        </div>
      ) : (
        <div style={{ padding: '8px 4px 10px' }}>
          {ISSUE_ORDER.map(kind => {
            const list = grouped[kind]
            if (!list.length) return null
            const Icon = KIND_ICON[kind]
            const color = SEVERITY_COLOR[list[0].severity]
            const shown = expanded[kind] ? list : list.slice(0, SECTION_LIMIT)
            return (
              <div key={kind} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px 5px', fontSize: 10, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <Icon size={11} /> {ISSUE_LABEL[kind]} · {list.length}
                </div>
                {shown.map(issue => (
                  <button key={issue.key} onClick={() => onSelect(issue)} className="hover-bg"
                    style={{ width: '100%', display: 'flex', alignItems: 'baseline', gap: 8, padding: '5px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 80ms' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, alignSelf: 'center', background: issue.articleType ? (ARTICLE_TYPE_COLORS[issue.articleType] ?? 'var(--text-muted)') : 'var(--gold)' }} />
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', flexShrink: 0, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {issue.title}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={issue.raw ? `${issue.detail} — “${issue.raw}”` : issue.detail}>
                      {issue.raw ? `“${issue.raw}”` : issue.detail}
                    </span>
                  </button>
                ))}
                {list.length > SECTION_LIMIT && !expanded[kind] && (
                  <button onClick={() => setExpanded(e => ({ ...e, [kind]: true }))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', padding: '2px 12px' }}>
                    +{list.length - SECTION_LIMIT} more
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
