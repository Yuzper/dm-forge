// path: src/utils/encounterFlags.ts
// Tactical *annotations* on top of the XP baseline — never adjustments to it.
// These flag reasons the real fight may deviate from its XP classification.
// Everything here is derived from already-structured StatBlock fields; we do
// NOT parse prose (no DPR), per the deliberate "flag, don't predict" scope.

import type { StatBlock } from '../types'

export interface EncounterFlag {
  level: 'warn' | 'info'
  text: string
}

/** Per-creature flags from its stat block. `name` labels the source. */
export function creatureFlags(sb: StatBlock, name: string): EncounterFlag[] {
  const flags: EncounterFlag[] = []

  if ((sb.legendaryActions?.length ?? 0) > 0) {
    flags.push({ level: 'warn', text: `${name}: legendary actions — extra turns between PCs.` })
  }

  const hasLegendaryResistance = (sb.traits ?? []).some(t =>
    /legendary resistance/i.test(t.name) || /legendary resistance/i.test(t.desc))
  if (hasLegendaryResistance) {
    flags.push({ level: 'warn', text: `${name}: legendary resistance — save-or-suck control is unreliable.` })
  }

  const resists = [sb.damageResistances, sb.damageImmunities].map(s => (s || '').trim()).filter(Boolean)
  if (resists.length) {
    flags.push({ level: 'info', text: `${name}: resist/immune to ${resists.join('; ')} — check party damage types.` })
  }

  return flags
}

// Classes that bring meaningful in-combat healing / a frontline.
const HEALER_CLASSES = ['Cleric', 'Druid', 'Bard', 'Paladin', 'Artificer']
const FRONTLINE_CLASSES = ['Barbarian', 'Fighter', 'Paladin', 'Monk']
const ARCANE_CLASSES = ['Wizard', 'Sorcerer', 'Warlock', 'Bard', 'Artificer']

/** Party-composition flags from the selected PCs' classes. */
export function partyClassFlags(classes: string[]): EncounterFlag[] {
  const flags: EncounterFlag[] = []
  if (classes.length === 0) return flags
  const has = (set: string[]) => classes.some(c => set.includes(c))

  if (!has(HEALER_CLASSES)) {
    flags.push({ level: 'info', text: 'No dedicated healer in the party — sustained fights are riskier.' })
  }
  if (!has(FRONTLINE_CLASSES)) {
    flags.push({ level: 'info', text: 'No frontline class — squishier party; enemies can reach the back line.' })
  }
  if (!has(ARCANE_CLASSES)) {
    flags.push({ level: 'info', text: 'No arcane caster — no Counterspell/Dispel; enemy spellcasters are more dangerous.' })
  }
  return flags
}

/** Encounter-wide flags from the assembled monsters + party size. */
export function encounterFlags(monsterCount: number, partySize: number, classification: string): EncounterFlag[] {
  const flags: EncounterFlag[] = []

  // Solo monster: action economy favours the party even when XP says scary.
  if (monsterCount === 1 && (classification === 'Hard' || classification === 'Deadly' || classification === 'High')) {
    flags.push({ level: 'warn', text: 'Solo monster: one creature vs the party — action economy favours the PCs despite the XP tier. Consider lair/legendary actions or minions.' })
  }

  // Swarm of bodies: many more enemy turns than the party has.
  if (partySize > 0 && monsterCount >= partySize * 3) {
    flags.push({ level: 'warn', text: `Action economy: ${monsterCount} enemies vs ${partySize} PCs — far more enemy turns per round than the XP tier implies.` })
  }

  return flags
}
