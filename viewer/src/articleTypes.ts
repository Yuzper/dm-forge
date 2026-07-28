// Article-type colours — mirror of src/constants/articleTypes.ts (ARTICLE_TYPE_COLORS)
// so the viewer matches the DM app's wiki / timeline / hub. Keep in sync if it changes.
export const ARTICLE_TYPE_COLORS: Record<string, string> = {
  character: '#5bbfb0', playerCharacter: '#49c185', creature: '#36a502',
  location: '#c8a84b', faction: '#e88c3a',
  culture: '#4da6ff', religion: '#b07de8', item: '#9b7de8',
  note: '#736598', quest: '#5b9fe8',
  event: '#e05555', lore: '#db55e0', other: '#8a8a8a',
}

export const colorForType = (t: string) => ARTICLE_TYPE_COLORS[t] ?? ARTICLE_TYPE_COLORS.other

// "playerCharacter" → "Player Character", "location" → "Location".
export const labelForType = (t: string) =>
  t.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())
