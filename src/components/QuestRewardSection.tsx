// path: src/components/QuestRewardSection.tsx
// Rewards panel for quest articles — typed entries with description and notes.

import { useState, useCallback } from 'react'
import { Plus, Trash2, ChevronRight, ChevronDown as Expand, Coins, Package, BookOpen, Home, Sparkles } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

export type RewardType = 'gold' | 'item' | 'information' | 'property' | 'other'

export interface Reward {
  id: string
  type: RewardType
  description: string  // free text — can use [[Article]] / @spell / ((session)) links via RichEditor in body if desired
  quantity: string     // optional, only meaningful for gold/item
  notes: string
}

export function parseRewards(raw: string | null | undefined): Reward[] {
  try { return JSON.parse(raw ?? '[]') } catch { return [] }
}

// ── Type config ────────────────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: RewardType; label: string; color: string; bg: string; border: string; icon: any; showQty: boolean }[] = [
  { value: 'gold',        label: 'Gold',        color: '#c8a84b', bg: '#c8a84b14', border: '#c8a84b44', icon: Coins,     showQty: true  },
  { value: 'item',        label: 'Item',        color: '#9b7de8', bg: '#9b7de814', border: '#9b7de844', icon: Package,   showQty: true  },
  { value: 'information', label: 'Information', color: '#5b9fe8', bg: '#5b9fe814', border: '#5b9fe844', icon: BookOpen,  showQty: false },
  { value: 'property',    label: 'Property',    color: '#49c185', bg: '#49c18514', border: '#49c18544', icon: Home,      showQty: false },
  { value: 'other',       label: 'Other',       color: 'var(--text-muted)', bg: 'var(--bg-elevated)', border: 'var(--border-light)', icon: Sparkles, showQty: false },
]

function typeConfig(t: RewardType) {
  return TYPE_OPTIONS.find(o => o.value === t) ?? TYPE_OPTIONS[4]
}

// ── Type Picker ────────────────────────────────────────────────────────────────

function TypePicker({ value, onChange, readMode }: { value: RewardType; onChange: (v: RewardType) => void; readMode: boolean }) {
  const [open, setOpen] = useState(false)
  const cfg = typeConfig(value)
  const Icon = cfg.icon

  if (readMode) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 8px', borderRadius: 99, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
        <Icon size={10} /> {cfg.label}
      </span>
    )
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 8px', borderRadius: 99, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        <Icon size={10} /> {cfg.label} <ChevronRight size={9} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 100ms' }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', zIndex: 50, overflow: 'hidden', minWidth: 130 }}>
          {TYPE_OPTIONS.map(opt => {
            const OptIcon = opt.icon
            return (
              <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: opt.color, textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
              >
                <OptIcon size={11} /> {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Single Reward Row ──────────────────────────────────────────────────────────

function RewardRow({ reward, readMode, onChange, onDelete }: {
  reward: Reward; readMode: boolean
  onChange: (r: Reward) => void; onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(!!reward.notes)
  const cfg = typeConfig(reward.type)

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 6, overflow: 'hidden' }}>
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }}
        >
          {expanded ? <Expand size={12} /> : <ChevronRight size={12} />}
        </button>

        {/* Type */}
        <TypePicker value={reward.type} onChange={t => onChange({ ...reward, type: t })} readMode={readMode} />

        {/* Quantity (gold / item only) */}
        {cfg.showQty && (
          readMode ? (
            reward.quantity ? (
              <span style={{ fontSize: 12, color: cfg.color, fontWeight: 500, minWidth: 36, flexShrink: 0 }}>{reward.quantity}</span>
            ) : null
          ) : (
            <input
              value={reward.quantity}
              onChange={e => onChange({ ...reward, quantity: e.target.value })}
              placeholder={reward.type === 'gold' ? 'gp' : 'qty'}
              style={{ width: 60, fontSize: 12, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border-light)', background: 'transparent', color: cfg.color, outline: 'none', flexShrink: 0 }}
            />
          )
        )}

        {/* Description */}
        {readMode ? (
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>
            {reward.description || <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>No description</span>}
          </span>
        ) : (
          <input
            value={reward.description}
            onChange={e => onChange({ ...reward, description: e.target.value })}
            placeholder={
              reward.type === 'gold' ? 'e.g. From the village treasury' :
              reward.type === 'item' ? 'e.g. Crimson Key fragment' :
              reward.type === 'information' ? 'e.g. Location of the cult sanctum' :
              reward.type === 'property' ? 'e.g. Deed to the abandoned manor' :
              'Description…'
            }
            style={{ flex: 1, fontSize: 13, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)' }}
          />
        )}

        {/* Delete (edit mode only) */}
        {!readMode && (
          <button onClick={onDelete}
            style={{ display: 'flex', padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: 4, flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#e05555'; (e.currentTarget as HTMLElement).style.background = '#e0555514' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'none' }}
          ><Trash2 size={12} /></button>
        )}
      </div>

      {/* Expanded notes */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-light)', padding: '8px 10px 8px 32px' }}>
          {readMode ? (
            reward.notes ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{reward.notes}</div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No notes</div>
            )
          ) : (
            <textarea
              value={reward.notes}
              onChange={e => onChange({ ...reward, notes: e.target.value })}
              placeholder="Additional notes — conditions, who gets it, when it's handed over…"
              rows={3}
              style={{ width: '100%', fontSize: 12, color: 'var(--text-secondary)', background: 'transparent', border: 'none', outline: 'none', resize: 'vertical', lineHeight: 1.7, fontFamily: 'var(--font-body)' }}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Export ────────────────────────────────────────────────────────────────

export default function QuestRewardSection({ rewards, readMode, onChange }: {
  rewards: Reward[]
  readMode: boolean
  onChange: (rewards: Reward[]) => void
}) {
  const addReward = useCallback(() => {
    const newReward: Reward = {
      id: `reward_${Date.now()}`,
      type: 'gold',
      description: '',
      quantity: '',
      notes: '',
    }
    onChange([...rewards, newReward])
  }, [rewards, onChange])

  const updateReward = useCallback((idx: number, updated: Reward) => {
    const next = [...rewards]
    next[idx] = updated
    onChange(next)
  }, [rewards, onChange])

  const deleteReward = useCallback((idx: number) => {
    onChange(rewards.filter((_, i) => i !== idx))
  }, [rewards, onChange])

  return (
    <div>
      {rewards.length === 0 && readMode && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>
          No rewards yet — switch to Edit to add them
        </div>
      )}

      {rewards.map((reward, i) => (
        <RewardRow
          key={reward.id}
          reward={reward}
          readMode={readMode}
          onChange={updated => updateReward(i, updated)}
          onDelete={() => deleteReward(i)}
        />
      ))}

      {!readMode && (
        <button
          onClick={addReward}
          style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, padding: '5px 10px', fontSize: 12, background: 'transparent', border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 120ms' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold)'; (e.currentTarget as HTMLElement).style.color = 'var(--gold)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
        >
          <Plus size={12} /> Add reward
        </button>
      )}
    </div>
  )
}