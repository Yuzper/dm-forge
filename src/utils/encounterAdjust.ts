// path: src/utils/encounterAdjust.ts
// Turns tactical flags into a *bounded, transparent* adjustment of the encounter's
// effective XP, producing a "plays like" tier alongside the raw XP baseline.
//
// Philosophy: the raw tier stays the anchor. This is an explicit heuristic, not a
// simulation — every contributor is a small signed % shown to the DM, and the net
// is clamped so flags nudge difficulty by ~one tier at most, never a wild swing.

import type { StatBlock } from '../types'
import { classifyAgainstTiers, type EncounterEval } from './encounterBudget'

export interface Adjustment { label: string; delta: number }   // delta as a fraction (0.12 = +12%)

export interface AdjustResult {
  contributors: Adjustment[]
  net: number            // clamped fraction actually applied
  rawNet: number         // pre-clamp sum (so we can flag when it was capped)
  effectiveXp: number
  adjustedClass: string
}

const HEALER_CLASSES    = ['Cleric', 'Druid', 'Bard', 'Paladin', 'Artificer']
const FRONTLINE_CLASSES = ['Barbarian', 'Fighter', 'Paladin', 'Monk']
const ARCANE_CLASSES    = ['Wizard', 'Sorcerer', 'Warlock', 'Bard', 'Artificer']

const MIN_NET = -0.25
const MAX_NET = 0.50

export function adjustEncounter(
  evalResult: EncounterEval,
  monsterSbs: StatBlock[],
  partyClasses: string[],
  partySize: number,
): AdjustResult {
  const c: Adjustment[] = []

  const hasLegendaryActions = monsterSbs.some(sb => (sb.legendaryActions?.length ?? 0) > 0)
  const hasLegendaryResistance = monsterSbs.some(sb =>
    (sb.traits ?? []).some(t => /legendary resistance/i.test(t.name) || /legendary resistance/i.test(t.desc)))
  const hasCasters = monsterSbs.some(sb => (sb.cantrips?.length ?? 0) + (sb.preparedSpells?.length ?? 0) > 0)

  // Monster-side (usually tougher than raw XP implies)
  if (hasLegendaryActions)    c.push({ label: 'Legendary actions (extra turns)', delta: 0.12 })
  if (hasLegendaryResistance) c.push({ label: 'Legendary resistance (control unreliable)', delta: 0.12 })

  // Action economy: a lone creature is easier than its XP suggests (the size
  // multiplier only ever makes groups harder, never makes a solo easier).
  if (evalResult.monsterCount === 1 && partySize >= 3) {
    c.push({ label: 'Solo monster (action economy favours party)', delta: -0.15 })
  }

  // Party-composition gaps
  if (partyClasses.length > 0) {
    const has = (set: string[]) => partyClasses.some(x => set.includes(x))
    if (!has(HEALER_CLASSES))    c.push({ label: 'No healer in party', delta: 0.08 })
    if (!has(FRONTLINE_CLASSES)) c.push({ label: 'No frontline', delta: 0.05 })
    if (!has(ARCANE_CLASSES) && (hasCasters || hasLegendaryActions)) {
      c.push({ label: 'No counterspell vs enemy casters', delta: 0.06 })
    }
  }

  const rawNet = c.reduce((s, a) => s + a.delta, 0)
  const net = Math.max(MIN_NET, Math.min(MAX_NET, rawNet))
  const effectiveXp = Math.round(evalResult.monsterXpAdjusted * (1 + net))
  const adjustedClass = classifyAgainstTiers(effectiveXp, evalResult.tiers)

  return { contributors: c, net, rawNet, effectiveXp, adjustedClass }
}
