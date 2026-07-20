// path: src/components/QuestRewardSection.tsx
// Rewards panel for quest articles — one reward record per quest, split into
// currency (a number per D&D coin type), linked item articles, information and
// a free-text catch-all.

import { useState, useCallback, useRef, useMemo } from 'react'
import { Plus, Trash2, Coins, Package, BookOpen, Sparkles, Link as LinkIcon } from 'lucide-react'
import DropdownPortal from './DropdownPortal'

// ── Types ──────────────────────────────────────────────────────────────────────

export type Currency = 'pp' | 'gp' | 'ep' | 'sp' | 'cp'

export interface RewardItem {
  id: string
  title: string   // article title when linked, otherwise plain text
  qty: string
  notes: string
}

export interface QuestReward {
  currency: Partial<Record<Currency, number>>
  items: RewardItem[]
  information: string
  other: string
}

export function emptyReward(): QuestReward {
  return { currency: {}, items: [], information: '', other: '' }
}

export function rewardHasData(r: QuestReward): boolean {
  return CURRENCIES.some(c => (r.currency[c.key] ?? 0) > 0)
    || r.items.some(i => i.title.trim() || i.qty.trim() || i.notes.trim())
    || !!r.information.trim()
    || !!r.other.trim()
}

// ── Parsing / migration ────────────────────────────────────────────────────────

// Rewards used to be an array of typed entries ({ type, description, quantity,
// notes }). Fold any legacy array into the single-record shape so old quests
// keep their rewards: gold quantities become gp, item entries become linked
// item rows, and information/property/other entries become text lines.
export function parseReward(raw: string | null | undefined): QuestReward {
  let parsed: any
  try { parsed = JSON.parse(raw ?? 'null') } catch { return emptyReward() }
  if (!parsed) return emptyReward()

  if (Array.isArray(parsed)) return migrateLegacy(parsed)

  return {
    currency: typeof parsed.currency === 'object' && parsed.currency ? parsed.currency : {},
    items: Array.isArray(parsed.items) ? parsed.items : [],
    information: typeof parsed.information === 'string' ? parsed.information : '',
    other: typeof parsed.other === 'string' ? parsed.other : '',
  }
}

function migrateLegacy(entries: any[]): QuestReward {
  const out = emptyReward()
  const infoLines: string[] = []
  const otherLines: string[] = []

  for (const e of entries) {
    const desc = (e?.description ?? '').trim()
    const qty = (e?.quantity ?? '').trim()
    const notes = (e?.notes ?? '').trim()
    const line = [desc, notes].filter(Boolean).join(' — ')

    if (e?.type === 'gold') {
      const n = parseInt(qty.replace(/[^0-9]/g, ''), 10)
      if (Number.isFinite(n) && n > 0) out.currency.gp = (out.currency.gp ?? 0) + n
      if (line) otherLines.push(line)
    } else if (e?.type === 'item') {
      out.items.push({ id: e.id ?? `ritem_${Math.random().toString(36).slice(2)}`, title: desc, qty, notes })
    } else if (e?.type === 'information') {
      if (line) infoLines.push(line)
    } else if (line) {
      otherLines.push(line)
    }
  }

  out.information = infoLines.join('\n')
  out.other = otherLines.join('\n')
  return out
}

// ── Currency config ────────────────────────────────────────────────────────────

const CURRENCIES: { key: Currency; label: string; name: string; color: string }[] = [
  { key: 'pp', label: 'PP', name: 'Platinum', color: '#cfd8e3' },
  { key: 'gp', label: 'GP', name: 'Gold',     color: '#c8a84b' },
  { key: 'ep', label: 'EP', name: 'Electrum', color: '#a9b06a' },
  { key: 'sp', label: 'SP', name: 'Silver',   color: '#a8b3bd' },
  { key: 'cp', label: 'CP', name: 'Copper',   color: '#c08457' },
]

// ── Group shell ────────────────────────────────────────────────────────────────

function Group({ icon: Icon, label, color, children }: {
  icon: any; label: string; color: string; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color }}>
        <Icon size={11} /> {label}
      </div>
      {children}
    </div>
  )
}

// ── Currency row ───────────────────────────────────────────────────────────────

function CurrencyRow({ currency, readMode, onChange }: {
  currency: QuestReward['currency']; readMode: boolean
  onChange: (c: QuestReward['currency']) => void
}) {
  const setCoin = (key: Currency, raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '')
    const next = { ...currency }
    if (digits === '') delete next[key]
    else next[key] = parseInt(digits, 10)
    onChange(next)
  }

  const shown = readMode ? CURRENCIES.filter(c => (currency[c.key] ?? 0) > 0) : CURRENCIES

  if (readMode && shown.length === 0) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {shown.map(c => (
        <div key={c.key} title={c.name}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 99, background: `${c.color}12`, border: `1px solid ${c.color}44` }}>
          {readMode ? (
            <span style={{ fontSize: 12, fontWeight: 600, color: c.color }}>{currency[c.key]}</span>
          ) : (
            <input
              value={currency[c.key] ?? ''}
              onChange={e => setCoin(c.key, e.target.value)}
              inputMode="numeric"
              placeholder="0"
              style={{ width: 46, fontSize: 12, fontWeight: 600, background: 'transparent', border: 'none', outline: 'none', color: c.color, textAlign: 'right' }}
            />
          )}
          <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>{c.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Item title field (autocomplete over item articles) ─────────────────────────

function ItemTitleInput({ value, suggestions, onChange }: {
  value: string; suggestions: string[]; onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase()
    return suggestions.filter(s => !q || s.toLowerCase().includes(q)).slice(0, 8)
  }, [value, suggestions])

  return (
    <div ref={wrapRef} style={{ flex: 1, minWidth: 0 }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Item name — links to an item article"
        style={{ width: '100%', fontSize: 13, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)' }}
      />
      {open && matches.length > 0 && (
        <DropdownPortal anchor={wrapRef.current} align="left" minWidth={200} onClose={() => setOpen(false)}>
          {matches.map(m => (
            <button key={m} onClick={() => { onChange(m); setOpen(false) }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'left' }}
              className="hover-bg"
            >
              <Package size={11} style={{ color: '#9b7de8', flexShrink: 0 }} /> {m}
            </button>
          ))}
        </DropdownPortal>
      )}
    </div>
  )
}

// ── Item rows ──────────────────────────────────────────────────────────────────

function ItemRow({ item, readMode, suggestions, isLinked, onChange, onDelete, onOpen }: {
  item: RewardItem; readMode: boolean; suggestions: string[]; isLinked: boolean
  onChange: (i: RewardItem) => void; onDelete: () => void; onOpen: () => void
}) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 6, padding: '8px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {readMode ? (
          item.qty ? <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>×{item.qty}</span> : null
        ) : (
          <input
            value={item.qty}
            onChange={e => onChange({ ...item, qty: e.target.value.replace(/[^0-9]/g, '') })}
            inputMode="numeric"
            placeholder="qty"
            style={{ width: 42, fontSize: 12, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-secondary)', outline: 'none', flexShrink: 0, textAlign: 'right' }}
          />
        )}

        {readMode ? (
          item.title ? (
            isLinked ? (
              <button onClick={onOpen}
                style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, color: '#9b7de8', textAlign: 'left' }}
              >
                <LinkIcon size={10} style={{ flexShrink: 0 }} /> {item.title}
              </button>
            ) : (
              <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{item.title}</span>
            )
          ) : (
            <span style={{ flex: 1, fontSize: 13, fontStyle: 'italic', color: 'var(--text-muted)' }}>Unnamed item</span>
          )
        ) : (
          <ItemTitleInput value={item.title} suggestions={suggestions} onChange={t => onChange({ ...item, title: t })} />
        )}

        {!readMode && isLinked && <LinkIcon size={11} style={{ color: '#9b7de8', flexShrink: 0 }} />}

        {!readMode && (
          <button onClick={onDelete}
            style={{ display: 'flex', padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: 4, flexShrink: 0 }}
            className="hover-danger-tint"
          ><Trash2 size={12} /></button>
        )}
      </div>

      {readMode ? (
        item.notes ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 4, whiteSpace: 'pre-wrap' }}>{item.notes}</div>
        ) : null
      ) : (
        <input
          value={item.notes}
          onChange={e => onChange({ ...item, notes: e.target.value })}
          placeholder="Note — condition, who receives it…"
          style={{ width: '100%', fontSize: 12, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-secondary)', marginTop: 2 }}
        />
      )}
    </div>
  )
}

// ── Text block ─────────────────────────────────────────────────────────────────

function TextBlock({ value, readMode, placeholder, onChange }: {
  value: string; readMode: boolean; placeholder: string; onChange: (v: string) => void
}) {
  if (readMode) {
    if (!value.trim()) return null
    return (
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '8px 10px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
        {value}
      </div>
    )
  }
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '8px 10px', fontSize: 12, color: 'var(--text-secondary)', outline: 'none', resize: 'vertical', lineHeight: 1.7, fontFamily: 'var(--font-body)' }}
    />
  )
}

// ── Main Export ────────────────────────────────────────────────────────────────

export default function QuestRewardSection({ reward, readMode, itemSuggestions = [], onOpenArticle, onChange }: {
  reward: QuestReward
  readMode: boolean
  itemSuggestions?: string[]
  onOpenArticle?: (title: string) => void
  onChange: (reward: QuestReward) => void
}) {
  const linkedTitles = useMemo(
    () => new Set(itemSuggestions.map(t => t.toLowerCase())),
    [itemSuggestions]
  )

  const addItem = useCallback(() => {
    onChange({ ...reward, items: [...reward.items, { id: `ritem_${Date.now()}`, title: '', qty: '', notes: '' }] })
  }, [reward, onChange])

  const updateItem = useCallback((idx: number, updated: RewardItem) => {
    const items = [...reward.items]
    items[idx] = updated
    onChange({ ...reward, items })
  }, [reward, onChange])

  const deleteItem = useCallback((idx: number) => {
    onChange({ ...reward, items: reward.items.filter((_, i) => i !== idx) })
  }, [reward, onChange])

  if (readMode && !rewardHasData(reward)) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>
        No reward set yet — switch to Edit to add one
      </div>
    )
  }

  const showItems = !readMode || reward.items.some(i => i.title.trim() || i.qty.trim() || i.notes.trim())

  return (
    <div>
      <Group icon={Coins} label="Currency" color="#c8a84b">
        <CurrencyRow
          currency={reward.currency}
          readMode={readMode}
          onChange={c => onChange({ ...reward, currency: c })}
        />
      </Group>

      {showItems && (
        <Group icon={Package} label="Items" color="#9b7de8">
          {reward.items.map((item, i) => (
            <ItemRow
              key={item.id}
              item={item}
              readMode={readMode}
              suggestions={itemSuggestions}
              isLinked={linkedTitles.has(item.title.trim().toLowerCase())}
              onChange={u => updateItem(i, u)}
              onDelete={() => deleteItem(i)}
              onOpen={() => onOpenArticle?.(item.title)}
            />
          ))}
          {!readMode && (
            <button
              onClick={addItem}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, background: 'transparent', border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 120ms' }}
              className="hover-gold-border-strong"
            >
              <Plus size={12} /> Add item
            </button>
          )}
        </Group>
      )}

      {(!readMode || reward.information.trim()) && (
        <Group icon={BookOpen} label="Information" color="var(--info)">
          <TextBlock
            value={reward.information}
            readMode={readMode}
            placeholder="Secrets, names, locations or leads the party earns…"
            onChange={v => onChange({ ...reward, information: v })}
          />
        </Group>
      )}

      {(!readMode || reward.other.trim()) && (
        <Group icon={Sparkles} label="Other" color="var(--text-muted)">
          <TextBlock
            value={reward.other}
            readMode={readMode}
            placeholder="Favours, titles, property, renown, anything else…"
            onChange={v => onChange({ ...reward, other: v })}
          />
        </Group>
      )}
    </div>
  )
}
