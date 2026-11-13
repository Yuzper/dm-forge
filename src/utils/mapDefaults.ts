// path: src/utils/mapDefaults.ts
// What a newly placed pin or drawn region starts as, so the DM is not re-colouring
// every one by hand. Existing pins and regions are never touched: this only seeds
// new ones.
import { createPref, cleanHex, clampNum } from './prefs'

export interface MapDefaults {
  pinColor: string
  regionFill: string
  regionStroke: string
  /** Fill opacity of a new region, 0–1. */
  regionOpacity: number
}

export const MAP_DEFAULT_VALUES: MapDefaults = {
  pinColor: '#c8a84b',
  regionFill: '#c8a84b',
  regionStroke: '#c8a84b',
  regionOpacity: 0.2,
}

export const REGION_OPACITY = { min: 0.05, max: 0.8, step: 0.05 } as const

export const mapDefaults = createPref<MapDefaults>('dmforge:map-defaults', raw => ({
  pinColor: cleanHex(raw.pinColor, MAP_DEFAULT_VALUES.pinColor),
  regionFill: cleanHex(raw.regionFill, MAP_DEFAULT_VALUES.regionFill),
  regionStroke: cleanHex(raw.regionStroke, MAP_DEFAULT_VALUES.regionStroke),
  regionOpacity: clampNum(raw.regionOpacity, REGION_OPACITY.min, REGION_OPACITY.max, MAP_DEFAULT_VALUES.regionOpacity),
}))
