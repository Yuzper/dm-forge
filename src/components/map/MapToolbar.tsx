// path: src/components/map/MapToolbar.tsx
// The map's single tool strip. Placing a pin, drawing a region and measuring a
// route are all just tools here — they used to be three separate modes that each
// had to remember to turn the others off.
//
// Which tools appear is up to the host: measuring needs a calibrated scale, so
// only surfaces that support it pass it in.
import { MousePointer2, MapPin, Pentagon, Square, Triangle, Circle, Ruler } from 'lucide-react'
import type { MapTool } from '../../types'

interface ToolDef {
  tool: MapTool
  icon: typeof Square
  label: string
  hint: string
}

export const MAP_TOOLS: Record<MapTool, ToolDef> = {
  select:   { tool: 'select',   icon: MousePointer2, label: 'Select',    hint: 'Click a pin or region to open it · drag to move · drag a handle to reshape' },
  pin:      { tool: 'pin',      icon: MapPin,        label: 'Pin',       hint: 'Click to place a point of interest' },
  polygon:  { tool: 'polygon',  icon: Pentagon,      label: 'Polygon',   hint: 'Click to place points · click the first point or press Enter to close' },
  rect:     { tool: 'rect',     icon: Square,        label: 'Rectangle', hint: 'Drag to draw · hold Shift for a square' },
  triangle: { tool: 'triangle', icon: Triangle,      label: 'Triangle',  hint: 'Drag to draw' },
  ellipse:  { tool: 'ellipse',  icon: Circle,        label: 'Ellipse',   hint: 'Drag to draw · hold Shift for a circle' },
  measure:  { tool: 'measure',  icon: Ruler,         label: 'Measure',   hint: 'Click points to trace a route and read off travel time' },
}

// Groups are rendered with a divider between them: pointer work, then drawing,
// then measuring.
const GROUPS: MapTool[][] = [
  ['select', 'pin'],
  ['polygon', 'rect', 'triangle', 'ellipse'],
  ['measure'],
]

export default function MapToolbar({ tool, available, onPick, dark = true }: {
  tool: MapTool
  /** Tools this surface offers, in any order; the toolbar keeps its own order. */
  available: MapTool[]
  onPick: (tool: MapTool) => void
  /** Dark chrome for overlaying map art; false for panel backgrounds. */
  dark?: boolean
}) {
  const groups = GROUPS
    .map(g => g.filter(t => available.includes(t)))
    .filter(g => g.length > 0)

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 2,
        background: dark ? 'rgba(0,0,0,0.62)' : 'var(--bg-elevated)',
        backdropFilter: dark ? 'blur(6px)' : undefined,
        border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'var(--border)'}`,
        borderRadius: 6, padding: 3,
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {groups.map((group, gi) => (
        <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {gi > 0 && (
            <div style={{ width: 1, height: 16, margin: '0 3px', background: dark ? 'rgba(255,255,255,0.14)' : 'var(--border)' }} />
          )}
          {group.map(t => {
            const def = MAP_TOOLS[t]
            const Icon = def.icon
            const active = tool === t
            return (
              <button
                key={t}
                onClick={() => onPick(t)}
                title={`${def.label} — ${def.hint}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: active ? 'rgba(200,115,58,0.22)' : 'transparent',
                  border: `1px solid ${active ? 'rgba(200,115,58,0.45)' : 'transparent'}`,
                  color: active ? '#c8733a' : dark ? 'rgba(255,255,255,0.6)' : 'var(--text-secondary)',
                  borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer',
                  transition: 'all var(--transition)', whiteSpace: 'nowrap',
                }}
              >
                <Icon size={13} />
                {/* Only the active tool spells its name, so the strip stays compact */}
                {active && <span>{def.label}</span>}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** One-line guidance for the current tool, shown under the toolbar. */
export function toolHint(tool: MapTool, isDrawing: boolean): string {
  if (tool === 'polygon') {
    return isDrawing
      ? 'Click the first point or press Enter to close · Backspace removes the last point · Esc cancels'
      : 'Click to place the first point'
  }
  if (tool === 'select') return MAP_TOOLS.select.hint + ' · Delete removes the selection'
  return MAP_TOOLS[tool].hint + (tool === 'pin' || tool === 'measure' ? '' : ' · Esc cancels')
}
