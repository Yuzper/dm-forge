// path: src/components/Sidebar.tsx
import { useEffect, useState } from 'react'
import { useStore } from '../store/store'
import {
  ChevronLeft, Map, Scroll, Download, Upload, Check,
  AlertCircle, BookOpen, Clock, ArrowLeft, Timer,
  FileText, Layers, Sparkles, ShoppingBag, Network, Paintbrush, Lightbulb,
} from 'lucide-react'
import POIList from './POIList'
import type { HistoryEntry } from '../store/store'
import { StoreMapProvider } from '../context/MapContext'

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
    view === 'dm-notes' || view === 'loot-tables' || view === 'relations' || view === 'timeline'
  const canGoBack = navigationHistory.length >= 2
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.api.getAppVersion().then(setVersion)
  }, [])

  const historyToShow = navigationHistory.slice(0, -1).reverse()

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
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--gold)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
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
  { value: 'none',      label: 'None',      preview: '#0d0b09' },
  { value: 'parchment', label: 'Parchment', preview: 'repeating-linear-gradient(45deg, #141008 0px, #1a1509 4px, #0d0b06 8px)' },
  { value: 'vignette',  label: 'Vignette',  preview: 'radial-gradient(circle, #1c160f 0%, #050403 100%)' },
  { value: 'stone',     label: 'Stone',     preview: 'repeating-linear-gradient(0deg, #0d0b09 0px, #0d0b09 9px, #111009 10px), repeating-linear-gradient(90deg, #0d0b09 0px, #0d0b09 14px, #111009 15px)' },
  { value: 'wood',      label: 'Wood',      preview: 'repeating-linear-gradient(90deg, #0a0806 0px, #100c08 2px, #0a0806 4px, #0a0806 10px)' },
]

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
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLElement).style.color = 'var(--gold)' }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
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
      onMouseEnter={e => { if (!showHints) (e.currentTarget as HTMLElement).style.color = 'var(--gold)' }}
      onMouseLeave={e => { if (!showHints) (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
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

  const handleBackup = async () => {
    if (status === 'working') return
    setStatus('working')
    setMessage('')
    const result = await window.api.exportBackup()
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

  const icon = status === 'done' ? <Check size={13} /> : status === 'error' ? <AlertCircle size={13} /> : <Download size={13} />
  const color = status === 'done' ? 'var(--teal)' : status === 'error' ? '#e05555' : 'var(--text-muted)'
  const label = status === 'working' ? 'Backing up…' : status === 'done' ? 'Backup saved!' : status === 'error' ? 'Backup failed' : 'Export Backup'

  return (
    <div>
      <button
        onClick={handleBackup}
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
        onMouseEnter={e => { if (status === 'idle') (e.currentTarget as HTMLElement).style.color = 'var(--gold)' }}
        onMouseLeave={e => { if (status === 'idle') (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
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
  const [status, setStatus] = useState<'idle' | 'working' | 'confirm' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleClick = () => {
    if (status === 'working') return
    if (status !== 'confirm') {
      setStatus('confirm')
      setTimeout(() => setStatus('idle'), 5000)
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
    }
  }

  const icon = status === 'error' ? <AlertCircle size={13} /> : <Upload size={13} />
  const color = status === 'confirm' ? 'var(--gold)' : status === 'error' ? '#e05555' : 'var(--text-muted)'
  const borderColor = status === 'confirm' ? 'var(--border-gold)' : status === 'error' ? 'rgba(139,37,51,0.4)' : 'var(--border-light)'
  const label = status === 'working' ? 'Importing…' : status === 'confirm' ? 'Click again to confirm' : status === 'error' ? 'Import failed' : 'Import Backup'

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
        onMouseEnter={e => { if (status === 'idle') (e.currentTarget as HTMLElement).style.color = 'var(--gold)' }}
        onMouseLeave={e => { if (status === 'idle') (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
      >
        {icon} {label}
      </button>
      {status === 'confirm' && (
        <div style={{ fontSize: 10, color: 'var(--gold-dim)', marginTop: 4, paddingLeft: 4, lineHeight: 1.4 }}>
          This will replace all current data and restart the app.
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