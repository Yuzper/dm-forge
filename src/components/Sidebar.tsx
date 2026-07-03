// path: src/components/Sidebar.tsx
import { useEffect, useState, useRef } from 'react'
import { useStore } from '../store/store'
import { useMenuClose } from '../hooks/useMenuClose'
import {
  ChevronLeft, Scroll, Download, Upload, Check,
  AlertCircle, BookOpen, Clock, ArrowLeft,
  FileText, Layers, Sparkles, ShoppingBag, Network, Paintbrush, Lightbulb, Music2, Palette, Type,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import POIList from './POIList'
import type { HistoryEntry } from '../store/store'
import { StoreMapProvider } from '../context/MapContext'
import { THEMES, TEXT_THEMES } from '../constants/themes'
import type { ThemeKey, TextThemeKey } from '../constants/themes'

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

function historyIcon(entry: HistoryEntry) {
  switch (entry.type) {
    case 'campaign': return <Layers size={11} />
    case 'session':  return <Scroll size={11} />
    case 'wiki':     return <BookOpen size={11} />
    case 'article':  return <FileText size={11} />
    case 'relations': return <Network size={11} />
    case 'dm-notes': return <Sparkles size={11} />
    case 'loot-tables': return <ShoppingBag size={11} />
    case 'timeline': return <Clock size={11} />
  }
}

export default function Sidebar() {
  const {
    view, setView, currentCampaign,
    navigationHistory, navigateBack, navigateToHistoryEntry,
    campaignSubView, setCampaignSubView,
  } = useStore()

  const inCampaignContext =
    view === 'campaign' || view === 'session' || view === 'wiki' ||
    view === 'dm-notes' || view === 'loot-tables' || view === 'relations' || view === 'timeline' ||
    view === 'soundboard'
  const canGoBack = navigationHistory.length >= 2
  const [version, setVersion] = useState('')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true')

  const toggleCollapsed = () => setCollapsed(c => {
    localStorage.setItem('sidebar-collapsed', String(!c))
    return !c
  })

  useEffect(() => {
    window.api.getAppVersion().then(setVersion)
  }, [])

  const historyToShow = navigationHistory.slice(0, -1).reverse()

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
            <RailIcon icon={<Layers size={16} />} title={`${currentCampaign.name} — campaign hub`} accent="var(--gold)"
              active={view === 'campaign' && campaignSubView === 'hub'}
              onClick={() => { setView('campaign'); setCampaignSubView('hub') }} />
            <RailIcon icon={<Scroll size={16} />} title="Sessions" accent="var(--gold)"
              active={view === 'campaign' && campaignSubView === 'sessions'}
              onClick={() => { setView('campaign'); setCampaignSubView('sessions') }} />
            <RailIcon icon={<BookOpen size={16} />} title="Wiki" accent="#5b9fe8"
              active={view === 'wiki'} onClick={() => setView('wiki')} />
            <RailIcon icon={<Sparkles size={16} />} title="DM Notes" accent="#9b7de8"
              active={view === 'dm-notes'} onClick={() => setView('dm-notes')} />
            <RailIcon icon={<ShoppingBag size={16} />} title="Loot Tables" accent="#49c185"
              active={view === 'loot-tables'} onClick={() => setView('loot-tables')} />
            <RailIcon icon={<Network size={16} />} title="Relations" accent="#b07de8"
              active={view === 'relations'} onClick={() => setView('relations')} />
            <RailIcon icon={<Clock size={16} />} title="Timeline" accent="#e88c3a"
              active={view === 'timeline'} onClick={() => setView('timeline')} />
            <RailIcon icon={<Music2 size={16} />} title="Soundboard" accent="#3b82f6"
              active={view === 'soundboard'} onClick={() => setView('soundboard')} />
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

              <button
                className="btn btn-ghost btn-sm"
                style={{
                  width: '100%', justifyContent: 'flex-start', padding: '4px 6px', fontSize: 12, marginTop: 2,
                  color: view === 'wiki' ? '#5b9fe8' : 'var(--text-secondary)',
                }}
                onClick={() => setView('wiki')}
              >
                <BookOpen size={13} /> Wiki
              </button>

              <button
                className="btn btn-ghost btn-sm"
                style={{
                  width: '100%', justifyContent: 'flex-start', padding: '4px 6px', fontSize: 12, marginTop: 2,
                  color: view === 'dm-notes' ? '#9b7de8' : 'var(--text-secondary)',
                }}
                onClick={() => setView('dm-notes')}
              >
                <Sparkles size={13} /> DM Notes
              </button>

              <button
                className="btn btn-ghost btn-sm"
                style={{
                  width: '100%', justifyContent: 'flex-start', padding: '4px 6px', fontSize: 12, marginTop: 2,
                  color: view === 'loot-tables' ? '#49c185' : 'var(--text-secondary)',
                }}
                onClick={() => setView('loot-tables')}
              >
                <ShoppingBag size={13} /> Loot Tables
              </button>

              <button
                className="btn btn-ghost btn-sm"
                style={{
                  width: '100%', justifyContent: 'flex-start', padding: '4px 6px', fontSize: 12, marginTop: 2,
                  color: view === 'relations' ? '#b07de8' : 'var(--text-secondary)',
                }}
                onClick={() => setView('relations')}
              >
                <Network size={13} /> Relations
              </button>

              <button
                className="btn btn-ghost btn-sm"
                style={{
                  width: '100%', justifyContent: 'flex-start', padding: '4px 6px', fontSize: 12, marginTop: 2,
                  color: view === 'timeline' ? '#e88c3a' : 'var(--text-secondary)',
                }}
                onClick={() => setView('timeline')}
              >
                <Clock size={13} /> Timeline
              </button>

              <button
                className="btn btn-ghost btn-sm"
                style={{
                  width: '100%', justifyContent: 'flex-start', padding: '4px 6px', fontSize: 12, marginTop: 2,
                  color: view === 'soundboard' ? '#3b82f6' : 'var(--text-secondary)',
                }}
                onClick={() => setView('soundboard')}
              >
                <Music2 size={13} /> Soundboard
              </button>
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
            {canGoBack && (
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
            {historyToShow.map((entry, i) => {
              const originalIndex = navigationHistory.length - 2 - i
              return (
                <button
                  key={originalIndex}
                  onClick={() => navigateToHistoryEntry(originalIndex)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 7,
                    padding: '5px 12px', background: 'none', border: 'none',
                    color: 'var(--text-muted)', fontSize: 11,
                    fontFamily: 'var(--font-ui)', cursor: 'pointer',
                    textAlign: 'left', transition: 'all 120ms ease',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
                    ;(e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'
                  }}
                  onMouseLeave={e => {
                    ;(e.currentTarget as HTMLElement).style.background = 'none'
                    ;(e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
                  }}
                >
                  <span style={{ flexShrink: 0, opacity: 0.7 }}>{historyIcon(entry)}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {entry.label}
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

function ThemePicker() {
  const { colorTheme, setColorTheme } = useStore()
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
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
        <Palette size={13} />
        Theme
        <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>{THEMES[colorTheme].label}</span>
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
            Colour theme
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {(Object.keys(THEMES) as ThemeKey[]).map(key => {
              const t = THEMES[key]
              const active = colorTheme === key
              return (
                <button
                  key={key}
                  title={t.label}
                  onClick={() => { setColorTheme(key); setOpen(false) }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  {/* Swatch: bg colour with accent dot */}
                  <div style={{
                    width: 36, height: 28,
                    borderRadius: 4,
                    background: t.bgPreview,
                    border: `2px solid ${active ? 'var(--gold)' : 'var(--border-light)'}`,
                    boxShadow: active ? 'var(--shadow-gold)' : 'none',
                    transition: 'border-color var(--transition)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: t.accentPreview,
                      boxShadow: `0 0 6px ${t.accentPreview}88`,
                    }} />
                  </div>
                  <span style={{ fontSize: 9, color: active ? 'var(--gold)' : 'var(--text-muted)', letterSpacing: '0.04em' }}>
                    {t.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function TextPicker() {
  const { textTheme, setTextTheme } = useStore()
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
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
        <Type size={13} />
        Text
        <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>{TEXT_THEMES[textTheme].label}</span>
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
            Text colour
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
            {(Object.keys(TEXT_THEMES) as TextThemeKey[]).map(key => {
              const t = TEXT_THEMES[key]
              const active = textTheme === key
              return (
                <button
                  key={key}
                  title={t.label}
                  onClick={() => { setTextTheme(key); setOpen(false) }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  {/* Swatch: 'Aa' letterform in the palette's primary colour on a dark tile */}
                  <div style={{
                    width: 30, height: 28,
                    borderRadius: 4,
                    background: 'var(--bg-base)',
                    border: `2px solid ${active ? 'var(--gold)' : 'var(--border-light)'}`,
                    boxShadow: active ? 'var(--shadow-gold)' : 'none',
                    transition: 'border-color var(--transition)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-display)', fontSize: 14, lineHeight: 1,
                    color: t.preview,
                  }}>
                    Aa
                  </div>
                  <span style={{ fontSize: 9, color: active ? 'var(--gold)' : 'var(--text-muted)', letterSpacing: '0.04em' }}>
                    {t.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function BackgroundPicker() {
  const { bgStyle, setBgStyle } = useStore()
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
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
        <Paintbrush size={13} />
        Background
        <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7, textTransform: 'capitalize' }}>{bgStyle}</span>
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
            Background style
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {BG_OPTIONS.map(opt => (
              <button
                key={opt.value}
                title={opt.label}
                onClick={() => { setBgStyle(opt.value); setOpen(false) }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div style={{
                  width: 36, height: 28,
                  borderRadius: 4,
                  background: opt.preview,
                  border: `2px solid ${bgStyle === opt.value ? 'var(--gold)' : 'var(--border-light)'}`,
                  boxShadow: bgStyle === opt.value ? 'var(--shadow-gold)' : 'none',
                  transition: 'border-color var(--transition)',
                }} />
                <span style={{ fontSize: 9, color: bgStyle === opt.value ? 'var(--gold)' : 'var(--text-muted)', letterSpacing: '0.04em' }}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
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
  const color = status === 'done' ? 'var(--teal)' : status === 'error' ? '#e05555' : 'var(--text-muted)'
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
  const color = status === 'confirm' ? 'var(--gold)' : status === 'error' ? '#e05555' : status === 'done' ? 'var(--teal)' : 'var(--text-muted)'
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
        <div style={{ fontSize: 10, color: '#e05555', marginTop: 4, paddingLeft: 4 }}>
          {message}
        </div>
      )}
    </div>
  )
}