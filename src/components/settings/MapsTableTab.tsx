// path: src/components/settings/MapsTableTab.tsx
// Settings > Maps & Table: what new pins and regions start as, how the player
// screen looks, and how a map is put on it when you press Cast.
//
// Nothing here changes what is already on a map. Defaults only seed new pins and
// regions; the table look applies to whatever is cast next (and to what is on the
// table now, since it travels with the live calibration).
import { useStore } from '../../store/store'
import SwatchPicker from '../SwatchPicker'
import {
  Group, LinkButton, Tile, TileLabel, ToggleRow, ROW, SubLabel, Hint, SliderRow, ChoiceTiles,
} from './settingsShared'
import { useThrottledCommit } from '../../hooks/useThrottledCommit'
import { mapDefaults, MAP_DEFAULT_VALUES, REGION_OPACITY } from '../../utils/mapDefaults'
import { castDefaults } from '../../utils/castDefaults'
import type { GridOnCast, TableDisplay } from '../../utils/castDefaults'
import { DEFAULT_CALIBRATION, FOG_OPACITY } from '../../vtt/protocol'
import type { GridStyle } from '../../vtt/protocol'
import { ShieldCheck, Shield } from 'lucide-react'

const GRID_STYLES: { key: GridStyle; label: string }[] = [{ key: 'lines', label: 'Lines' }, { key: 'dots', label: 'Dots' }]
const GRID_ON_CAST: { key: GridOnCast; label: string; hint: string }[] = [
  { key: 'remember', label: 'Remember', hint: 'Keep whatever it was last set to' },
  { key: 'on', label: 'Always on', hint: 'Show the grid on every cast' },
  { key: 'off', label: 'Always off', hint: 'Start every cast without it' },
]
const DISPLAYS: { key: TableDisplay; label: string; hint: string }[] = [
  { key: 'secondary', label: 'Second screen', hint: 'Fullscreen on another display if there is one' },
  { key: 'primary', label: 'Main screen', hint: 'A window on this screen' },
]

/** The little square at the end of a slider row that shows what the value looks like. */
const sample: React.CSSProperties = { width: 46, height: 24, borderRadius: 3, flexShrink: 0, border: '1px solid var(--border)' }

export default function MapsTableTab() {
  const md = mapDefaults.use()
  const cd = castDefaults.use()
  const calibration = useStore(s => s.tableCalibration)
  const setTableCalibration = useStore(s => s.setTableCalibration)

  const [fogDraft, setFogDraft, flushFog] = useThrottledCommit(
    calibration.fogOpacity, v => setTableCalibration({ fogOpacity: v }))

  const mapsAtDefaults =
    md.pinColor === MAP_DEFAULT_VALUES.pinColor && md.regionFill === MAP_DEFAULT_VALUES.regionFill &&
    md.regionStroke === MAP_DEFAULT_VALUES.regionStroke && md.regionOpacity === MAP_DEFAULT_VALUES.regionOpacity

  const tableAtDefaults =
    calibration.fogOpacity === DEFAULT_CALIBRATION.fogOpacity &&
    calibration.gridStyle === DEFAULT_CALIBRATION.gridStyle &&
    calibration.mapBackdrop === DEFAULT_CALIBRATION.mapBackdrop

  return (
    <div>
      <Group
        title="New pins"
        action={md.pinColor !== MAP_DEFAULT_VALUES.pinColor
          ? <LinkButton onClick={() => mapDefaults.set({ pinColor: MAP_DEFAULT_VALUES.pinColor })}>Reset</LinkButton> : undefined}
      >
        <SubLabel>Starting colour</SubLabel>
        <SwatchPicker value={md.pinColor} onChange={hex => mapDefaults.set({ pinColor: hex })} size={22} gap={6} />
        <Hint>Applies to pins you place from now on. You can still change any pin&rsquo;s colour afterwards.</Hint>
      </Group>

      <Group
        title="New regions"
        action={!mapsAtDefaults ? <LinkButton onClick={() => mapDefaults.reset()}>Reset all map defaults</LinkButton> : undefined}
      >
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <SubLabel>Fill</SubLabel>
            <SwatchPicker value={md.regionFill} onChange={hex => mapDefaults.set({ regionFill: hex })} size={20} gap={5} />
          </div>
          <div>
            <SubLabel>Outline</SubLabel>
            <SwatchPicker value={md.regionStroke} onChange={hex => mapDefaults.set({ regionStroke: hex })} size={20} gap={5} />
          </div>
        </div>
        <SliderRow
          label="Fill strength"
          value={md.regionOpacity} min={REGION_OPACITY.min} max={REGION_OPACITY.max} step={REGION_OPACITY.step}
          display={`${Math.round(md.regionOpacity * 100)}%`}
          onChange={v => mapDefaults.set({ regionOpacity: v })}
          extra={
            <div title="Sample" style={{
              ...sample, border: `2px solid ${md.regionStroke}`,
              background: `color-mix(in srgb, ${md.regionFill} ${Math.round(md.regionOpacity * 100)}%, var(--bg-base))`,
            }} />
          }
        />
      </Group>

      <Group
        title="Table screen"
        action={!tableAtDefaults
          ? <LinkButton onClick={() => setTableCalibration({
              fogOpacity: DEFAULT_CALIBRATION.fogOpacity,
              gridStyle: DEFAULT_CALIBRATION.gridStyle,
              mapBackdrop: DEFAULT_CALIBRATION.mapBackdrop,
            })}>Reset</LinkButton>
          : undefined}
      >
        <SliderRow
          label="Fog darkness"
          value={fogDraft} min={FOG_OPACITY.min} max={FOG_OPACITY.max} step={FOG_OPACITY.step}
          display={`${Math.round(fogDraft * 100)}%`}
          onChange={setFogDraft} onCommit={flushFog}
          extra={
            <div title="Lit on the left, fogged on the right" style={{
              ...sample,
              background: `linear-gradient(90deg, #6b5d49 50%, color-mix(in srgb, #000 ${Math.round(fogDraft * 100)}%, #6b5d49) 50%)`,
            }} />
          }
        />
        <Hint>100% hides everything outside what the party can see. Lower lets a ghost of the map show through.</Hint>

        <SubLabel style={{ marginTop: 14 }}>Grid style</SubLabel>
        <div style={ROW}>
          {GRID_STYLES.map(g => {
            const active = calibration.gridStyle === g.key
            return (
              <Tile key={g.key} active={active} width={92} onClick={() => setTableCalibration({ gridStyle: g.key })}>
                <div style={{
                  width: '100%', height: 26, borderRadius: 3, border: '1px solid var(--border)', background: 'var(--bg-base)',
                  backgroundImage: g.key === 'lines'
                    ? 'linear-gradient(to right, var(--text-muted) 1px, transparent 1px), linear-gradient(to bottom, var(--text-muted) 1px, transparent 1px)'
                    : 'radial-gradient(circle, var(--text-muted) 1.4px, transparent 1.8px)',
                  backgroundSize: '9px 9px',
                }} />
                <TileLabel active={active}>{g.label}</TileLabel>
              </Tile>
            )
          })}
        </div>
        <Hint>Grid colour and strength are in the Table panel&rsquo;s Setup tab, next to the screen size.</Hint>

        <SubLabel style={{ marginTop: 14 }}>Colour around the map</SubLabel>
        <SwatchPicker value={calibration.mapBackdrop} onChange={hex => setTableCalibration({ mapBackdrop: hex })} size={20} gap={5} />
        <Hint>Seen where a map does not fill the screen. Black is the least distracting.</Hint>
      </Group>

      <Group title="When casting">
        <ToggleRow
          icon={cd.fogOnCast ? <ShieldCheck size={13} /> : <Shield size={13} />}
          label="Start with fog of war on"
          value={cd.fogOnCast} on="On" off="Off"
          onClick={() => castDefaults.set({ fogOnCast: !cd.fogOnCast })}
          hint="Only affects maps that have walls. On, the table is black until you place the party; off, players see the whole map."
        />

        <SubLabel style={{ marginTop: 14 }}>Grid</SubLabel>
        <ChoiceTiles options={GRID_ON_CAST} value={cd.gridOnCast} onChange={v => castDefaults.set({ gridOnCast: v })} />

        <SubLabel style={{ marginTop: 14 }}>Table opens on</SubLabel>
        <ChoiceTiles options={DISPLAYS} value={cd.tableDisplay} onChange={v => castDefaults.set({ tableDisplay: v })} />
        <Hint>
          &ldquo;Show points &amp; regions to players&rdquo; is not here on purpose: it starts off on every
          cast so a forgotten setting can never reveal something.
        </Hint>
      </Group>
    </div>
  )
}
