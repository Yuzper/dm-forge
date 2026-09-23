// path: shared/kinship.ts
// Family-tree kin terms, shared by the renderer (web canvas side panel) and
// the main process (an article's derived Connections). The person's Gender
// track decides when it's Male or Female; otherwise a parent falls back to
// their union role ("husband of" → father), and children/siblings to the
// neutral term.

export type Gender = 'm' | 'f' | null

export function genderOf(tracks: string | null | undefined): Gender {
  let g = ''
  try { g = String(JSON.parse(tracks || '{}').Gender || '').trim().toLowerCase() } catch {}
  return g === 'male' ? 'm' : g === 'female' ? 'f' : null
}

export function parentRole(gender: Gender, unionLabel: string | null | undefined): string {
  if (gender) return gender === 'm' ? 'father' : 'mother'
  const l = (unionLabel || '').toLowerCase()
  if (l.includes('husband') || l.includes('father')) return 'father'
  if (l.includes('wife') || l.includes('mother')) return 'mother'
  return 'parent'
}

// A person's role label on their person → union edge. Stored on the edge (the
// DM can override it, e.g. "partner of" for an unmarried couple); Gender only
// supplies the default when the edge is drawn.
export const UNION_ROLES = ['husband of', 'wife of', 'partner of']
export const unionRoleFor = (gender: Gender): string | null =>
  gender === 'm' ? 'husband of' : gender === 'f' ? 'wife of' : null

export const childRole  = (gender: Gender) => gender === 'm' ? 'son' : gender === 'f' ? 'daughter' : 'child'
export const siblingRole = (gender: Gender) => gender === 'm' ? 'brother' : gender === 'f' ? 'sister' : 'sibling'
