// path: src/utils/encounterBudget.ts
// 5e encounter-budget math. This is the *baseline* difficulty classifier:
// an absolute XP anchor that everything else (tactical flags) annotates.
// Supports both the 2014 DMG (XP thresholds + encounter-size multiplier) and
// the 2024 DMG (flat XP budget per character, no multiplier).

// ── CR → XP ──────────────────────────────────────────────────────────────────
// Shared by both rulesets. Keys match the `cr` strings stored on creature variants.
export const CR_XP: Record<string, number> = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100,
  '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800,
  '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900,
  '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000,
  '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
  '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000,
  '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
}

// Valid CRs in display order (Object.keys would reorder the integer-like keys).
export const CR_OPTIONS = [
  '0', '1/8', '1/4', '1/2',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
]

/** Returns the XP for a CR string, or null when the CR is missing/unrecognised. */
export function crToXp(cr: string | null | undefined): number | null {
  if (cr == null) return null
  const key = String(cr).trim()
  return key in CR_XP ? CR_XP[key] : null
}

// ── 2014: per-character XP thresholds [easy, medium, hard, deadly] by level ────
const XP_THRESHOLDS_2014: Record<number, [number, number, number, number]> = {
  1: [25, 50, 75, 100], 2: [50, 100, 150, 200], 3: [75, 150, 225, 400], 4: [125, 250, 375, 500],
  5: [250, 500, 750, 1100], 6: [300, 600, 900, 1400], 7: [350, 750, 1100, 1700], 8: [450, 900, 1400, 2100],
  9: [550, 1100, 1600, 2400], 10: [600, 1200, 1900, 2800], 11: [800, 1600, 2400, 3600], 12: [1000, 2000, 3000, 4500],
  13: [1100, 2200, 3400, 5100], 14: [1250, 2500, 3800, 5700], 15: [1400, 2800, 4300, 6400], 16: [1600, 3200, 4800, 7200],
  17: [2000, 3900, 5900, 8800], 18: [2100, 4200, 6300, 9500], 19: [2400, 4900, 7300, 10900], 20: [2800, 5700, 8500, 12700],
}

// ── 2024: per-character XP budget [low, moderate, high] by level ───────────────
const XP_BUDGET_2024: Record<number, [number, number, number]> = {
  1: [50, 75, 100], 2: [100, 150, 200], 3: [150, 225, 400], 4: [250, 375, 500],
  5: [500, 750, 1100], 6: [600, 1000, 1400], 7: [750, 1300, 1700], 8: [1000, 1700, 2100],
  9: [1300, 2000, 2600], 10: [1600, 2300, 3100], 11: [1900, 2900, 4100], 12: [2200, 3700, 4700],
  13: [2600, 4200, 5400], 14: [2900, 4900, 6200], 15: [3300, 5400, 7800], 16: [3800, 6100, 9800],
  17: [4500, 7200, 11700], 18: [5000, 8700, 14200], 19: [5500, 10700, 17200], 20: [6400, 13200, 22000],
}

// ── 2014 encounter-size multiplier ────────────────────────────────────────────
// Steps the DMG walks through; party size shifts the index (this *is* the
// action-economy adjustment baked into the XP — don't double-count it elsewhere).
const MULT_STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5]

function multiplierIndex(monsterCount: number): number {
  if (monsterCount <= 1) return 1       // ×1
  if (monsterCount === 2) return 2      // ×1.5
  if (monsterCount <= 6) return 3       // ×2
  if (monsterCount <= 10) return 4      // ×2.5
  if (monsterCount <= 14) return 5      // ×3
  return 6                              // ×4
}

function encounterMultiplier2014(monsterCount: number, partySize: number): number {
  let idx = multiplierIndex(monsterCount)
  if (partySize > 0 && partySize < 3) idx += 1   // small party → harder
  if (partySize >= 6) idx -= 1                    // large party → easier
  idx = Math.max(0, Math.min(MULT_STEPS.length - 1, idx))
  return MULT_STEPS[idx]
}

function clampLevel(level: number): number {
  return Math.max(1, Math.min(20, Math.round(level)))
}

// ── Public API ────────────────────────────────────────────────────────────────
export type Ruleset = '2014' | '2024'

export function rulesetFor(system: string | undefined): Ruleset {
  return system === 'D&D 5e 2024' ? '2024' : '2014'
}

export interface BudgetTier {
  label: string   // 'Easy' | 'Medium' | … | 'Low' | 'Moderate' | 'High'
  value: number   // party-summed XP threshold/budget for this tier
}

export interface EncounterEval {
  ruleset: Ruleset
  monsterCount: number
  partySize: number
  /** Raw sum of CR→XP across accounted monsters. */
  monsterXpRaw: number
  /** What we compare to thresholds: raw × multiplier (2014) or raw (2024). */
  monsterXpAdjusted: number
  multiplier: number       // always 1 for 2024
  tiers: BudgetTier[]      // ascending
  classification: string   // 'Trivial' | <tier label> | 'Deadly'/'Beyond High'
}

/**
 * Classify an encounter.
 * @param system      campaign.system string
 * @param partyLevels one entry per PC in the fight (mixed levels supported)
 * @param monsterXps  CR→XP for each *accounted* monster (exclude unknown-CR)
 * @param monsterCount total monster count incl. unaccounted (drives multiplier)
 * @param allyCount   NPC allies fighting for the party — extra party-side bodies
 *                    (affects the 2014 size multiplier, but add no XP thresholds)
 */
export function evaluateEncounter(
  system: string | undefined,
  partyLevels: number[],
  monsterXps: number[],
  monsterCount: number,
  allyCount = 0,
): EncounterEval {
  const ruleset = rulesetFor(system)
  const partySize = partyLevels.length + allyCount
  const monsterXpRaw = monsterXps.reduce((a, b) => a + b, 0)

  if (ruleset === '2024') {
    const sums: [number, number, number] = [0, 0, 0]
    for (const lvl of partyLevels) {
      const [lo, mo, hi] = XP_BUDGET_2024[clampLevel(lvl)]
      sums[0] += lo; sums[1] += mo; sums[2] += hi
    }
    const tiers: BudgetTier[] = [
      { label: 'Low', value: sums[0] },
      { label: 'Moderate', value: sums[1] },
      { label: 'High', value: sums[2] },
    ]
    let classification = 'Trivial'
    if (partyLevels.length === 0) classification = '—'
    else if (monsterXpRaw >= sums[2]) classification = 'High'
    else if (monsterXpRaw >= sums[1]) classification = 'Moderate'
    else if (monsterXpRaw >= sums[0]) classification = 'Low'
    return { ruleset, monsterCount, partySize, monsterXpRaw, monsterXpAdjusted: monsterXpRaw, multiplier: 1, tiers, classification }
  }

  // 2014
  const sums: [number, number, number, number] = [0, 0, 0, 0]
  for (const lvl of partyLevels) {
    const t = XP_THRESHOLDS_2014[clampLevel(lvl)]
    sums[0] += t[0]; sums[1] += t[1]; sums[2] += t[2]; sums[3] += t[3]
  }
  const multiplier = encounterMultiplier2014(monsterCount, partySize)
  const monsterXpAdjusted = Math.round(monsterXpRaw * multiplier)
  const tiers: BudgetTier[] = [
    { label: 'Easy', value: sums[0] },
    { label: 'Medium', value: sums[1] },
    { label: 'Hard', value: sums[2] },
    { label: 'Deadly', value: sums[3] },
  ]
  let classification = 'Trivial'
  if (partyLevels.length === 0) classification = '—'
  else if (monsterXpAdjusted >= sums[3]) classification = 'Deadly'
  else if (monsterXpAdjusted >= sums[2]) classification = 'Hard'
  else if (monsterXpAdjusted >= sums[1]) classification = 'Medium'
  else if (monsterXpAdjusted >= sums[0]) classification = 'Easy'
  return { ruleset, monsterCount, partySize, monsterXpRaw, monsterXpAdjusted, multiplier, tiers, classification }
}

// Classify an arbitrary XP value against a party's ascending tiers.
export function classifyAgainstTiers(xp: number, tiers: BudgetTier[]): string {
  let label = 'Trivial'
  for (const t of tiers) if (xp >= t.value) label = t.label
  return label
}

// Colour for a classification badge.
export function classificationColor(c: string): string {
  switch (c) {
    case 'Deadly':
    case 'High':     return '#e05555'
    case 'Hard':
    case 'Moderate': return '#e0a955'
    case 'Medium':   return '#e0d055'
    case 'Easy':
    case 'Low':      return '#7bc96f'
    case 'Trivial':  return '#6a9bd8'
    default:         return '#8a8a8a'
  }
}
