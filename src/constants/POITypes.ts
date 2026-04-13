// path: src/constants/POITypes.ts
import { MapPin, User, Zap, Package, Skull, ScrollText, Puzzle, Swords } from 'lucide-react'
import type { POIType } from '../types'

export const POI_TYPE_LIST: { value: POIType; label: string; icon: any; color: string }[] = [
  { value: 'location',  label: 'Location',  icon: MapPin,      color: '#c8a84b' },
  { value: 'character', label: 'Character', icon: User,        color: '#5bbfb0' },
  { value: 'event',     label: 'Event',     icon: Zap,         color: '#8825c5' },
  { value: 'item',      label: 'Item',      icon: Package,     color: '#9b7de8' },
  { value: 'trap',      label: 'Trap',      icon: Skull,       color: '#e88c3a' },
  { value: 'quest',     label: 'Quest',     icon: ScrollText,  color: '#5b9fe8' },
  { value: 'puzzle',    label: 'Puzzle',    icon: Puzzle,      color: '#3dbf7f' },
  { value: 'combat',    label: 'Combat',    icon: Swords,      color: '#cb4242' },
]

export const TYPE_ORDER: POIType[] = [
  'location', 'character', 'quest', 'event', 'item', 'trap', 'puzzle', 'combat',
]

export function getPoiColor(type: POIType): string {
  return POI_TYPE_LIST.find(t => t.value === type)?.color ?? '#c8a84b'
}

export function getPoiIcon(type: POIType): any {
  return POI_TYPE_LIST.find(t => t.value === type)?.icon ?? MapPin
}