// path: src/components/Sidebar.tsx
import { useEffect, useState, useRef } from 'react'
import { useStore } from '../store/store'
import { useMenuClose } from '../hooks/useMenuClose'
import {
  ChevronLeft, Scroll, Download, Upload, Check,
  AlertCircle, BookOpen, Clock, ArrowLeft,
  FileText, Layers, Sparkles, ShoppingBag, Network, Paintbrush, Lightbulb, Music2, Palette, Type,
  PanelLeftClose, PanelLeftOpen, Search,
} from 'lucide-react'
import POIList from './POIList'
import type { Location } from '../store/location'
import { locationLabel, sameLocation } from '../store/location'
import { StoreMapProvider } from '../context/MapContext'
import { THEMES, TEXT_THEMES } from '../constants/themes'
import type { ThemeKey, TextThemeKey } from '../constants/themes'
import { NAV_ITEMS } from '../constants/sections'
import { useContextMenu, useMenuCtx } from '../hooks/useContextMenu'
import { buildLocationMenu, truncate } from '../utils/contextMenus'

// ── Collapsed rail ─────────────────────────────────────────────────────────────

function RailIcon({ icon, title, active, accent, onClick }: {
  icon: React.ReactNode; title: string; active: boolean; accent: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? `color-mix(in srgb, ${accent} 14%, transparent)` : 'none',
        border: `1px solid ${active ? `color-mix(in srgb, ${accent} 45%, transparent)` : 'transparent'}`,
        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        color: active ? accent : 'var(--text-muted)',
        transition: 'all var(--transition)',
      }}
      className={active ? '' : 'hover-gold'}
    >
      {icon}
    </button>
  )
}

function historyIcon(loc: Location) {
  switch (loc.type) {
    case 'campaign': return <Layers size={11} />
    case 'session':  return <Scroll size={11} />
    case 'wiki':     return <BookOpen size={11} />
    case 'article':  return <FileText size={11} />
    case 'relations': return <Network size={11} />
    case 'dm-notes': return <Sparkles size={11} />
    case 'loot-tables': return <ShoppingBag size={11} />
    case 'timeline': return <Clock size={11} />
    case 'soundboard': return <Music2 size={11} />
    default: return <FileText size={11} />
  }
}

export default function Sidebar() {
  const {
    view, setView, currentCampaign,
    recentLocations, navigateBack, canGoBack, openTab,
    tabs, activeTabId, selectTab,
    sessions, drafts, allArticles, locationNames,
    campaignSubView, setCampaignSubView, setSearchOpen,
  } = useStore()
  // The sidebar sits under ActivePaneProvider, so its menus act on the focused
  // pane — which is what "open this recent thing" should mean from out here.
  const showMenu = useContextMenu()
  const menuCtx = useMenuCtx()

  const inCampaignContext =
    view === 'campaign' || view === 'session' || view === 'wiki' ||
    view === 'dm-notes' || view === 'loot-tables' || view === 'relations' || view === 'timeline' ||
    view === 'soundboard'
  const backAvailable = canGoBack()
  const [version, setVersion] = useState('')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true')

  const toggleCollapsed = () => setCollapsed(c => {
    localStorage.setItem('sidebar-collapsed', String(!c))
    return !c
  })

  useEffect(() => {
    window.api.getAppVersion().then(setVersion)
  }, [])

  // Recent is now a campaign-wide trail across every tab, minus wherever the
  // active tab already is — showing "go here" for the place you're looking at
  // would be noise.
  const activeLocation = tabs.find(t => t.id === activeTabId)?.location
  const historyToShow = recentLocations
    .filter(loc => !activeLocation || !sameLocation(loc, activeLocation))
    .map(loc => ({ loc, label: locationLabel(loc, { campaignName: currentCampaign?.name, sessions, drafts, allArticles, locationNames }) }))
    .filter(x => x.label !== null)
    .slice(0, 5)

  // Clicking a Recent row reuses a tab already pointed there, else navigates
  // the active tab — matching how the list behaved before tabs existed.
  const goToRecent = (loc: Location) => {
    const existing = tabs.find(t => sameLocation(t.location, loc))
    if (existing) selectTab(existing.id)
    else openTab(loc)
  }

  if (collapsed) {
    return (
      <aside style={{
        width: 54,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flexShrink: 0,
        userSelect: 'none',
        padding: '12px 0',
        gap: 3,
      }}>
        <button
          onClick={() => setView('campaigns')}
          title="All campaigns"
          style={{
            width: 32, height: 32, background: 'var(--gold)', borderRadius: 4, border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            marginBottom: 10, flexShrink: 0,
          }}
        >
          <Scroll size={18} color="var(--text-inverse)" strokeWidth={2} />
        </button>

        {inCampaignContext && currentCampaign && (
          <>
            <RailIcon icon={<Search size={16} />} title="Search campaign (Ctrl+S)" accent="var(--gold)"
              active={false} onClick={() => setSearchOpen(true)} />
            <RailIcon icon={<Layers size={16} />} title={`${currentCampaign.name} — campaign hub`} accent="var(--gold)"
              active={view === 'campaign' && campaignSubView === 'hub'}
              onClick={() => { setView('campaign'); setCampaignSubView('hub') }} />
            <RailIcon icon={<Scroll size={16} />} title="Sessions" accent="var(--gold)"
              active={view === 'campaign' && campaignSubView === 'sessions'}
              onClick={() => { setView('campaign'); setCampaignSubView('sessions') }} />
            {NAV_ITEMS.map(({ view: v, label, icon: Icon, accent }) => (
              <RailIcon key={v} icon={<Icon size={16} />} title={label} accent={accent}
                active={view === v} onClick={() => setView(v)} />
            ))}
          </>
        )}

        <button
          onClick={toggleCollapsed}
          title="Expand sidebar"
          style={{
            marginTop: 'auto', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            color: 'var(--text-muted)', transition: 'color var(--transition)',
          }}
          className="hover-gold"
        >
          <PanelLeftOpen size={16} />
        </button>
      </aside>
    )
  }

  return (
    <aside style={{
      width: 'var(--sidebar-width)',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      userSelect: 'none',
    }}>
      {/* Logo */}
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, background: 'var(--gold)', borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Scroll size={18} color="var(--text-inverse)" strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--gold)', letterSpacing: '0.05em' }}>DM Forge</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 1 }}>Dungeon Master</div>
          </div>
          <button
            onClick={toggleCollapsed}
            title="Collapse sidebar"
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', transition: 'color var(--transition)',
            }}
            className="hover-gold"
          >
            <PanelLeftClose size={15} />
          </button>
        </div>
      </div>

      {/* Campaign-wide search — a visible entry point for the Ctrl+S palette */}
      {currentCampaign && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => setSearchOpen(true)}
            title="Search articles, sessions, notes & map pins"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', background: 'var(--bg-elevated)',
              border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-ui)',
              cursor: 'pointer', transition: 'all var(--transition)',
            }}
            className="hover-gold-border"
          >
            <Search size={13} />
            <span style={{ flex: 1, textAlign: 'left' }}>Search campaign…</span>
            <kbd style={{
              fontFamily: 'var(--font-mono, monospace)', fontSize: 10,
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '0 5px', color: 'var(--text-muted)',
            }}>
              Ctrl+S
            </kbd>
          </button>
        </div>
      )}

      {/* Breadcrumb */}
      {inCampaignContext && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start', padding: '4px 6px', fontSize: 12 }}
            onClick={() => setView('campaigns')}
          >
            <ChevronLeft size={13} /> All Campaigns
          </button>

          {currentCampaign && (
            <div style={{ marginTop: 8 }}>
              {/* Parent campaign hub */}
              <button
                className="btn btn-ghost btn-sm"
                style={{
                  width: '100%', justifyContent: 'flex-start', padding: '5px 6px', fontSize: 12,
                  fontFamily: 'var(--font-display)', letterSpacing: '0.02em',
                  color: view === 'campaign' && campaignSubView === 'hub' ? 'var(--gold)' : 'var(--text-secondary)',
                }}
                onClick={() => { setView('campaign'); setCampaignSubView('hub') }}
                title={`${currentCampaign.name} — campaign hub`}
              >
                <Layers size={13} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentCampaign.name}
                </span>
              </button>

              {/* Sub-views */}
              <div style={{ marginTop: 4, paddingLeft: 9, marginLeft: 6, borderLeft: '1px solid var(--border)' }}>
              <button
                className="btn btn-ghost btn-sm"
                style={{
                  width: '100%', justifyContent: 'flex-start', padding: '4px 6px', fontSize: 12,
                  color: view === 'campaign' && campaignSubView === 'sessions' ? 'var(--gold)' : 'var(--text-secondary)',
                }}
                onClick={() => { setView('campaign'); setCampaignSubView('sessions') }}
              >
                <Scroll size={13} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Sessions
                </span>
              </button>

              {NAV_ITEMS.map(({ view: v, label, icon: Icon, accent }) => (
                <button
                  key={v}
                  className="btn btn-ghost btn-sm"
                  style={{
                    width: '100%', justifyContent: 'flex-start', padding: '4px 6px', fontSize: 12, marginTop: 2,
                    color: view === v ? accent : 'var(--text-secondary)',
                  }}
                  onClick={() => setView(v)}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navigation history */}
      {historyToShow.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px 4px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              <Clock size={10} /> Recent
            </div>
            {backAvailable && (
              <button
                onClick={navigateBack}
                title="Go back"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 11, padding: '2px 4px',
                  borderRadius: 'var(--radius-sm)', transition: 'color var(--transition)',
                }}
                className="hover-gold"
              >
                <ArrowLeft size={11} /> Back
              </button>
            )}
          </div>

          <div style={{ paddingBottom: 6 }}>
            {historyToShow.map(({ loc, label }, i) => {
              return (
                <button
                  key={i}
                  onClick={() => goToRecent(loc)}
                  onContextMenu={e => showMenu(e, buildLocationMenu(loc, menuCtx, {
                    label: label ? `Open “${truncate(label)}”` : 'Open',
                  }))}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 7,
                    padding: '5px 12px', background: 'none', border: 'none',
                    color: 'var(--text-muted)', fontSize: 11,
                    fontFamily: 'var(--font-ui)', cursor: 'pointer',
                    textAlign: 'left', transition: 'all 120ms ease',
                  }}
                  className="hover-bg hover-text-secondary"
                >
                  <span style={{ flexShrink: 0, opacity: 0.7 }}>{historyIcon(loc)}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {view === 'session' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderTop: '1px solid var(--border)' }}>
            <StoreMapProvider>
              <POIList />
            </StoreMapProvider>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ThemePicker />
        <TextPicker />
        <BackgroundPicker />
        <HintsToggle />
        <BackupButton />
        <ImportButton />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em', paddingLeft: 4 }}>v{version}</div>
      </div>
    </aside>
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

// ── Footer pickers ─────────────────────────────────────────────────────────────
// One generic popup picker drives the Theme / Text / Background pickers: a
// trigger row plus a swatch grid, closing on outside click like other menus.

interface FooterPickerOption {
  key: string
  label: string
  active: boolean
  swatchStyle?: React.CSSProperties
  swatchContent?: React.ReactNode
  onSelect: () => void
}

function FooterPicker({ icon, label, valueLabel, title, columns, options }: {
  icon: React.ReactNode
  label: string
  valueLabel: string
  title: string
  columns: number
  options: FooterPickerOption[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useMenuClose(open, ref, setOpen)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 10px', background: open ? 'var(--bg-elevated)' : 'transparent',
          border: `1px solid ${open ? 'var(--border-gold)' : 'var(--border-light)'}`,
          borderRadius: 'var(--radius-sm)',
          color: open ? 'var(--gold)' : 'var(--text-muted)',
          fontSize: 12, fontFamily: 'var(--font-ui)',
          cursor: 'pointer', transition: 'all var(--transition)',
        }}
        className={(!open) ? 'hover-gold' : ''}
      >
        {icon}
        {label}
        <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>{valueLabel}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-md)',
          padding: '10px',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 50,
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 2 }}>
            {title}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 6 }}>
            {options.map(o => (
              <button
                key={o.key}
                title={o.label}
                onClick={() => { o.onSelect(); setOpen(false) }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div style={{
                  width: 36, height: 28,
                  borderRadius: 4,
                  border: `2px solid ${o.active ? 'var(--gold)' : 'var(--border-light)'}`,
                  boxShadow: o.active ? 'var(--shadow-gold)' : 'none',
                  transition: 'border-color var(--transition)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  ...o.swatchStyle,
                }}>
                  {o.swatchContent}
                </div>
                <span style={{ fontSize: 9, color: o.active ? 'var(--gold)' : 'var(--text-muted)', letterSpacing: '0.04em' }}>
                  {o.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ThemePicker() {
  const { colorTheme, setColorTheme } = useStore()
  return (
    <FooterPicker
      icon={<Palette size={13} />} label="Theme" title="Colour theme"
      valueLabel={THEMES[colorTheme].label} columns={5}
      options={(Object.keys(THEMES) as ThemeKey[]).map(key => {
        const t = THEMES[key]
        return {
          key, label: t.label, active: colorTheme === key,
          swatchStyle: { background: t.bgPreview },
          swatchContent: (
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: t.accentPreview, boxShadow: `0 0 6px ${t.accentPreview}88`,
            }} />
          ),
          onSelect: () => setColorTheme(key),
        }
      })}
    />
  )
}

function TextPicker() {
  const { textTheme, setTextTheme } = useStore()
  return (
    <FooterPicker
      icon={<Type size={13} />} label="Text" title="Text colour"
      valueLabel={TEXT_THEMES[textTheme].label} columns={6}
      options={(Object.keys(TEXT_THEMES) as TextThemeKey[]).map(key => {
        const t = TEXT_THEMES[key]
        return {
          key, label: t.label, active: textTheme === key,
          // 'Aa' letterform in the palette's primary colour on a dark tile
          swatchStyle: {
            width: 30, background: 'var(--bg-base)',
            fontFamily: 'var(--font-display)', fontSize: 14, lineHeight: 1, color: t.preview,
          },
          swatchContent: 'Aa',
          onSelect: () => setTextTheme(key),
        }
      })}
    />
  )
}

function BackgroundPicker() {
  const { bgStyle, setBgStyle } = useStore()
  return (
    <FooterPicker
      icon={<Paintbrush size={13} />} label="Background" title="Background style"
      valueLabel={bgStyle.charAt(0).toUpperCase() + bgStyle.slice(1)} columns={5}
      options={BG_OPTIONS.map(opt => ({
        key: opt.value, label: opt.label, active: bgStyle === opt.value,
        swatchStyle: { background: opt.preview },
        onSelect: () => setBgStyle(opt.value),
      }))}
    />
  )
}

function HintsToggle() {
  const { showHints, setShowHints } = useStore()
  return (
    <button
      onClick={() => setShowHints(!showHints)}
      title={showHints ? 'Hide feature hints' : 'Show feature hints'}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px', background: 'transparent',
        border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)',
        color: showHints ? 'var(--gold)' : 'var(--text-muted)',
        fontSize: 12, fontFamily: 'var(--font-ui)', cursor: 'pointer',
        transition: 'all var(--transition)',
      }}
      className={(!showHints) ? 'hover-gold' : ''}
    >
      <Lightbulb size={13} />
      Hints
      <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>{showHints ? 'On' : 'Off'}</span>
    </button>
  )
}

function BackupButton() {
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { campaigns, loadCampaigns } = useStore()
  useMenuClose(menuOpen, menuRef, setMenuOpen)

  const handleBackup = async (campaignId: number | null) => {
    setMenuOpen(false)
    if (status === 'working') return
    setStatus('working')
    setMessage('')
    const result = await window.api.exportBackup(campaignId)
    if (result.canceled) { setStatus('idle'); return }
    if (result.success && result.path) {
      setStatus('done')
      setMessage(result.path.split(/[\\/]/).pop() || 'backup')
      setTimeout(() => setStatus('idle'), 4000)
    } else {
      setStatus('error')
      setMessage(result.error || 'Unknown error')
      setTimeout(() => setStatus('idle'), 4000)
    }
  }

  const openMenu = () => {
    if (status === 'working') return
    if (!menuOpen) loadCampaigns()
    setMenuOpen(o => !o)
  }

  const icon = status === 'done' ? <Check size={13} /> : status === 'error' ? <AlertCircle size={13} /> : <Download size={13} />
  const color = status === 'done' ? 'var(--teal)' : status === 'error' ? 'var(--danger)' : 'var(--text-muted)'
  const label = status === 'working' ? 'Backing up…' : status === 'done' ? 'Backup saved!' : status === 'error' ? 'Backup failed' : 'Export Backup'

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      {menuOpen && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
          zIndex: 60, overflow: 'hidden', maxHeight: 220, overflowY: 'auto',
        }}>
          <button onClick={() => handleBackup(null)} className="menu-item menu-item-sm">
            <Download size={12} /> Everything
          </button>
          {campaigns.length > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />}
          {campaigns.map(c => (
            <button key={c.id} onClick={() => handleBackup(c.id)} className="menu-item menu-item-sm">
              <Layers size={12} /> {c.name}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={openMenu}
        disabled={status === 'working'}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 10px', background: 'transparent',
          border: `1px solid ${status === 'idle' ? 'var(--border-light)' : status === 'done' ? 'rgba(42,122,110,0.4)' : status === 'error' ? 'rgba(139,37,51,0.4)' : 'var(--border-light)'}`,
          borderRadius: 'var(--radius-sm)', color,
          fontSize: 12, fontFamily: 'var(--font-ui)',
          cursor: status === 'working' ? 'wait' : 'pointer',
          transition: 'all var(--transition)',
        }}
        className={(status === 'idle') ? 'hover-gold' : ''}
      >
        {icon} {label}
      </button>
      {status === 'done' && message && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, paddingLeft: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          → {message}
        </div>
      )}
    </div>
  )
}

function ImportButton() {
  const [status, setStatus] = useState<'idle' | 'working' | 'confirm' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const loadCampaigns = useStore(s => s.loadCampaigns)

  const handleClick = () => {
    if (status === 'working') return
    if (status !== 'confirm') {
      setStatus('confirm')
      setTimeout(() => setStatus(s => (s === 'confirm' ? 'idle' : s)), 5000)
      return
    }
    doImport()
  }

  const doImport = async () => {
    setStatus('working')
    setMessage('')
    const result = await window.api.importBackup()
    if (result.canceled) { setStatus('idle'); return }
    if (!result.success) {
      setStatus('error')
      setMessage(result.error || 'Unknown error')
      setTimeout(() => setStatus('idle'), 4000)
      return
    }
    await loadCampaigns()
    const parts: string[] = []
    if (result.imported?.length) parts.push(`${result.imported.length} imported`)
    if (result.replaced?.length) parts.push(`${result.replaced.length} replaced`)
    if (result.skipped?.length) parts.push(`${result.skipped.length} kept current`)
    setStatus('done')
    setMessage(parts.join(', ') || 'nothing imported')
    setTimeout(() => setStatus('idle'), 5000)
  }

  const icon = status === 'error' ? <AlertCircle size={13} /> : status === 'done' ? <Check size={13} /> : <Upload size={13} />
  const color = status === 'confirm' ? 'var(--gold)' : status === 'error' ? 'var(--danger)' : status === 'done' ? 'var(--teal)' : 'var(--text-muted)'
  const borderColor = status === 'confirm' ? 'var(--border-gold)' : status === 'error' ? 'rgba(139,37,51,0.4)' : status === 'done' ? 'rgba(42,122,110,0.4)' : 'var(--border-light)'
  const label = status === 'working' ? 'Importing…' : status === 'confirm' ? 'Click again to confirm' : status === 'error' ? 'Import failed' : status === 'done' ? 'Import complete!' : 'Import Backup'

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={status === 'working'}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 10px', background: 'transparent',
          border: `1px solid ${borderColor}`,
          borderRadius: 'var(--radius-sm)', color,
          fontSize: 12, fontFamily: 'var(--font-ui)',
          cursor: status === 'working' ? 'wait' : 'pointer',
          transition: 'all var(--transition)',
        }}
        className={(status === 'idle') ? 'hover-gold' : ''}
      >
        {icon} {label}
      </button>
      {status === 'confirm' && (
        <div style={{ fontSize: 10, color: 'var(--gold-dim)', marginTop: 4, paddingLeft: 4, lineHeight: 1.4 }}>
          Campaigns are imported alongside your current ones. If one already exists you'll be asked which version to keep.
        </div>
      )}
      {status === 'done' && message && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, paddingLeft: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          → {message}
        </div>
      )}
      {status === 'error' && message && (
        <div style={{ fontSize: 10, color: 'var(--danger)', marginTop: 4, paddingLeft: 4 }}>
          {message}
        </div>
      )}
    </div>
  )
}