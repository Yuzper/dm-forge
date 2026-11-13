// path: src/components/SettingsModal.tsx
// Settings, in a dialog with a left rail: Appearance, Maps & Table, Keyboard, Data, Help.
//
// This lived in two footer popovers until the appearance model grew a base, a
// free accent, fonts, six section colours and a per-campaign scope — at which
// point it was a page crammed into a flyout. The footer buttons still exist;
// they just open this on the tab they used to be.
import { Fragment, useEffect, useState } from 'react'
import type React from 'react'
import {
  Palette, Database, Lightbulb, Download, Upload, AlertCircle, Layers,
  RotateCcw, Check, ScrollText, Sparkles, CaseUpper, NotebookPen, Map as MapIcon, Keyboard, Plus, X, Link2,
} from 'lucide-react'
import { useStore } from '../store/store'
import Modal from './Modal'
import SwatchPicker from './SwatchPicker'
import {
  BASES, TEXT_THEMES, LOOKS, FONTS, textThemesFor, resolveTextTheme, LINK_KINDS,
  contrastRatio, DEFAULT_APPEARANCE, DEFAULT_ACCENT, DEFAULT_FONTS, DROP_CAP_LINES, TEXT_SIZE, LINE_HEIGHT,
} from '../constants/themes'
import type { BaseKey, Look, LinkKind } from '../constants/themes'
import { Group, LinkButton, Tile, TileLabel, ToggleRow, ActionRow, ROW, SettingsButton, SliderRow, Hint } from './settings/settingsShared'
import MapsTableTab from './settings/MapsTableTab'
import KeyboardTab from './settings/KeyboardTab'
import { useThrottledCommit } from '../hooks/useThrottledCommit'
import { customTemplates, saveTemplate, deleteTemplate, matchesTemplate, MAX_NAME } from '../utils/customTemplates'
import type { CustomTemplate } from '../utils/customTemplates'
import { useConfirmDelete } from '../hooks/useConfirmDelete'
import { keybindings, formatChord, BINDING_ORDER, BINDING_META } from '../utils/keybindings'

type Tab = 'appearance' | 'maps' | 'keyboard' | 'data' | 'help'

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'appearance', label: 'Appearance', icon: <Palette size={14} /> },
  { key: 'maps',       label: 'Maps & Table', icon: <MapIcon size={14} /> },
  { key: 'keyboard',   label: 'Keyboard',   icon: <Keyboard size={14} /> },
  { key: 'data',       label: 'Data',       icon: <Database size={14} /> },
  { key: 'help',       label: 'Help',       icon: <Lightbulb size={14} /> },
]

export default function SettingsModal() {
  const { settingsTab, setSettingsTab } = useStore()
  if (!settingsTab) return null

  return (
    <Modal
      title="Settings"
      onClose={() => setSettingsTab(null)}
      style={{ width: 720, maxWidth: '92vw', padding: 0, overflow: 'hidden' }}
      titleStyle={{ padding: '16px 20px 14px', marginBottom: 0, borderBottom: '1px solid var(--border)' }}
    >
      <div style={{ display: 'flex', height: 'min(620px, 76vh)' }}>
        <nav style={{
          width: 158, flexShrink: 0, borderRight: '1px solid var(--border)',
          padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2,
          background: 'var(--bg-surface)',
        }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setSettingsTab(t.key)}
              className={settingsTab === t.key ? '' : 'hover-bg hover-text'}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, height: 32, padding: '0 10px',
                background: settingsTab === t.key ? 'var(--gold-glow)' : 'transparent',
                border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                color: settingsTab === t.key ? 'var(--gold)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-ui)', fontSize: 12.5,
                fontWeight: settingsTab === t.key ? 600 : 500,
                textAlign: 'left', transition: 'all var(--transition)',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </nav>

        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '16px 20px 22px' }}>
          {settingsTab === 'appearance' && <AppearanceTab />}
          {settingsTab === 'maps' && <MapsTableTab />}
          {settingsTab === 'keyboard' && <KeyboardTab />}
          {settingsTab === 'data' && <DataTab />}
          {settingsTab === 'help' && <HelpTab />}
        </div>
      </div>
    </Modal>
  )
}

// ── Appearance ────────────────────────────────────────────────────────────────

// ── Live preview ──────────────────────────────────────────────────────────────

/**
 * A short page of text that always shows the look currently chosen.
 *
 * It is built from the same markup the editors use -- a `.ProseMirror` inside a
 * `data-dropcap` wrapper -- so it picks up the real stylesheet instead of a
 * look-alike: parchment pages, drop caps and their height, fonts, text colour,
 * accent, gloss and the Classic/Journal design all come through unchanged. The
 * settings already apply to the whole app as you click, so there is nothing to
 * pass in; this just needs to sit where it stays visible while you scroll.
 */
/** 'rgb(1, 2, 3)' / 'rgba(…)' → '#010203'. */
function rgbToHex(css: string): string | null {
  const m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(css)
  return m ? '#' + m.slice(1, 4).map(n => Number(n).toString(16).padStart(2, '0')).join('') : null
}

/** The link colours in force right now, read off the preview (so Journal's parchment inks
 *  come through): turning "Default link colours" off starts from exactly what you saw. */
function readLinkColours(): Partial<Record<LinkKind, string>> {
  const out: Partial<Record<LinkKind, string>> = {}
  for (const { key } of LINK_KINDS) {
    const el = document.querySelector(`[data-appearance-preview] .${key}-link`)
    const hex = el ? rgbToHex(getComputedStyle(el).color) : null
    if (hex) out[key] = hex
  }
  return out
}

function AppearancePreview() {
  const dropCap = useStore(s => s.appearance.dropCap)
  return (
    <div style={{
      // Pinned to the top of the scrolling settings pane (cancelling its padding)
      // so the options below can be changed while watching the result.
      position: 'sticky', top: -16, zIndex: 4,
      margin: '-16px -20px 14px', padding: '10px 20px 8px',
      background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-ui)',
      }}>
        Preview
      </div>
      <div data-appearance-preview style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', padding: '8px 10px', maxHeight: 168, overflow: 'hidden' }}>
        <div data-dropcap={dropCap ? 'on' : 'off'}>
          {/* Padding and height are overridden: the parchment sheet is built for a
              full page, and this is a postage stamp of one. */}
          <div className="ProseMirror" style={{ minHeight: 0, padding: '10px 18px', fontSize: 'calc(var(--prose-size, 16px) * 0.85)', lineHeight: 'calc(var(--prose-leading, 1.75) * 0.9)' }}>
            {/* One of each link kind up front, so link colours show without scrolling. */}
            <p>
              The road narrows where the old oak stands, tended by <span className="wiki-link">Mira Thornwood</span>.
              Since <span className="session-link">Session 3</span> travellers cast <span className="spell-link">Speak with Plants</span> there
              and listen for <span className="sound-link" data-sound-category="ambience">Rustling Leaves</span>.
            </p>
            <h2 style={{ marginTop: 4 }}>The Hollow Oak</h2>
            <p style={{ marginBottom: 0 }}>
              She keeps the <strong>shrine</strong> and will trade <em>rumours</em> for a fair price.
            </p>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <span className="btn btn-primary btn-sm" style={{ pointerEvents: 'none' }}>Primary</span>
        <span className="btn btn-sm" style={{ pointerEvents: 'none' }}>Button</span>
        <span className="badge" style={{ alignSelf: 'center' }}>Tag</span>
      </div>
    </div>
  )
}

/**
 * One of the DM's own templates. A small x in the corner removes it; the first
 * press arms it (the x turns into "?") and a second press deletes, the same
 * click-twice pattern the app's delete menus use. It is a sibling of the tile,
 * not inside it, because a button cannot contain a button.
 */
function CustomTemplateTile({ template: t, active, onApply }: {
  template: CustomTemplate
  active: boolean
  onApply: () => void
}) {
  const { confirming, trigger } = useConfirmDelete()
  const tb = BASES[t.appearance.base] ?? BASES.parchment
  return (
    <div style={{ position: 'relative' }}>
      <Tile active={active} width={92} title={`Your template — ${tb.label} base, ${t.appearance.accent}`} onClick={onApply}>
        <div style={{
          width: '100%', height: 30, borderRadius: 3, background: tb.preview, border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: t.appearance.accent }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: TEXT_THEMES[t.appearance.text]?.preview, lineHeight: 1 }}>Aa</span>
        </div>
        <TileLabel active={active}>{t.name}</TileLabel>
      </Tile>
      <button
        onClick={e => { e.stopPropagation(); trigger(() => deleteTemplate(t.id)) }}
        title={confirming ? 'Click again to delete this template' : `Delete “${t.name}”`}
        style={{
          position: 'absolute', top: 2, right: 2, width: 18, height: 18, padding: 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 3,
          background: confirming ? 'var(--danger)' : 'rgba(0,0,0,0.55)',
          border: 'none', color: confirming ? '#fff' : 'rgba(255,255,255,0.75)',
          fontSize: 11, fontWeight: 700, lineHeight: 1,
        }}
      >
        {confirming ? '?' : <X size={11} />}
      </button>
    </div>
  )
}

function AppearanceTab() {
  const {
    appearance, setAppearance, resetAppearance,
    recentAccents, bgStyle, setBgStyle,
    appearanceScope, setAppearanceScope, currentCampaign,
  } = useStore()
  const custom = customTemplates.use().items
  const [openLink, setOpenLink] = useState<LinkKind | null>(null)
  const linksDefault = Object.keys(appearance.links).length === 0
  const [saving, setSaving] = useState(false)
  const [tplName, setTplName] = useState('')
  const [sizeDraft, setSizeDraft, flushSize] = useThrottledCommit(appearance.textSize, v => setAppearance({ textSize: v }))
  const [leadDraft, setLeadDraft, flushLead] = useThrottledCommit(appearance.lineHeight, v => setAppearance({ lineHeight: v }))

  const base = BASES[appearance.base]
  const textKey = resolveTextTheme(appearance)
  const fonts = { ...DEFAULT_FONTS, ...appearance.fonts }
  // 3:1 is the WCAG floor for UI elements and large text, which is what the
  // accent is used as — button labels, active rows, icons.
  const lowContrast = contrastRatio(appearance.accent, base.vars['--bg-surface']) < 3
  // Body text wants 4.5:1 (WCAG AA).
  const lowTextContrast = !!appearance.textCustom && contrastRatio(appearance.textCustom, base.vars['--bg-surface']) < 4.5

  const atDefaults =
    appearance.base === DEFAULT_APPEARANCE.base &&
    appearance.accent === DEFAULT_APPEARANCE.accent &&
    appearance.text === DEFAULT_APPEARANCE.text &&
    appearance.tint === DEFAULT_APPEARANCE.tint &&
    fonts.display === DEFAULT_FONTS.display &&
    fonts.body === DEFAULT_FONTS.body &&
    fonts.ui === DEFAULT_FONTS.ui &&
    !appearance.textCustom && Object.keys(appearance.links).length === 0 &&
    bgStyle === 'none'

  const isLook = (l: Look) =>
    appearance.base === l.base && appearance.accent === l.accent &&
    appearance.text === l.text && appearance.tint === l.tint && !appearance.textCustom

  const journal = appearance.design !== 'classic'

  return (
    <div>
      <AppearancePreview />

      <Group title="Templates">
        <div style={ROW}>
          {LOOKS.map(l => {
            const active = isLook(l)
            return (
              <Tile
                key={l.key} active={active} width={92}
                title={`${BASES[l.base].label} base, ${l.accent}${l.tint ? ', tinted' : ''}`}
                onClick={() => setAppearance({ base: l.base, accent: l.accent, secondary: null, text: l.text, textCustom: null, tint: l.tint, ...(l.fonts ? { fonts: l.fonts } : {}) })}
              >
                <div style={{
                  width: '100%', height: 30, borderRadius: 3, position: 'relative',
                  background: BASES[l.base].preview, border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: l.accent }} />
                  <span style={{
                    fontFamily: 'var(--font-display)', fontSize: 12,
                    color: TEXT_THEMES[l.text].preview, lineHeight: 1,
                  }}>Aa</span>
                </div>
                <TileLabel active={active}>{l.label}</TileLabel>
              </Tile>
            )
          })}
          {custom.map(t => (
            <CustomTemplateTile
              key={t.id} template={t} active={matchesTemplate(t, appearance, bgStyle)}
              onApply={() => {
                setAppearance(t.appearance)
                setBgStyle((BG_OPTIONS.some(o => o.value === t.bgStyle) ? t.bgStyle : 'none') as typeof bgStyle)
              }}
            />
          ))}
          {/* Where you look for templates is where saving one belongs: a tile in the row. */}
          <button
            onClick={() => { setSaving(v => !v); setTplName('') }}
            title="Save the current look as a template of your own"
            className={saving ? '' : 'hover-gold-border'}
            style={{
              width: 92, padding: 5, cursor: 'pointer', fontFamily: 'var(--font-ui)',
              // A call to action rather than another swatch: a gold edge and a light fill.
              background: saving ? 'var(--gold-glow)' : 'color-mix(in srgb, var(--gold) 7%, transparent)',
              border: '1px dashed var(--border-gold)',
              borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
              color: 'var(--text-primary)', transition: 'all var(--transition)',
            }}
          >
            <div style={{ width: '100%', height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={20} color="var(--gold)" />
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-primary)', letterSpacing: '0.03em', fontWeight: 600 }}>
              {saving ? 'Cancel' : 'Save current'}
            </span>
          </button>
        </div>
        {saving && (
          <form
            onSubmit={e => {
              e.preventDefault()
              if (saveTemplate(tplName, appearance, bgStyle)) { setSaving(false); setTplName('') }
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}
          >
            <input
              autoFocus value={tplName} maxLength={MAX_NAME} placeholder="Name this look"
              onChange={e => setTplName(e.target.value)}
              className="input" style={{ flex: 1, height: 30 }}
            />
            <SettingsButton type="submit" primary disabled={!tplName.trim()}>Save</SettingsButton>
          </form>
        )}
        {saving && (
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
            Saves the design, colours, fonts, text size and backdrop. Saving under an existing name replaces it.
          </div>
        )}
        {/* Same row and same row style: both are "what does this look apply to" controls. */}
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ActionRow
              icon={<RotateCcw size={13} />}
              label="Reset to defaults"
              onClick={resetAppearance}
              disabled={atDefaults}
              title={atDefaults ? 'Already at the original look' : 'Base, accent, text, faces and backdrop'}
              trailing={atDefaults
                ? <span style={{ fontSize: 11, opacity: 0.75 }}>Default</span>
                : <span style={{
                    width: 12, height: 12, borderRadius: 3,
                    background: DEFAULT_ACCENT, border: '1px solid var(--border-light)',
                  }} />}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ToggleRow
              icon={<Layers size={13} />}
              label="Per-campaign look"
              value={appearanceScope === 'campaign'}
              on="On" off="Off"
              onClick={() => currentCampaign && setAppearanceScope(appearanceScope === 'campaign' ? 'global' : 'campaign')}
              hint={currentCampaign
                ? appearanceScope === 'campaign'
                  ? `Changes here apply to ${currentCampaign.name} only. Turning this off deletes its look and returns to the app-wide one.`
                  : `Turn on to fork the current look onto ${currentCampaign.name}. Other campaigns keep the app-wide one.`
                : 'Open a campaign to give it a look of its own.'}
            />
          </div>
        </div>
      </Group>


      <Group title="Design">
        <div style={ROW}>
          {([
            { key: 'classic' as const, label: 'Classic' },
            { key: 'journal' as const, label: 'Journal' },
          ]).map(d => {
            const active = appearance.design === d.key
            return (
              <Tile key={d.key} active={active} width={92} onClick={() => setAppearance({ design: d.key })}>
                {/* A tiny drawing of each design's frame, in the current colours. */}
                <div style={{
                  width: '100%', height: 30, position: 'relative', overflow: 'hidden',
                  background: 'var(--bg-surface)',
                  ...(d.key === 'classic'
                    ? { border: '1px solid var(--border-light)', borderRadius: 5 }
                    : { outline: '1px solid #000', borderRadius: 1,
                        boxShadow: 'inset 0 0 0 1px var(--gold-dim), inset 0 0 0 2px #000, inset 0 0 0 3px var(--border-gold)' }),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{
                    width: 34, height: 9,
                    ...(d.key === 'classic'
                      ? { background: 'var(--gold)', borderRadius: 3 }
                      : { background: 'linear-gradient(180deg, var(--gold-hover), var(--gold) 50%, var(--gold-dim) 52%, var(--gold))',
                          borderRadius: 1, boxShadow: '0 0 0 1px #000' }),
                  }} />
                </div>
                <TileLabel active={active}>{d.label}</TileLabel>
              </Tile>
            )
          })}
        </div>
        {journal && (
          <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <ToggleRow
              icon={<ScrollText size={13} />} label="Parchment pages" value={appearance.parchment}
              on="On" off="Off"
              onClick={() => setAppearance({ parchment: !appearance.parchment })}
              hint="Writing areas become a sheet of parchment with brown ink. Off, they use your base and text colours."
            />
            <ToggleRow
              icon={<Sparkles size={13} />} label="Glossy highlights" value={appearance.gloss}
              on="On" off="Off"
              onClick={() => setAppearance({ gloss: !appearance.gloss })}
              hint="The shine on buttons, cards and tabs, and the gold glow on hover. Off gives a flat, matte finish."
            />
            <ToggleRow
              icon={<CaseUpper size={13} />} label="Drop caps" value={appearance.dropCap}
              on="On" off="Off"
              onClick={() => setAppearance({ dropCap: !appearance.dropCap })}
              hint="The first letter of an article's text is set large, a few lines tall. Any page can override this from the drop-cap button in its toolbar."
            />
            {appearance.dropCap && (
              <>
                <div style={{ padding: '2px 10px' }}>
                  <SliderRow
                    label="Size" title="Drop-cap height in lines of text"
                    value={appearance.dropCapLines}
                    min={DROP_CAP_LINES.min} max={DROP_CAP_LINES.max} step={DROP_CAP_LINES.step}
                    display={`${appearance.dropCapLines} lines`}
                    onChange={v => setAppearance({ dropCapLines: v })}
                  />
                </div>
                <ToggleRow
                  icon={<NotebookPen size={13} />} label="Drop caps in notes too" value={appearance.dropCapNotes}
                  on="On" off="Articles only"
                  onClick={() => setAppearance({ dropCapNotes: !appearance.dropCapNotes })}
                  hint="Also DM notes, session notes, scenes, map pins and combat notes."
                />
              </>
            )}
          </div>
        )}
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 7, lineHeight: 1.5 }}>
          The design is the frame; everything below — base, accent, text, type faces,
          backdrop — still applies inside it.
        </div>
      </Group>

      <Group title="Base">
        <div style={ROW}>
          {(Object.keys(BASES) as BaseKey[]).map(key => {
            const b = BASES[key]
            const active = appearance.base === key
            return (
              <Tile key={key} active={active} onClick={() => setAppearance({ base: key, tint: false })}>
                <div style={{
                  width: '100%', height: 26, borderRadius: 3, background: b.preview,
                  border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ width: 18, height: 2, borderRadius: 1, background: TEXT_THEMES[b.text].preview }} />
                </div>
                <TileLabel active={active}>{b.label}</TileLabel>
              </Tile>
            )
          })}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 7, lineHeight: 1.5 }}>
          Paper is the light one. Danger red, success green and warning orange stay
          themselves on every base.
        </div>
      </Group>

      <Group title="Accent">
        <SwatchPicker value={appearance.accent} onChange={hex => setAppearance({ accent: hex })} size={22} gap={6} />

        {recentAccents.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 9 }}>
            <span style={{ fontSize: 9.5, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Recent
            </span>
            {recentAccents.map(hex => (
              <button
                key={hex}
                onClick={() => setAppearance({ accent: hex })}
                title={hex}
                className="hover-gold-border-strong"
                style={{
                  width: 18, height: 18, borderRadius: 3, background: hex,
                  border: '1px solid var(--border-light)', cursor: 'pointer', padding: 0,
                }}
              />
            ))}
          </div>
        )}

        {lowContrast && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 9,
            fontSize: 11, lineHeight: 1.45, color: 'var(--warning)',
          }}>
            <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Low contrast on {base.label} — accent text and icons will be hard to read.</span>
          </div>
        )}

      </Group>

      <Group
        title="Secondary colour"
        action={appearance.secondary ? <LinkButton onClick={() => setAppearance({ secondary: null })}>Automatic</LinkButton> : undefined}
      >
        <SwatchPicker value={appearance.secondary} onChange={hex => setAppearance({ secondary: hex })} size={22} gap={6} />
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
          {appearance.secondary
            ? 'Colours the secondary buttons. Primary actions keep the accent.'
            : journal
              ? 'Automatic: the red slab buttons. Pick a colour to make them match your accent instead.'
              : 'Automatic: plain buttons. Pick a colour to give them a coloured edge and hover.'}
        </div>
      </Group>

      <Group title="Interface colour">
        <SwatchPicker
          value={appearance.textCustom ?? TEXT_THEMES[textKey].preview}
          swatches={textThemesFor(base.mode).map(k => ({ color: TEXT_THEMES[k].preview, title: TEXT_THEMES[k].label }))}
          onChange={hex => {
            // A preset circle picks that palette; anything else is your own colour.
            const preset = textThemesFor(base.mode).find(k => TEXT_THEMES[k].preview === hex)
            setAppearance(preset ? { text: preset, textCustom: null } : { textCustom: hex })
          }}
          size={22} gap={6}
        />
        <Hint>
          {appearance.textCustom
            ? 'Your own colour. Lighter and darker shades for secondary text and hints are made from it.'
            : `${TEXT_THEMES[textKey].label}. The colour of words across the app; the wheel picks your own.`}
        </Hint>
        {lowTextContrast && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 7, fontSize: 11, lineHeight: 1.45, color: 'var(--warning)' }}>
            <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Low contrast on {base.label}: text will be hard to read.</span>
          </div>
        )}
      </Group>

      <Group title="Link colours">
        <ToggleRow
          icon={<Link2 size={13} />}
          label="Default link colours"
          value={linksDefault}
          on="On" off="Off"
          onClick={() => {
            if (linksDefault) setAppearance({ links: readLinkColours() })
            else { setAppearance({ links: {} }); setOpenLink(null) }
          }}
          hint={linksDefault
            ? "Each design's own colours, including the inks on Journal's parchment pages. Turn off, or pick a link below, to choose your own."
            : "Turn on to go back to each design's own colours."}
        />
        <div style={{ ...ROW, marginTop: 10 }}>
          {LINK_KINDS.map(k => {
            const isOpen = openLink === k.key
            const chosen = !!appearance.links[k.key]
            return (
              <Tile key={k.key} active={isOpen} width={104} title={k.hint} onClick={() => setOpenLink(isOpen ? null : k.key)}>
                <div style={{
                  width: '100%', height: 26, borderRadius: 3, background: 'var(--bg-base)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-body)', fontSize: 12.5, lineHeight: 1, pointerEvents: 'none',
                }}>
                  <span className={`${k.key}-link`} data-sound-category={k.key === 'sound' ? 'ambience' : undefined}>
                    {k.label}
                  </span>
                </div>
                <TileLabel active={isOpen}>{chosen ? 'Custom' : 'Default'}</TileLabel>
              </Tile>
            )
          })}
        </div>
        {openLink && (
          <div style={{ marginTop: 10 }}>
            <SwatchPicker
              value={appearance.links[openLink] ?? null}
              onChange={hex => setAppearance({ links: { ...appearance.links, [openLink]: hex } })}
              size={22} gap={6}
            />
            {appearance.links[openLink] && (
              <div style={{ marginTop: 8 }}>
                <LinkButton onClick={() => {
                  const { [openLink]: _gone, ...rest } = appearance.links
                  setAppearance({ links: rest })
                }}>Back to default</LinkButton>
              </div>
            )}
            {openLink === 'sound' && (
              <Hint>A sound colour replaces the per-category colours (effects, ambience, music).</Hint>
            )}
          </div>
        )}
      </Group>

      <Group title="Type faces">
        {(['display', 'body', 'ui'] as const).map(role => (
          <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              width: 58, flexShrink: 0, fontSize: 11, color: 'var(--text-muted)',
              textTransform: 'capitalize',
            }}>
              {role === 'ui' ? 'Interface' : role}
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {FONTS[role].map(f => {
                const active = fonts[role] === f.key
                return (
                  <button
                    key={f.key}
                    onClick={() => setAppearance({ fonts: { ...fonts, [role]: f.key } })}
                    title={f.family ? 'Loaded from Google Fonts' : 'Installed on this machine — works offline'}
                    style={{
                      padding: '4px 9px', cursor: 'pointer',
                      background: active ? 'var(--gold-glow)' : 'transparent',
                      border: `1px solid ${active ? 'var(--border-gold)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-sm)',
                      color: active ? 'var(--gold)' : 'var(--text-secondary)',
                      fontFamily: f.stack, fontSize: 12.5, transition: 'all var(--transition)',
                    }}
                    className={active ? '' : 'hover-gold-border'}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
          Web faces download once and are cached; System uses what's already on this
          machine, which is the only choice that renders identically offline.
        </div>
      </Group>

      <Group
        title="Page text"
        action={(appearance.textSize !== TEXT_SIZE.default || appearance.lineHeight !== LINE_HEIGHT.default)
          ? <LinkButton onClick={() => setAppearance({ textSize: TEXT_SIZE.default, lineHeight: LINE_HEIGHT.default })}>Reset</LinkButton>
          : undefined}
      >
        <SliderRow
          label="Size" value={sizeDraft} min={TEXT_SIZE.min} max={TEXT_SIZE.max} step={TEXT_SIZE.step}
          display={`${sizeDraft}%`} onChange={setSizeDraft} onCommit={flushSize}
        />
        <SliderRow
          label="Line spacing" value={leadDraft} min={LINE_HEIGHT.min} max={LINE_HEIGHT.max} step={LINE_HEIGHT.step}
          display={leadDraft.toFixed(2)} onChange={setLeadDraft} onCommit={flushLead}
        />
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
          The reading text in articles, notes and scenes. The preview above follows it.
        </div>
      </Group>

      <Group title="Backdrop">
        <div style={ROW}>
          {BG_OPTIONS.map(opt => {
            const active = bgStyle === opt.value
            return (
              <Tile key={opt.value} active={active} onClick={() => setBgStyle(opt.value)}>
                <div style={{
                  width: '100%', height: 26, borderRadius: 3, background: opt.preview,
                  border: '1px solid var(--border)',
                }} />
                <TileLabel active={active}>{opt.label}</TileLabel>
              </Tile>
            )
          })}
        </div>
      </Group>

    </div>
  )
}

type BgStyle = 'none' | 'parchment' | 'vignette' | 'stone' | 'wood'

const BG_OPTIONS: { value: BgStyle; label: string; preview: string }[] = [
  { value: 'none',      label: 'None',      preview: 'var(--bg-base)' },
  { value: 'parchment', label: 'Noise',     preview: 'var(--bg-elevated)' },
  { value: 'vignette',  label: 'Vignette',  preview: 'radial-gradient(circle, var(--bg-elevated) 0%, var(--bg-base) 100%)' },
  { value: 'stone',     label: 'Stone',     preview: 'repeating-linear-gradient(0deg, var(--bg-base) 0px, var(--bg-base) 9px, var(--bg-surface) 10px), repeating-linear-gradient(90deg, var(--bg-base) 0px, var(--bg-base) 14px, var(--bg-surface) 15px)' },
  { value: 'wood',      label: 'Wood',      preview: 'repeating-linear-gradient(90deg, var(--bg-base) 0px, var(--bg-surface) 2px, var(--bg-base) 4px, var(--bg-base) 10px)' },
]

// ── Data ──────────────────────────────────────────────────────────────────────

type Status =
  | { kind: 'idle' }
  | { kind: 'working'; label: string }
  | { kind: 'done'; text: string }
  | { kind: 'error'; text: string }

function DataTab() {
  const { campaigns, loadCampaigns, currentCampaign } = useStore()
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  // Import replaces rows on disk, so it keeps a confirm step.
  const [confirmImport, setConfirmImport] = useState(false)

  const settle = (s: Status) => {
    setStatus(s)
    setTimeout(() => setStatus({ kind: 'idle' }), 6000)
  }

  const doExport = async (campaignId: number | null) => {
    if (status.kind === 'working') return
    setStatus({ kind: 'working', label: 'Backing up…' })
    const result = await window.api.exportBackup(campaignId)
    if (result.canceled) { setStatus({ kind: 'idle' }); return }
    if (result.success && result.path) settle({ kind: 'done', text: `Saved to ${result.path}` })
    else settle({ kind: 'error', text: result.error || 'Backup failed' })
  }

  const doImport = async () => {
    setConfirmImport(false)
    setStatus({ kind: 'working', label: 'Importing…' })
    const result = await window.api.importBackup()
    if (result.canceled) { setStatus({ kind: 'idle' }); return }
    if (!result.success) { settle({ kind: 'error', text: result.error || 'Import failed' }); return }
    await loadCampaigns()
    const parts: string[] = []
    if (result.imported?.length) parts.push(`${result.imported.length} imported`)
    if (result.replaced?.length) parts.push(`${result.replaced.length} replaced`)
    if (result.skipped?.length) parts.push(`${result.skipped.length} kept`)
    settle({ kind: 'done', text: parts.join(', ') || 'Nothing imported' })
  }

  const others = campaigns.filter(c => c.id !== currentCampaign?.id)

  return (
    <div>
      <Group title="Export backup">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={() => doExport(null)} className="menu-item menu-item-sm"
            style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <Download size={13} /> Everything
          </button>
          {currentCampaign && (
            <button onClick={() => doExport(currentCampaign.id)} className="menu-item menu-item-sm"
              style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <Layers size={13} /> {currentCampaign.name}
            </button>
          )}
          {others.map(c => (
            <button key={c.id} onClick={() => doExport(c.id)} className="menu-item menu-item-sm"
              style={{ borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <Layers size={13} /> {c.name}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Restore">
        <button
          onClick={() => (confirmImport ? doImport() : setConfirmImport(true))}
          className="menu-item menu-item-sm"
          style={{
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${confirmImport ? 'var(--border-gold)' : 'var(--border)'}`,
            color: confirmImport ? 'var(--gold)' : undefined,
          }}
        >
          {confirmImport ? <AlertCircle size={13} /> : <Upload size={13} />}
          {confirmImport ? 'Click again to confirm' : 'Import backup…'}
        </button>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
          Campaigns are imported alongside your current ones. If one already exists
          you'll be asked which version to keep.
        </div>
      </Group>

      {status.kind !== 'idle' && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 4,
          padding: '9px 11px', borderRadius: 'var(--radius-sm)', fontSize: 11.5, lineHeight: 1.5,
          background: status.kind === 'error' ? 'var(--danger-bg)' : 'var(--success-bg)',
          border: `1px solid ${status.kind === 'error' ? 'var(--danger-border)' : 'var(--success-border)'}`,
          color: status.kind === 'error' ? 'var(--danger)' : 'var(--text-secondary)',
          wordBreak: 'break-all',
        }}>
          {status.kind === 'error' ? <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            : status.kind === 'done' ? <Check size={13} style={{ flexShrink: 0, marginTop: 1, color: 'var(--success)' }} />
            : null}
          <span>{status.kind === 'working' ? status.label : status.text}</span>
        </div>
      )}
    </div>
  )
}

// ── Help ──────────────────────────────────────────────────────────────────────

function HelpTab() {
  const { showHints, setShowHints } = useStore()
  const { chords } = keybindings.use()
  const [version, setVersion] = useState('')
  useEffect(() => { window.api.getAppVersion().then(setVersion) }, [])

  return (
    <div>
      <Group title="Hints">
        <ToggleRow
          icon={<Lightbulb size={13} />} label="Feature hints" value={showHints}
          on="On" off="Off"
          onClick={() => setShowHints(!showHints)}
          hint="Turning hints back on also restores any you dismissed individually."
        />
      </Group>

      <Group title="Shortcuts">
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 12 }}>
          {BINDING_ORDER.filter(id => id !== 'prevTab').map(id => [formatChord(chords[id]), BINDING_META[id].label]).map(([keys, what]) => (
            <Fragment key={keys}>
              <kbd style={{
                fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5,
                background: 'var(--bg-base)', border: '1px solid var(--border)',
                borderRadius: 3, padding: '2px 6px', color: 'var(--text-muted)', justifySelf: 'start',
              }}>
                {keys}
              </kbd>
              <span style={{ color: 'var(--text-secondary)' }}>{what}</span>
            </Fragment>
          ))}
        </div>
      </Group>

      <Group title="About">
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>DM Forge v{version}</div>
      </Group>
    </div>
  )
}
