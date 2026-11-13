// path: src/utils/castDefaults.ts
// How a map is put on the table when the DM presses Cast. Deliberately absent:
// a "show points & regions to players" default. That switch starts off on every
// cast on purpose, so a forgotten setting can never reveal a secret.
import { createPref } from './prefs'

export type GridOnCast = 'remember' | 'on' | 'off'
export type TableDisplay = 'secondary' | 'primary'

export interface CastDefaults {
  /** Start with fog of war on (only meaningful for a map that has walls). */
  fogOnCast: boolean
  /** 'remember' keeps whatever the grid was last set to. */
  gridOnCast: GridOnCast
  /** Which screen the table opens on: a second display if there is one, or the main one, windowed. */
  tableDisplay: TableDisplay
}

export const castDefaults = createPref<CastDefaults>('dmforge:cast-defaults', raw => ({
  fogOnCast: raw.fogOnCast !== false,
  gridOnCast: raw.gridOnCast === 'on' || raw.gridOnCast === 'off' ? raw.gridOnCast : 'remember',
  tableDisplay: raw.tableDisplay === 'primary' ? 'primary' : 'secondary',
}))
