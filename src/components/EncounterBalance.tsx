// path: src/components/EncounterBalance.tsx
// "Balance" tab of the combat panel. Reads the encounter's current monster
// combatants + a DM-chosen set of player characters and shows the XP-baseline
// difficulty classification plus tactical flags. Classifies; never predicts.
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import type { Campaign, CombatCreature, StatBlock } from '../types'
import { parseStatBlock } from '../types'
import { parseCreatureVariants } from '../utils/creatureVariants'
import {
  crToXp, evaluateEncounter, classificationColor, type EncounterEval,
} from '../utils/encounterBudget'
import { adjustEncounter } from '../utils/encounterAdjust'
import { creatureFlags, encounterFlags, partyClassFlags, type EncounterFlag } from '../utils/encounterFlags'
import { InfoHint } from './InfoHint'

// Explains how the difficulty tier is derived — shown on the (i) next to the
// "Difficulty" heading. Ruleset-specific because 2024 drops the multiplier.
function classifyInfo(ruleset: string): string {
  const common = [
    '',
    'Allies count as extra bodies but add no XP budget of their own. Monsters with no CR aren’t counted, so a tier shown with “≥” is a floor — the real fight is harder.',
    '',
    '“Plays like” is a separate, bounded nudge from the tactical flags — never the baseline tier.',
    '',
    'This classifies the fight; it never predicts the outcome. Dice introduce real swing, so a fight may run easier or harder than the tier suggests.',
  ]
  if (ruleset === '2024') {
    return [
      'How the tier is set (D&D 2024):',
      '',
      '1. Add up each monster’s XP (from its CR).',
      '2. Sum your party’s budget — each PC’s Low / Moderate / High XP budget for its level.',
      '3. The tier is the highest budget the monster XP reaches. (2024 uses no encounter multiplier.)',
      ...common,
    ].join('\n')
  }
  return [
    'How the tier is set (D&D 2014):',
    '',
    '1. Add up each monster’s XP (from its CR).',
    '2. Multiply by the encounter multiplier — more monsters relative to party size inflates the effective XP.',
    '3. Sum your party’s thresholds — each PC’s Easy / Medium / Hard / Deadly value for its level.',
    '4. The tier is the highest threshold the adjusted XP reaches.',
    ...common,
  ].join('\n')
}

interface PartyMember {
  id: number
  name: string
  level: number | null   // null = not set on the PC article
  ac: number
  hp: number
  classes: string[]      // class names from the multiclass picker
}

interface MonsterInfo {
  key: string
  id: number             // combat-creature id
  name: string
  cr: string
  xp: number | null      // null = unaccounted (no usable CR)
  sb: StatBlock
  kind: 'creature' | 'character'
}

// Compact difficulty readout reported up to the combat panel so the encounter
// view can show a live summary strip without duplicating the eval logic.
export interface EncounterSummary {
  classification: string
  color: string
  xp: number
  monsters: number
  party: number
  incomplete: boolean
  noXp: boolean
}

const partyKey = (encounterId: number) => `dmforge:party:${encounterId}`

function loadIds(key: string): number[] {
  try {
    const raw = localStorage.getItem(key)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((n: any) => typeof n === 'number') : []
  } catch { return [] }
}

export default function EncounterBalance({
  encounterId, creatures, campaign, allyIds, onToggleAlly, onSummary,
}: {
  encounterId: number
  creatures: CombatCreature[]
  campaign: Campaign
  allyIds: Set<number>                 // lifted to CombatPanel (shared with rows)
  onToggleAlly: (id: number) => void
  onSummary?: (s: EncounterSummary) => void   // live difficulty readout for the strip
}) {
  const [party, setParty] = useState<PartyMember[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set(loadIds(partyKey(encounterId))))
  // article_id → kind + CR source. Creatures carry CR per variant (crByName);
  // named NPCs (characters) carry a single CR on their stat block.
  type ArticleMeta = { kind: 'creature' | 'character' | 'other'; crByName: Map<string, string>; cr: string }
  const [creatureMeta, setCreatureMeta] = useState<Map<number, ArticleMeta>>(new Map())

  // Persist + reload PC selection when the encounter changes (allies are owned by CombatPanel)
  useEffect(() => { setSelectedIds(new Set(loadIds(partyKey(encounterId)))) }, [encounterId])
  useEffect(() => {
    localStorage.setItem(partyKey(encounterId), JSON.stringify([...selectedIds]))
  }, [encounterId, selectedIds])

  // Load player characters for the campaign
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const list = await window.api.getArticlesList({ campaignId: campaign.id, type: 'playerCharacter' })
      const full = await Promise.all(list.map(a => window.api.getArticle(a.id)))
      if (cancelled) return
      const members: PartyMember[] = full.filter(Boolean).map(a => {
        const sb = parseStatBlock(a!.statblock)
        // Total level = sum of per-class levels, falling back to the stored total.
        const classSum = (sb.classLevels ?? []).reduce((s, r) => s + (r.level || 0), 0)
        const total = classSum > 0 ? classSum : (typeof sb.level === 'number' ? sb.level : 0)
        const classes = (sb.classLevels ?? []).map(r => r.cls).filter(Boolean)
        return {
          id: a!.id, name: a!.title,
          level: total > 0 ? total : null,
          ac: sb.ac || 0, hp: sb.hp || 0,
          classes,
        }
      })
      setParty(members.sort((x, y) => x.name.localeCompare(y.name)))
    })()
    return () => { cancelled = true }
  }, [campaign.id])

  // Load source articles for the creature combatants → CR lookup by variant name
  const articleIds = useMemo(
    () => [...new Set(creatures.map(c => c.article_id))],
    [creatures],
  )
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const articles = await Promise.all(articleIds.map(id => window.api.getArticle(id)))
      if (cancelled) return
      const map = new Map<number, ArticleMeta>()
      for (const a of articles) {
        if (!a) continue
        if (a.article_type === 'creature') {
          const crByName = new Map<string, string>()
          for (const v of parseCreatureVariants(a)) crByName.set(v.name, v.cr)
          map.set(a.id, { kind: 'creature', crByName, cr: '' })
        } else if (a.article_type === 'character') {
          map.set(a.id, { kind: 'character', crByName: new Map(), cr: parseStatBlock(a.statblock).cr ?? '' })
        } else {
          // playerCharacter / other — never counted as opposition
          map.set(a.id, { kind: 'other', crByName: new Map(), cr: '' })
        }
      }
      setCreatureMeta(map)
    })()
    return () => { cancelled = true }
  }, [articleIds.join(',')])

  // ── Derive combatants (creature + named-NPC; PCs excluded) ──────────────────
  const combatants: MonsterInfo[] = useMemo(() => {
    const out: MonsterInfo[] = []
    for (const c of creatures) {
      const meta = creatureMeta.get(c.article_id)
      if (!meta || meta.kind === 'other') continue   // exclude PCs added as combatants
      const name = (c as any).display_name ?? (c as any).variant_name ?? c.title
      // Prefer the CR captured at add-time — but only if it's a real CR. Older
      // rows sometimes stored the "—" placeholder (or blank); treat anything that
      // doesn't map to XP as unset and re-derive from the article's current CR.
      const storedCr = (c as any).cr
      const cr = (storedCr != null && crToXp(storedCr) !== null)
        ? storedCr
        : (meta.kind === 'creature' ? (meta.crByName.get(name) ?? '') : meta.cr)
      out.push({
        key: `${c.id}`,
        id: c.id,
        name,
        xp: crToXp(cr),
        cr,
        sb: parseStatBlock((c as any).statblock ?? c.statblock),
        kind: meta.kind,
      })
    }
    return out
  }, [creatures, creatureMeta])

  // Any non-PC combatant (creature or named NPC) can be toggled to fight for the party.
  const allies = combatants.filter(c => allyIds.has(c.id))
  const monsters = combatants.filter(c => !allyIds.has(c.id))

  const unaccounted = monsters.filter(m => m.xp === null)
  const accountedXps = monsters.filter(m => m.xp !== null).map(m => m.xp as number)

  // ── Party derivation ────────────────────────────────────────────────────────
  const selectedParty = party.filter(p => selectedIds.has(p.id))
  const partyLevels = selectedParty.map(p => p.level ?? 1)   // assume 1 if unset
  const effectivePartySize = selectedParty.length + allies.length
  const avgAc = selectedParty.length ? Math.round(selectedParty.reduce((s, p) => s + p.ac, 0) / selectedParty.length) : 0
  const avgHp = selectedParty.length ? Math.round(selectedParty.reduce((s, p) => s + p.hp, 0) / selectedParty.length) : 0

  // ── Evaluate (allies add party-side bodies, but no XP thresholds) ───────────
  const evalResult: EncounterEval = useMemo(
    () => evaluateEncounter(campaign.system, partyLevels, accountedXps, monsters.length, allies.length),
    [campaign.system, partyLevels.join(','), accountedXps.join(','), monsters.length, allies.length],
  )

  // ── Flags ───────────────────────────────────────────────────────────────────
  const flags: EncounterFlag[] = useMemo(() => {
    const seen = new Set<string>()
    const out: EncounterFlag[] = []
    const push = (f: EncounterFlag) => { if (!seen.has(f.text)) { seen.add(f.text); out.push(f) } }
    for (const m of monsters) creatureFlags(m.sb, m.name).forEach(push)
    encounterFlags(monsters.length, effectivePartySize, evalResult.classification).forEach(push)
    partyClassFlags(selectedParty.flatMap(p => p.classes)).forEach(push)
    if (selectedParty.some(p => p.level === null)) {
      push({ level: 'warn', text: 'Some PCs have no level set (assumed level 1). Set their level in the wiki for accurate thresholds.' })
    }
    return out
  }, [monsters, effectivePartySize, selectedParty, evalResult.classification])

  const toggle = (id: number) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  // Bounded, transparent "plays like" adjustment from tactical flags.
  const adjust = useMemo(
    () => adjustEncounter(evalResult, monsters.map(m => m.sb), selectedParty.flatMap(p => p.classes), effectivePartySize),
    [evalResult, monsters, selectedParty, effectivePartySize],
  )

  // When some monsters have no CR the XP total is only a floor; if NONE are
  // counted the classification is meaningless. Don't show a confident tier.
  const incomplete = unaccounted.length > 0
  const noXp = evalResult.monsterXpRaw === 0
  const shownClass = noXp && incomplete ? 'Unknown' : evalResult.classification
  const badgeColor = classificationColor(shownClass)
  // Show the adjusted tier only when we have a real baseline and flags actually moved it.
  const showAdjusted = !noXp && selectedParty.length > 0 && adjust.contributors.length > 0
  const adjustedColor = classificationColor(adjust.adjustedClass)
  const netPct = Math.round(adjust.net * 100)
  const maxTier = evalResult.tiers[evalResult.tiers.length - 1]?.value || 1
  const barMax = Math.max(maxTier, evalResult.monsterXpAdjusted) * 1.05

  // Report a compact readout up so the encounter view can show a live strip.
  useEffect(() => {
    onSummary?.({
      classification: shownClass,
      color: badgeColor,
      xp: evalResult.monsterXpAdjusted,
      monsters: monsters.length,
      party: selectedParty.length,
      incomplete: incomplete && !noXp,
      noXp,
    })
  }, [onSummary, shownClass, badgeColor, evalResult.monsterXpAdjusted, monsters.length, selectedParty.length, incomplete, noXp])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Party ── */}
      <section>
        <div style={sectionLabel}>Party in this fight</div>
        {party.length === 0 ? (
          <div style={emptyNote}>No player-character articles yet. Create some in the wiki (type “Player Character”).</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {party.map(p => {
              const on = selectedIds.has(p.id)
              return (
                <button key={p.id} onClick={() => toggle(p.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '6px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  background: on ? 'var(--gold-glow)' : 'transparent',
                  border: `1px solid ${on ? 'var(--border-gold)' : 'var(--border)'}`,
                  textAlign: 'left', color: 'var(--text-primary)',
                }}>
                  <span style={{
                    width: 15, height: 15, borderRadius: 3, flexShrink: 0,
                    border: `1px solid ${on ? 'var(--gold)' : 'var(--border-light)'}`,
                    background: on ? 'var(--gold)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--bg-base)', fontSize: 11, fontWeight: 700,
                  }}>{on ? '✓' : ''}</span>
                  <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: p.level === null ? 'var(--crimson)' : 'var(--text-muted)' }}>
                    {p.level === null ? 'Lv —' : `Lv ${p.level}`}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {selectedParty.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
            {selectedParty.length} PC{selectedParty.length > 1 ? 's' : ''}
            {allies.length > 0 && ` + ${allies.length} all${allies.length > 1 ? 'ies' : 'y'}`}
            {' '}· avg AC {avgAc} · avg HP {avgHp}
          </div>
        )}

        {/* Allies — combatants the DM marked as fighting for the party */}
        {allies.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 6 }}>
              ALLIES — fighting for the party
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {allies.map(n => (
                <button key={n.id} onClick={() => onToggleAlly(n.id)} title="Click to make hostile" style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '6px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  background: 'rgba(123,201,111,0.12)', border: '1px solid rgba(123,201,111,0.4)',
                  textAlign: 'left', color: 'var(--text-primary)',
                }}>
                  <span style={{
                    width: 15, height: 15, borderRadius: 3, flexShrink: 0, background: '#7bc96f',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--bg-base)', fontSize: 11, fontWeight: 700,
                  }}>✓</span>
                  <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ally</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 5 }}>
              Mark allies via the handshake icon on each combatant in the Combatants tab.
            </div>
          </div>
        )}
      </section>

      {/* ── Difficulty readout ── */}
      <section>
        <div style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 5 }}>
          Difficulty (XP baseline)
          <InfoHint text={classifyInfo(evalResult.ruleset)} size={11} />
        </div>
        {selectedParty.length === 0 ? (
          <div style={emptyNote}>Select the PCs above to set the budget.</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{
                fontSize: 13, fontWeight: 700, padding: '2px 10px', borderRadius: 99,
                color: badgeColor, background: `${badgeColor}1e`, border: `1px solid ${badgeColor}55`,
              }}>{incomplete && !noXp ? `≥ ${shownClass}` : shownClass}</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {evalResult.monsterXpAdjusted.toLocaleString()} XP
                {evalResult.multiplier !== 1 && (
                  <span style={{ color: 'var(--text-muted)' }}> ({evalResult.monsterXpRaw.toLocaleString()} ×{evalResult.multiplier})</span>
                )}
              </span>
            </div>
            {incomplete && (
              <div style={{ fontSize: 11, color: '#e0a955', marginBottom: 8, lineHeight: 1.4 }}>
                {noXp
                  ? `${unaccounted.length} monster${unaccounted.length > 1 ? 's have' : ' has'} no CR — nothing is counted yet. Set CRs below to get a real classification.`
                  : `${unaccounted.length} monster${unaccounted.length > 1 ? 's have' : ' has'} no CR — the true difficulty is higher than shown.`}
              </div>
            )}

            {/* Threshold bar */}
            <div style={{ position: 'relative', height: 8, background: 'var(--bg-base)', borderRadius: 99, border: '1px solid var(--border)' }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 99,
                width: `${Math.min(100, (evalResult.monsterXpAdjusted / barMax) * 100)}%`,
                background: badgeColor, transition: 'width 150ms ease',
              }} />
              {evalResult.tiers.map(t => (
                <div key={t.label} title={`${t.label}: ${t.value.toLocaleString()} XP`} style={{
                  position: 'absolute', top: -2, bottom: -2, width: 1.5,
                  left: `${Math.min(100, (t.value / barMax) * 100)}%`, background: 'var(--text-muted)',
                }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
              {evalResult.tiers.map(t => (
                <span key={t.label}>{t.label} {t.value >= 1000 ? `${(t.value / 1000).toFixed(1)}k` : t.value}</span>
              ))}
            </div>

            {/* Flag-adjusted "plays like" tier */}
            {showAdjusted && (
              <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>PLAYS LIKE</span>
                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: '1px 9px', borderRadius: 99,
                    color: adjustedColor, background: `${adjustedColor}1e`, border: `1px solid ${adjustedColor}55`,
                  }}>{adjust.adjustedClass}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {netPct >= 0 ? '+' : ''}{netPct}% → {adjust.effectiveXp.toLocaleString()} XP
                    {adjust.rawNet !== adjust.net && ' (capped)'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {adjust.contributors.map((a, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
                      <span>{a.label}</span>
                      <span style={{ color: a.delta >= 0 ? '#e0a955' : '#7bc96f', fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>
                        {a.delta >= 0 ? '+' : ''}{Math.round(a.delta * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Unaccounted ── */}
      {unaccounted.length > 0 && (
        <section>
          <div style={sectionLabel}>Unaccounted for ({unaccounted.length})</div>
          <div style={emptyNote}>
            No CR — not counted in the XP total. Set a CR on the creature’s variant in the wiki.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {[...new Set(unaccounted.map(m => m.name))].map(n => (
              <span key={n} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 99, background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{n}</span>
            ))}
          </div>
        </section>
      )}

      {/* ── Tactical flags ── */}
      {flags.length > 0 && (
        <section>
          <div style={sectionLabel}>Tactical flags</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {flags.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 7, fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {f.level === 'warn'
                  ? <AlertTriangle size={13} style={{ color: '#e0a955', flexShrink: 0, marginTop: 1 }} />
                  : <Info size={13} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 1 }} />}
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Disclaimer ── */}
      <div style={{ marginTop: 'auto', paddingTop: 8, fontSize: 10.5, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5, borderTop: '1px solid var(--border)' }}>
        The tier is the raw XP baseline; “plays like” applies bounded heuristic nudges from the flags (capped at ±, never a wild swing). Both are estimates — the dice introduce real randomness, so an encounter may run easier or harder than shown.
      </div>
    </div>
  )
}

const sectionLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
}
const emptyNote: React.CSSProperties = {
  fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.4,
}
