// path: src/components/QuestSubstepsSection.tsx
// Substeps panel for quest articles — ordered steps with status, notes, session + POI links.

import { useState, useCallback } from 'react'
import { Plus, ChevronUp, ChevronDown, Trash2, ChevronRight, ChevronDown as Expand } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Substep {
  id: string
  title: string
  notes: string
  status: 'not_started' | 'in_progress' | 'complete' | 'skipped'
  session_label: string   // free text e.g. "S12"
  poi_label: string       // free text e.g. "Rivenshade"
}

export function parseSubsteps(raw: string | null | undefined): Substep[] {
  try { return JSON.parse(raw ?? '[]') } catch { return [] }
}

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: Substep['status']; label: string; color: string; bg: string; border: string }[] = [
  { value: 'not_started', label: 'Not started', color: 'var(--text-muted)',    bg: 'var(--bg-elevated)',  border: 'var(--border-light)' },
  { value: 'in_progress', label: 'In progress',  color: '#5b9fe8',             bg: '#5b9fe812',           border: '#5b9fe840' },
  { value: 'complete',    label: 'Complete',      color: '#49c185',             bg: '#49c18512',           border: '#49c18540' },
  { value: 'skipped',     label: 'Skipped',       color: 'var(--text-muted)',   bg: 'var(--bg-elevated)',  border: 'var(--border-light)' },
]

function statusConfig(s: Substep['status']) {
  return STATUS_OPTIONS.find(o => o.value === s) ?? STATUS_OPTIONS[0]
}

// ── Status Picker ──────────────────────────────────────────────────────────────

function StatusPicker({ value, onChange, readMode }: { value: Substep['status']; onChange: (v: Substep['status']) => void; readMode: boolean }) {
  const [open, setOpen] = useState(false)
  const cfg = statusConfig(value)

  if (readMode) {
    return (
      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, whiteSpace: 'nowrap', fontStyle: value === 'skipped' ? 'italic' : 'normal' }}>
        {cfg.label}
      </span>
    )
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4, fontStyle: value === 'skipped' ? 'italic' : 'normal' }}
      >
        {cfg.label} <ChevronRight size={9} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 100ms' }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', zIndex: 50, overflow: 'hidden', minWidth: 120 }}>
          {STATUS_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false) }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: opt.color, textAlign: 'left', fontStyle: opt.value === 'skipped' ? 'italic' : 'normal' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Single Substep Row ─────────────────────────────────────────────────────────

function SubstepRow({ step, index, total, readMode, onChange, onDelete, onMoveUp, onMoveDown }: {
  step: Substep; index: number; total: number; readMode: boolean
  onChange: (s: Substep) => void; onDelete: () => void
  onMoveUp: () => void; onMoveDown: () => void
}) {
  const [expanded, setExpanded] = useState(!!step.notes)
  const isDone = step.status === 'complete' || step.status === 'skipped'

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 6, overflow: 'hidden' }}>
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>

        {/* Expand toggle (only if has notes or in edit mode) */}
        <button
          onClick={() => setExpanded(v => !v)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }}
        >
          {expanded ? <Expand size={12} /> : <ChevronRight size={12} />}
        </button>

        {/* Step number */}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 18, flexShrink: 0, textAlign: 'right' }}>{index + 1}</span>

        {/* Title */}
        {readMode ? (
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: isDone ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: isDone ? 'line-through' : 'none' }}>
            {step.title || <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Untitled substep</span>}
          </span>
        ) : (
          <input
            value={step.title}
            onChange={e => onChange({ ...step, title: e.target.value })}
            placeholder="Substep title…"
            style={{ flex: 1, fontSize: 13, fontWeight: 500, background: 'transparent', border: 'none', outline: 'none', color: isDone ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: isDone ? 'line-through' : 'none' }}
          />
        )}

        {/* Session chip */}
        {(step.session_label || !readMode) && (
          readMode ? (
            step.session_label ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '1px 6px', borderRadius: 99, border: '1px solid var(--border-light)', color: 'var(--gold)', background: 'var(--gold-subtle)', whiteSpace: 'nowrap' }}>
                ◎ {step.session_label}
              </span>
            ) : null
          ) : (
            <input
              value={step.session_label}
              onChange={e => onChange({ ...step, session_label: e.target.value })}
              placeholder="Session…"
              style={{ width: 70, fontSize: 10, padding: '2px 6px', borderRadius: 99, border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-muted)', outline: 'none' }}
            />
          )
        )}

        {/* POI chip */}
        {(step.poi_label || !readMode) && (
          readMode ? (
            step.poi_label ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '1px 6px', borderRadius: 99, border: '1px solid var(--border-light)', color: 'var(--text-muted)', background: 'var(--bg-elevated)', whiteSpace: 'nowrap' }}>
                ◉ {step.poi_label}
              </span>
            ) : null
          ) : (
            <input
              value={step.poi_label}
              onChange={e => onChange({ ...step, poi_label: e.target.value })}
              placeholder="Location…"
              style={{ width: 90, fontSize: 10, padding: '2px 6px', borderRadius: 99, border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-muted)', outline: 'none' }}
            />
          )
        )}

        {/* Status */}
        <StatusPicker value={step.status} onChange={s => onChange({ ...step, status: s })} readMode={readMode} />

        {/* Reorder + delete (edit mode only) */}
        {!readMode && (
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            <button onClick={onMoveUp} disabled={index === 0}
              style={{ display: 'flex', padding: 3, background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer', color: index === 0 ? 'var(--border)' : 'var(--text-muted)', borderRadius: 4 }}
              onMouseEnter={e => { if (index > 0) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
            ><ChevronUp size={12} /></button>
            <button onClick={onMoveDown} disabled={index === total - 1}
              style={{ display: 'flex', padding: 3, background: 'none', border: 'none', cursor: index === total - 1 ? 'default' : 'pointer', color: index === total - 1 ? 'var(--border)' : 'var(--text-muted)', borderRadius: 4 }}
              onMouseEnter={e => { if (index < total - 1) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
            ><ChevronDown size={12} /></button>
            <button onClick={onDelete}
              style={{ display: 'flex', padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: 4 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#e05555'; (e.currentTarget as HTMLElement).style.background = '#e0555514' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'none' }}
            ><Trash2 size={12} /></button>
          </div>
        )}
      </div>

      {/* Expanded notes */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-light)', padding: '8px 10px 8px 44px' }}>
          {readMode ? (
            step.notes ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{step.notes}</div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No notes</div>
            )
          ) : (
            <textarea
              value={step.notes}
              onChange={e => onChange({ ...step, notes: e.target.value })}
              placeholder="DM prep notes for this substep…"
              rows={3}
              style={{ width: '100%', fontSize: 12, color: 'var(--text-secondary)', background: 'transparent', border: 'none', outline: 'none', resize: 'vertical', lineHeight: 1.7, fontFamily: 'var(--font-body)' }}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Progress Bar ───────────────────────────────────────────────────────────────

function ProgressBar({ steps }: { steps: Substep[] }) {
  if (steps.length === 0) return null
  const done = steps.filter(s => s.status === 'complete').length
  const skipped = steps.filter(s => s.status === 'skipped').length
  const pct = Math.round((done / steps.length) * 100)

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {done} of {steps.length} complete{skipped > 0 ? `, ${skipped} skipped` : ''}
        </span>
        <span style={{ fontSize: 11, color: pct === 100 ? '#49c185' : 'var(--text-muted)' }}>{pct}%</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--border-light)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: pct === 100 ? '#49c185' : '#5b9fe8', transition: 'width 300ms ease' }} />
      </div>
    </div>
  )
}

// ── Main Export ────────────────────────────────────────────────────────────────

export default function QuestSubstepsSection({ articleId: _articleId, substeps, readMode, onChange }: {
  articleId: number
  substeps: Substep[]
  readMode: boolean
  onChange: (steps: Substep[]) => void
}) {
  const addStep = useCallback(() => {
    const newStep: Substep = {
      id: `step_${Date.now()}`,
      title: '',
      notes: '',
      status: 'not_started',
      session_label: '',
      poi_label: '',
    }
    onChange([...substeps, newStep])
  }, [substeps, onChange])

  const updateStep = useCallback((idx: number, updated: Substep) => {
    const next = [...substeps]
    next[idx] = updated
    onChange(next)
  }, [substeps, onChange])

  const deleteStep = useCallback((idx: number) => {
    onChange(substeps.filter((_, i) => i !== idx))
  }, [substeps, onChange])

  const moveStep = useCallback((idx: number, dir: -1 | 1) => {
    const next = [...substeps]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }, [substeps, onChange])

  return (
    <div>
      <ProgressBar steps={substeps} />

      {substeps.length === 0 && readMode && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>
          No substeps yet — switch to Edit to add them
        </div>
      )}

      {substeps.map((step, i) => (
        <SubstepRow
          key={step.id}
          step={step}
          index={i}
          total={substeps.length}
          readMode={readMode}
          onChange={updated => updateStep(i, updated)}
          onDelete={() => deleteStep(i)}
          onMoveUp={() => moveStep(i, -1)}
          onMoveDown={() => moveStep(i, 1)}
        />
      ))}

      {!readMode && (
        <button
          onClick={addStep}
          style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, padding: '5px 10px', fontSize: 12, background: 'transparent', border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 120ms' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold)'; (e.currentTarget as HTMLElement).style.color = 'var(--gold)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
        >
          <Plus size={12} /> Add substep
        </button>
      )}
    </div>
  )
}