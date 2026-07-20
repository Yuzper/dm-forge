// path: src/constants/loot.ts
// Shared item-value colours so hover cards, wiki track chips and loot views
// all agree on what a rarity or drop chance looks like.

// Rarity → accent colour, matching the 5e value ladder (uncommon green,
// rare blue, very rare purple, legendary orange).
export const RARITY_COLORS: Record<string, string> = {
  Common: '#9aa0a6',
  Uncommon: '#49c185',
  Rare: '#4da6ff',
  'Very Rare': '#b07de8',
  Legendary: '#e8a23a',
  Artifact: '#e05555',
}

// Drop chance → colour: guaranteed drops read full green, likely drops a
// softer green, coin-flips gold, long shots red.
export function chanceColor(chance: number): string {
  if (chance >= 100) return '#49c185'
  if (chance >= 60)  return '#6ab87a'
  if (chance >= 30)  return '#c8a84b'
  return '#e05555'
}
