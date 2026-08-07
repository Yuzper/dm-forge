// path: src/components/TimelineDrilldown.tsx
// Drill-down timeline: decades → one year → one calendar division. Replaces the
// single continuous axis, which could only ever be read at one zoom and needed
// horizontal scroll at every one of them. Each level here is a grid or a
// vertical rail, so the whole view survives a narrow pane.
import { ChevronRight, ChevronLeft, Plus } from 'lucide-react'
import {
  spanLabel, yearLength, formatCalendarDay,
  type CampaignCalendar, type ClusterItem, type Era,
} from '../utils/timelineGeometry'
import {
  KIND_COLOR, KIND_GLYPH, countByKind, eraForYear, eraWithin,
  layoutSpanRail, lifespansOverlapping, spanBounds,
  QUIET_RUN_H, type DecadeBand, type LifespanBand, type SpanBucket,
} from '../utils/timelineDrilldown'

const RAIL_X = 62
const CARD_MAX_W = 460
const DAY_PX = 26      // horizontal orientation: px per day
const ROW_H = 26

export type DrilldownLevel =
  | { view: 'decades' }
  | { view: 'year'; year: number }
  | { view: 'span'; year: number; span: number }

// ── Shared bits ──────────────────────────────────────────────────────────────

function CountPills({ items, size = 10 }: { items: ClusterItem[]; size?: number }) {
  const parts = countByKind(items)
  if (!parts.length) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {parts.map(([kind, n]) => (
        <span key={kind} title={`${n} ${kind}${n === 1 ? '' : 's'}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: size, color: 'var(--text-muted)' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: KIND_COLOR[kind], flexShrink: 0 }} />
          {n}
        </span>
      ))}
    </div>
  )
}

function EraTag({ era }: { era: Era }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '1px 7px',
      borderRadius: 99, color: era.color, border: `1px solid ${era.color}44`,
      background: `${era.color}14`, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: era.color, flexShrink: 0 }} />
      {era.name}
    </span>
  )
}

const itemLabel = (it: ClusterItem) =>
  it.kind === 'session' ? `S${it.session_number}${it.session_sub ?? ''} · ${it.title}` : it.title

// Multi-day sessions keep their span visible even though the rail places them on
// their start day.
function itemSub(it: ClusterItem, cal: CampaignCalendar): string | null {
  if (it.kind !== 'session' || it.in_world_day_end == null) return null
  const n = it.in_world_day_end - it.day + 1
  return n > 1 ? `${n} days, to ${formatCalendarDay(it.in_world_day_end, cal)}` : null
}

function LifespanStrip({ spans, label }: { spans: LifespanBand[]; label: string }) {
  if (!spans.length) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.07em', flexShrink: 0 }}>{label}</span>
      {spans.map(s => (
        <span key={s.id} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '1px 7px',
          borderRadius: 99, color: 'var(--text-secondary)', border: '1px solid var(--border)',
          background: `${s.color}10`,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
          {s.title}
        </span>
      ))}
    </div>
  )
}

function StepBtn({ dir, label, onClick }: { dir: -1 | 1; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="hover-text" style={{
      display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg-elevated)',
      border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)',
      padding: '4px 10px', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer',
      fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap',
    }}>
      {dir === -1 && <ChevronLeft size={12} />}{label}{dir === 1 && <ChevronRight size={12} />}
    </button>
  )
}

// ── Breadcrumb (the zoom control) ────────────────────────────────────────────

export function TimelineBreadcrumb({ level, cal, onNavigate }: {
  level: DrilldownLevel; cal: CampaignCalendar; onNavigate: (l: DrilldownLevel) => void
}) {
  const crumbs: { label: string; to?: DrilldownLevel }[] = [
    { label: 'Decades', to: level.view === 'decades' ? undefined : { view: 'decades' } },
    ...(level.view !== 'decades'
      ? [{ label: String(level.year), to: level.view === 'span' ? { view: 'year' as const, year: level.year } : undefined }]
      : []),
    ...(level.view === 'span' ? [{ label: spanLabel(cal, level.span) }] : []),
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 32px 10px' }}>
      {crumbs.map((c, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {i > 0 && <ChevronRight size={12} color="var(--text-muted)" />}
          <button onClick={() => c.to && onNavigate(c.to)} disabled={!c.to}
            className={c.to ? 'hover-text' : undefined}
            style={{
              background: 'transparent', border: 'none', padding: '2px 4px', fontSize: 12,
              fontFamily: 'var(--font-ui)', cursor: c.to ? 'pointer' : 'default',
              color: c.to ? 'var(--text-muted)' : 'var(--gold)',
            }}>{c.label}</button>
        </span>
      ))}
    </div>
  )
}

// ── Decade view ──────────────────────────────────────────────────────────────

export function TimelineDecadeView({ bands, eras, showEras, campaignYear, onPickYear }: {
  bands: DecadeBand[]; eras: Era[]; showEras: boolean; campaignYear: number
  onPickYear: (year: number) => void
}) {
  if (!bands.length) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      Nothing is dated yet — place a session or add an event to start the record.
    </div>
  )

  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '14px 32px 40px' }}>
      {bands.map(b => {
        if (b.kind === 'gap') {
          const era = showEras ? eraWithin(eras, b.from, b.to) : undefined
          const n = (b.to - b.from) / 10
          return (
            <div key={`gap-${b.from}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 96, flexShrink: 0, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
                {b.from}–{b.to}
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                nothing recorded · {n} {n === 1 ? 'decade' : 'decades'}
              </span>
              {era && <EraTag era={era} />}
            </div>
          )
        }

        const { row } = b
        const era = showEras ? eraForYear(eras, row.start + 5) : undefined
        return (
          <div key={row.start} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 96, flexShrink: 0, paddingTop: 6 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>
                {row.start}–{row.start + 10}
              </div>
              {era && <div style={{ marginTop: 4 }}><EraTag era={era} /></div>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {row.years.map((yb, i) => {
                const isStart = yb.year === campaignYear
                // A break in the run of shown years gets a hairline, so a decade
                // still reads as a decade rather than as consecutive years.
                const gapBefore = i > 0 && yb.year - row.years[i - 1].year > 1
                return (
                  <div key={yb.year} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {gapBefore && <span style={{ width: 10, borderTop: '1px dashed var(--border-light)', flexShrink: 0 }} />}
                    <button onClick={() => onPickYear(yb.year)} className="hover-gold-border"
                      title={isStart ? 'Campaign start year' : undefined}
                      style={{
                        width: 94, height: 54, borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                        border: `1px solid ${isStart ? 'var(--gold)' : 'var(--border-light)'}`,
                        background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column',
                        alignItems: 'flex-start', justifyContent: 'center', gap: 4, padding: '0 10px',
                        fontFamily: 'var(--font-ui)', transition: 'all 120ms',
                      }}>
                      <span style={{ fontSize: 14, color: isStart ? 'var(--gold)' : 'var(--text-primary)' }}>{yb.year}</span>
                      <CountPills items={yb.items} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Year view ────────────────────────────────────────────────────────────────

export function TimelineYearView({
  year, buckets, cal, eras, showEras, lifespans, showLifespans, onPickSpan, onStepYear,
}: {
  year: number; buckets: SpanBucket[]; cal: CampaignCalendar
  eras: Era[]; showEras: boolean
  lifespans: LifespanBand[]; showLifespans: boolean
  onPickSpan: (span: number) => void; onStepYear: (delta: number) => void
}) {
  const era = showEras ? eraForYear(eras, year) : undefined
  const [yearFrom] = spanBounds(year, 0, cal)
  const [, yearTo] = spanBounds(year, cal.spans.length - 1, cal)
  const ongoing = showLifespans ? lifespansOverlapping(lifespans, yearFrom, yearTo) : []
  const cols = Math.min(cal.spans.length, 4)

  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '16px 32px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--gold)', margin: 0, fontWeight: 500 }}>{year}</h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {yearLength(cal)} days · {cal.spans.length} {cal.unitName.toLowerCase()}{cal.spans.length === 1 ? '' : 's'}
        </span>
        {era && <EraTag era={era} />}
      </div>

      <LifespanStrip spans={ongoing} label="ONGOING" />

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 12 }}>
        {buckets.map(b => {
          const empty = b.items.length === 0
          return (
            <button key={b.span} onClick={() => onPickSpan(b.span)}
              className={empty ? undefined : 'hover-gold-border'}
              style={{
                textAlign: 'left', borderRadius: 'var(--radius)', cursor: 'pointer',
                border: `1px solid ${empty ? 'var(--border)' : 'var(--border-light)'}`,
                background: empty ? 'transparent' : 'var(--bg-surface)',
                opacity: empty ? 0.5 : 1, padding: 12, minHeight: 140,
                display: 'flex', flexDirection: 'column', gap: 8, transition: 'all 120ms',
              }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: empty ? 'var(--text-muted)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {spanLabel(cal, b.span)}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{cal.spans[b.span].days}d</span>
              </div>
              <CountPills items={b.items} size={11} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 2, minWidth: 0 }}>
                {b.items.slice(0, 4).map((it, i) => (
                  <div key={`${it.kind}-${it.id}-${i}`} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 11, color: 'var(--text-secondary)', minWidth: 0 }}>
                    <span style={{ color: it.color || KIND_COLOR[it.kind], fontSize: 8, flexShrink: 0 }}>{KIND_GLYPH[it.kind]}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemLabel(it)}</span>
                  </div>
                ))}
                {b.items.length > 4 && <span style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 14 }}>+{b.items.length - 4} more</span>}
                {empty && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>nothing recorded</span>}
              </div>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <StepBtn dir={-1} label={String(year - 1)} onClick={() => onStepYear(-1)} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>step through years without leaving this view</span>
        <StepBtn dir={1} label={String(year + 1)} onClick={() => onStepYear(1)} />
      </div>
    </div>
  )
}

// ── Division view ────────────────────────────────────────────────────────────

export type SpanOrientation = 'vertical' | 'horizontal'

export function TimelineSpanView({
  year, span, items, cal, lifespans, showLifespans,
  orient, onOrientChange, onStepSpan, onOpenItem, onItemMenu, onAddAt,
}: {
  year: number; span: number; items: ClusterItem[]; cal: CampaignCalendar
  lifespans: LifespanBand[]; showLifespans: boolean
  orient: SpanOrientation; onOrientChange: (o: SpanOrientation) => void
  onStepSpan: (delta: number) => void
  onOpenItem: (it: ClusterItem) => void
  onItemMenu?: (it: ClusterItem, e: React.MouseEvent) => void
  onAddAt: (day: number) => void
}) {
  const days = cal.spans[span].days
  const [from, to] = spanBounds(year, span, cal)
  const list = items.filter(i => i.day >= from && i.day <= to).sort((a, b) => a.day - b.day)
  const ongoing = showLifespans ? lifespansOverlapping(lifespans, from, to) : []

  const prevLabel = span === 0 ? `${spanLabel(cal, cal.spans.length - 1)} ${year - 1}` : spanLabel(cal, span - 1)
  const nextLabel = span === cal.spans.length - 1 ? `${spanLabel(cal, 0)} ${year + 1}` : spanLabel(cal, span + 1)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 32px 10px', flexWrap: 'wrap', flexShrink: 0 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--gold)', margin: 0, fontWeight: 500 }}>
          {spanLabel(cal, span)} {year}
        </h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {days} days · {list.length} {list.length === 1 ? 'entry' : 'entries'}
        </span>
        <button onClick={() => onAddAt(from)} className="hover-gold-border" style={{
          display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-elevated)',
          border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)',
          padding: '3px 9px', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer',
          fontFamily: 'var(--font-ui)',
        }}><Plus size={11} /> Add here</button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 2, borderRight: '1px solid var(--border)', paddingRight: 8, marginRight: 2 }}>
            {(['vertical', 'horizontal'] as const).map(o => (
              <button key={o} onClick={() => onOrientChange(o)}
                title={o === 'vertical' ? 'Rail down the page — stays readable in a narrow pane' : 'Day axis across the page — wants the full width'}
                style={{
                  padding: '3px 9px', fontSize: 11, borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  border: `1px solid ${orient === o ? 'var(--border-gold)' : 'var(--border)'}`,
                  background: orient === o ? 'var(--bg-hover)' : 'transparent',
                  color: orient === o ? 'var(--gold)' : 'var(--text-muted)', fontFamily: 'var(--font-ui)',
                }}>{o === 'vertical' ? 'Vertical' : 'Horizontal'}</button>
            ))}
          </div>
          <StepBtn dir={-1} label={prevLabel} onClick={() => onStepSpan(-1)} />
          <StepBtn dir={1} label={nextLabel} onClick={() => onStepSpan(1)} />
        </div>
      </div>

      {ongoing.length > 0 && (
        <div style={{ padding: '0 32px', flexShrink: 0 }}>
          <LifespanStrip spans={ongoing} label="ONGOING" />
        </div>
      )}

      {orient === 'vertical'
        ? <SpanRail year={year} span={span} items={items} cal={cal} onOpenItem={onOpenItem} onItemMenu={onItemMenu} />
        : <SpanAxis list={list} days={days} from={from} cal={cal} onOpenItem={onOpenItem} onItemMenu={onItemMenu} />}
    </div>
  )
}

// Vertical rail: the long dimension is the one a split pane has to spare, so
// this orientation never needs horizontal scroll however narrow it gets.
function SpanRail({ year, span, items, cal, onOpenItem, onItemMenu }: {
  year: number; span: number; items: ClusterItem[]; cal: CampaignCalendar
  onOpenItem: (it: ClusterItem) => void
  onItemMenu?: (it: ClusterItem, e: React.MouseEvent) => void
}) {
  const { groups, quiet, height } = layoutSpanRail(items, year, span, cal)

  return (
    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 32px 40px', minHeight: 0 }}>
      <div style={{ position: 'relative', height, minWidth: 240 }}>
        <svg width={RAIL_X + 26} height={height} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
          <line x1={RAIL_X} y1={8} x2={RAIL_X} y2={height - 8} stroke="var(--border-light)" strokeWidth={1} />
          {quiet.map(q => (
            <g key={q.y}>
              <rect x={RAIL_X - 3} y={q.y + 4} width={6} height={QUIET_RUN_H - 8} fill="var(--bg-base)" />
              <line x1={RAIL_X} y1={q.y + 6} x2={RAIL_X} y2={q.y + QUIET_RUN_H - 6}
                stroke="var(--border)" strokeWidth={1} strokeDasharray="2 4" />
            </g>
          ))}
          {groups.map(g => (
            <g key={g.dayOfSpan}>
              <circle cx={RAIL_X} cy={g.y + 14} r={3.5} fill={g.items[0].color || KIND_COLOR[g.items[0].kind]} />
              <line x1={RAIL_X + 4} y1={g.y + 14} x2={RAIL_X + 22} y2={g.y + 14}
                stroke={g.items[0].color || KIND_COLOR[g.items[0].kind]} strokeWidth={1} opacity={0.4} />
            </g>
          ))}
        </svg>

        {quiet.map(q => (
          <div key={q.y} style={{
            position: 'absolute', left: RAIL_X + 22, top: q.y + QUIET_RUN_H / 2 - 8,
            fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', fontFamily: 'var(--font-ui)',
          }}>{q.days} quiet days</div>
        ))}

        {groups.map(g => (
          <div key={g.dayOfSpan} style={{
            position: 'absolute', left: RAIL_X + 22, top: g.y,
            width: `calc(100% - ${RAIL_X + 22}px)`, maxWidth: CARD_MAX_W,
            border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-elevated)', padding: '6px 8px',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
              {formatCalendarDay(g.day, cal)}
            </div>
            {g.items.map((it, i) => {
              const sub = itemSub(it, cal)
              return (
                <button key={`${it.kind}-${it.id}-${i}`} onClick={() => onOpenItem(it)} onContextMenu={e => onItemMenu?.(it, e)} className="hover-bg"
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: 7, textAlign: 'left', width: '100%',
                    background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
                    padding: '2px 3px', cursor: 'pointer', fontFamily: 'var(--font-ui)',
                  }}>
                  <span style={{ color: it.color || KIND_COLOR[it.kind], fontSize: 9, flexShrink: 0 }}>{KIND_GLYPH[it.kind]}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {itemLabel(it)}
                    </span>
                    {sub && <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)' }}>{sub}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        ))}

        {!groups.length && (
          <div style={{ position: 'absolute', left: RAIL_X + 22, top: 8, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            nothing recorded this {cal.unitName.toLowerCase()}
          </div>
        )}
      </div>
    </div>
  )
}

// Horizontal axis: the familiar reading, kept for full-width use. Scrolls
// sideways by construction — a long division will not fit a narrow pane.
function SpanAxis({ list, days, from, cal, onOpenItem, onItemMenu }: {
  list: ClusterItem[]; days: number; from: number; cal: CampaignCalendar
  onOpenItem: (it: ClusterItem) => void
  onItemMenu?: (it: ClusterItem, e: React.MouseEvent) => void
}) {
  const lanes: ClusterItem[][] = []
  for (const it of list) {
    const lane = lanes.find(l => l.every(o => Math.abs(o.day - it.day) * DAY_PX > 150))
    if (lane) lane.push(it); else lanes.push([it])
  }
  const width = days * DAY_PX + 120
  const baseY = lanes.length * ROW_H + 40

  return (
    <>
      <div style={{ overflowX: 'auto', overflowY: 'hidden', flexShrink: 0, background: 'var(--bg-base)' }}>
        <svg width={width} height={baseY + 50} style={{ display: 'block' }}>
          {lanes.map((lane, li) =>
            lane.map((it, i) => {
              const dos = it.day - from + 1
              const x = 60 + (dos - 1) * DAY_PX
              const y = 20 + li * ROW_H
              const color = it.color || KIND_COLOR[it.kind]
              const label = itemLabel(it)
              return (
                <g key={`${it.kind}-${it.id}-${i}`} style={{ cursor: 'pointer' }} onClick={() => onOpenItem(it)} onContextMenu={e => onItemMenu?.(it, e)}>
                  <line x1={x} y1={y + 8} x2={x} y2={baseY} stroke={color} strokeWidth={1} opacity={0.35} />
                  <circle cx={x} cy={baseY} r={3.5} fill={color} />
                  <rect x={x + 6} y={y - 3} width={Math.min(label.length * 6.4 + 14, 170)} height={18} rx={4}
                    fill="var(--bg-elevated)" stroke={`${color}66`} />
                  <text x={x + 13} y={y + 10} fill="var(--text-secondary)" fontSize={11} fontFamily="var(--font-ui)">
                    {label.length > 24 ? label.slice(0, 23) + '…' : label}
                  </text>
                </g>
              )
            })
          )}
          <line x1={40} y1={baseY} x2={width - 40} y2={baseY} stroke="var(--border-light)" strokeWidth={1} />
          {Array.from({ length: days }, (_, i) => i + 1).map(dn => (
            <g key={dn}>
              <line x1={60 + (dn - 1) * DAY_PX} y1={baseY} x2={60 + (dn - 1) * DAY_PX} y2={baseY + (dn % 10 === 0 ? 8 : 4)}
                stroke="var(--border)" strokeWidth={1} />
              {(dn % 5 === 0 || dn === 1) && (
                <text x={60 + (dn - 1) * DAY_PX} y={baseY + 24} textAnchor="middle"
                  fill="var(--text-muted)" fontSize={10} fontFamily="var(--font-ui)">{dn}</text>
              )}
            </g>
          ))}
        </svg>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 32px 32px', borderTop: '1px solid var(--border)', minHeight: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.07em' }}>IN ORDER</div>
        {!list.length && <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>nothing recorded this {cal.unitName.toLowerCase()}</div>}
        {list.map((it, i) => (
          <button key={`${it.kind}-${it.id}-${i}`} onClick={() => onOpenItem(it)} onContextMenu={e => onItemMenu?.(it, e)} className="hover-bg" style={{
            display: 'flex', alignItems: 'baseline', gap: 7, width: '100%', textAlign: 'left',
            background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
            padding: '3px 6px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12,
            fontFamily: 'var(--font-ui)',
          }}>
            <span style={{ color: it.color || KIND_COLOR[it.kind], fontSize: 9, flexShrink: 0 }}>{KIND_GLYPH[it.kind]}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemLabel(it)}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{formatCalendarDay(it.day, cal)}</span>
          </button>
        ))}
      </div>
    </>
  )
}
