// path: src/components/SettingsModal.tsx
// Settings, in a dialog with a left rail: Appearance, Data, Help.
//
// This lived in two footer popovers until the appearance model grew a base, a
// free accent, fonts, six section colours and a per-campaign scope — at which
// point it was a page crammed into a flyout. The footer buttons still exist;
// they just open this on the tab they used to be.
import { Fragment, useEffect, useState } from 'react'
import type React from 'react'
import {
  Palette, Database, Lightbulb, Download, Upload, AlertCircle, Layers,
  Droplet, RotateCcw, Check,
} from 'lucide-react'
import { useStore } from '../store/store'
import Modal from './Modal'
import SwatchPicker from './SwatchPicker'
import {
  BASES, TEXT_THEMES, LOOKS, FONTS, textThemesFor, resolveTextTheme, resolveSections,
  contrastRatio, DEFAULT_APPEARANCE, DEFAULT_ACCENT, DEFAULT_FONTS,
} from '../constants/themes'
import type { BaseKey, Look } from '../constants/themes'
import { SECTION_VIEWS, SECTION_LABELS, SECTION_ICONS, type SectionView } from '../constants/sections'

type Tab = 'appearance' | 'data' | 'help'

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'appearance', label: 'Appearance', icon: <Palette size={14} /> },
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
          {settingsTab === 'data' && <DataTab />}
          {settingsTab === 'help' && <HelpTab />}
        </div>
      </div>
    </Modal>
  )
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function Group({ title, action, children }: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}>
        <span style={{ flex: 1 }}>{title}</span>
        {action}
      </div>
      {children}
    </section>
  )
}

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="hover-gold"
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        color: 'var(--text-muted)', fontSize: 10, fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-ui)',
        transition: 'color var(--transition)',
      }}
    >
      {children}
    </button>
  )
}

function Tile({ active, onClick, title, children, width = 78 }: {
  active: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
  width?: number
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width, padding: 5, cursor: 'pointer',
        background: active ? 'var(--gold-glow)' : 'transparent',
        border: `1px solid ${active ? 'var(--border-gold)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-sm)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        fontFamily: 'var(--font-ui)', transition: 'all var(--transition)',
      }}
      className={active ? '' : 'hover-gold-border'}
    >
      {children}
    </button>
  )
}

function TileLabel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10, color: active ? 'var(--gold)' : 'var(--text-muted)', letterSpacing: '0.03em' }}>
      {children}
    </span>
  )
}

const ROW: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6 }

function ToggleRow({ icon, label, value, on, off, onClick, hint }: {
  icon: React.ReactNode
  label: string
  value: boolean
  on: string
  off: string
  onClick: () => void
  hint?: string
}) {
  return (
    <div>
      <button
        onClick={onClick}
        className="menu-item menu-item-sm"
        style={{
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
          color: value ? 'var(--gold)' : 'var(--text-secondary)',
        }}
      >
        {icon}
        <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
        <span style={{ fontSize: 11, opacity: 0.75 }}>{value ? on : off}</span>
      </button>
      {hint && (
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 5 }}>
          {hint}
        </div>
      )}
    </div>
  )
}

// ── Appearance ────────────────────────────────────────────────────────────────

function AppearanceTab() {
  const {
    appearance, setAppearance, setSectionColor, resetSectionColors, resetAppearance,
    recentAccents, bgStyle, setBgStyle,
    appearanceScope, setAppearanceScope, currentCampaign,
  } = useStore()
  const [openSection, setOpenSection] = useState<SectionView | null>(null)

  const base = BASES[appearance.base]
  const textKey = resolveTextTheme(appearance)
  const sections = resolveSections(appearance)
  const fonts = { ...DEFAULT_FONTS, ...appearance.fonts }
  const overridden = Object.keys(appearance.sections).length > 0
  // 3:1 is the WCAG floor for UI elements and large text, which is what the
  // accent is used as — button labels, active rows, icons.
  const lowContrast = contrastRatio(appearance.accent, base.vars['--bg-surface']) < 3

  const atDefaults =
    appearance.base === DEFAULT_APPEARANCE.base &&
    appearance.accent === DEFAULT_APPEARANCE.accent &&
    appearance.text === DEFAULT_APPEARANCE.text &&
    appearance.tint === DEFAULT_APPEARANCE.tint &&
    fonts.display === DEFAULT_FONTS.display &&
    fonts.body === DEFAULT_FONTS.body &&
    fonts.ui === DEFAULT_FONTS.ui &&
    !overridden && bgStyle === 'none'

  const isLook = (l: Look) =>
    appearance.base === l.base && appearance.accent === l.accent &&
    appearance.text === l.text && appearance.tint === l.tint

  return (
    <div>
      <Group title="Starting points">
        <div style={ROW}>
          {LOOKS.map(l => {
            const active = isLook(l)
            return (
              <Tile
                key={l.key} active={active} width={92}
                title={`${BASES[l.base].label} base, ${l.accent}${l.tint ? ', tinted' : ''}`}
                onClick={() => setAppearance({ base: l.base, accent: l.accent, text: l.text, tint: l.tint })}
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
        </div>
      </Group>

      <Group title="Base">
        <div style={ROW}>
          {(Object.keys(BASES) as BaseKey[]).map(key => {
            const b = BASES[key]
            const active = appearance.base === key
            return (
              <Tile key={key} active={active} onClick={() => setAppearance({ base: key })}>
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

        <div style={{ marginTop: 9 }}>
          <ToggleRow
            icon={<Droplet size={13} />} label="Tint surfaces" value={appearance.tint}
            on="On" off="Off"
            onClick={() => setAppearance({ tint: !appearance.tint })}
            hint="Mixes a trace of the accent into the panels and borders. Subtle by design."
          />
        </div>
      </Group>

      <Group title="Text colour">
        <div style={ROW}>
          {textThemesFor(base.mode).map(key => {
            const t = TEXT_THEMES[key]
            const active = textKey === key
            return (
              <Tile key={key} active={active} onClick={() => setAppearance({ text: key })}>
                <div style={{
                  width: '100%', height: 26, borderRadius: 3, background: base.vars['--bg-base'],
                  border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-display)', fontSize: 14, color: t.preview, lineHeight: 1,
                }}>
                  Aa
                </div>
                <TileLabel active={active}>{t.label}</TileLabel>
              </Tile>
            )
          })}
        </div>
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

      <Group
        title="Section colours"
        action={overridden ? <LinkButton onClick={resetSectionColors}>Reset all</LinkButton> : undefined}
      >
        {SECTION_VIEWS.map(view => {
          const Icon = SECTION_ICONS[view]
          const colour = sections[view]
          const isOpen = openSection === view
          return (
            <div key={view}>
              <button
                onClick={() => setOpenSection(isOpen ? null : view)}
                className="menu-item menu-item-sm"
                style={{ borderRadius: 'var(--radius-sm)', color: isOpen ? 'var(--gold)' : 'var(--text-secondary)' }}
              >
                <Icon size={13} color={colour} />
                <span style={{ flex: 1, textAlign: 'left' }}>{SECTION_LABELS[view]}</span>
                {appearance.sections[view] && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>custom</span>
                )}
                <span style={{
                  width: 24, height: 12, borderRadius: 3, background: colour,
                  border: '1px solid var(--border-light)',
                }} />
              </button>
              {isOpen && (
                <div style={{ padding: '8px 4px 10px' }}>
                  <SwatchPicker value={colour} onChange={hex => setSectionColor(view, hex)} size={20} gap={5} />
                  {appearance.sections[view] && (
                    <div style={{ marginTop: 8 }}>
                      <LinkButton onClick={() => setSectionColor(view, null)}>
                        Back to {base.label} default
                      </LinkButton>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </Group>

      <Group title="Scope">
        <ToggleRow
          icon={<Layers size={13} />}
          label={currentCampaign ? `A look of its own for ${currentCampaign.name}` : 'Per-campaign look'}
          value={appearanceScope === 'campaign'}
          on="On" off="Off"
          onClick={() => currentCampaign && setAppearanceScope(appearanceScope === 'campaign' ? 'global' : 'campaign')}
          hint={currentCampaign
            ? appearanceScope === 'campaign'
              ? 'Changes here apply to this campaign only. Turning this off deletes its look and returns to the app-wide one.'
              : 'Turn on to fork the current look onto this campaign. Other campaigns keep the app-wide one.'
            : 'Open a campaign to give it a look of its own.'}
        />
      </Group>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <button
          onClick={resetAppearance}
          disabled={atDefaults}
          className={atDefaults ? '' : 'btn btn-sm'}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '6px 12px', borderRadius: 'var(--radius-sm)',
            background: 'transparent', border: '1px solid var(--border)',
            color: atDefaults ? 'var(--text-muted)' : 'var(--text-secondary)',
            fontFamily: 'var(--font-ui)', fontSize: 12,
            cursor: atDefaults ? 'default' : 'pointer',
            opacity: atDefaults ? 0.55 : 1,
          }}
          title={atDefaults ? 'Already at the original look' : 'Base, accent, text, faces, tint, section colours and backdrop'}
        >
          <RotateCcw size={13} />
          Reset to defaults
          <span style={{
            width: 12, height: 12, borderRadius: 3, marginLeft: 2,
            background: DEFAULT_ACCENT, border: '1px solid var(--border-light)',
          }} />
        </button>
      </div>
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
          {[
            ['Ctrl+S', 'Search this campaign'],
            ['Ctrl+K', 'Command palette'],
            ['Ctrl+T', 'New tab'],
            ['Ctrl+W', 'Close tab'],
            ['Ctrl+Tab', 'Next tab'],
          ].map(([keys, what]) => (
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
