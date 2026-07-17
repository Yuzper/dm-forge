// path: src/components/SoundboardWidget.tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useStore } from '../store/store'
import { Music2, X, Minus, ChevronDown, Volume2, SlidersHorizontal, Play, Square } from 'lucide-react'
import type { SoundBoard, Sound, SoundCategory } from '../types'

// ── Helpers ────────────────────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<SoundCategory, string> = {
  ambience: '#2a7a6e',
  music:    '#c8a84b',
  effect:   '#e88c3a',
}

const CROSSFADE_MS = 1500

/** Ease-in-out curve so crossfades don't sound abrupt at the edges */
function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

// Sentinel id for the virtual, always-present bundled default board
const DEFAULT_BOARD_ID = -1
const defaultBoard: SoundBoard = {
  id: DEFAULT_BOARD_ID, campaign_id: -1, name: 'Default Sounds', sort_order: -1, created_at: '',
}

// ── Soundboard Widget ──────────────────────────────────────────────────────────

export default function SoundboardWidget() {
  const { view, currentCampaign, currentSession, soundboardMinimized, setSoundboardMinimized, setSoundboardOpen } = useStore()

  // Session-aware open state: expand while viewing a session, auto-minimise (but
  // keep playing) when you navigate elsewhere in the campaign. Keyed on `view`
  // changes only, so a manual minimise/expand within a view is preserved, and
  // returning to a session re-expands it.
  useEffect(() => {
    setSoundboardMinimized(view !== 'session')
  }, [view, setSoundboardMinimized])

  const [boards, setBoards]             = useState<SoundBoard[]>([])
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null)
  const [sounds, setSounds]             = useState<Sound[]>([])
  const [soundUrls, setSoundUrls]       = useState<Map<number, string>>(new Map())
  const [boardOpen, setBoardOpen]       = useState(false)
  const [mixer, setMixer]               = useState(false)   // per-sound volume view

  // Debounced persistence for on-the-fly per-sound volume changes
  const persistVolRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Playback state
  const [playingAmbience, setPlayingAmbience] = useState<number | null>(null)
  const [playingMusic, setPlayingMusic]       = useState<number | null>(null)
  const [playingEffects, setPlayingEffects]   = useState<Set<number>>(new Set()) // transient one-shots
  const [loopingEffects, setLoopingEffects]   = useState<Set<number>>(new Set()) // persistent looping effects
  const [volume, setVolume]                   = useState(0.8)

  // Error state — sounds whose file couldn't be played
  const [erroredSounds, setErroredSounds] = useState<Set<number>>(new Set())

  // Audio element refs keyed by sound id
  const audioRefs    = useRef<Map<number, HTMLAudioElement>>(new Map())
  // rAF handle for in-progress crossfade
  const crossfadeRef = useRef<number | null>(null)
  // per-sound rAF handles for fade-outs on stop
  const fadeRefs     = useRef<Map<number, number>>(new Map())
  // cloned Audio elements for in-flight one-shot effects (so they can be stopped)
  const effectCloneRefs = useRef<Map<number, HTMLAudioElement>>(new Map())

  // Drag state
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const widgetRef = useRef<HTMLDivElement>(null)

  // Tracks the (session, linked-board) pair we've already auto-applied, so manual
  // board switches aren't overridden — but a *changed* link re-applies instantly
  const appliedLinkRef = useRef<string | null>(null)

  // Stable ref so the keydown listener always calls the latest toggleSound
  // without needing to re-register on every state change
  const toggleSoundRef = useRef<(s: Sound) => void>(() => {})

  // Cancel any running crossfade (used on board switch, close, and unmount)
  const cancelCrossfade = useCallback(() => {
    if (crossfadeRef.current !== null) {
      cancelAnimationFrame(crossfadeRef.current)
      crossfadeRef.current = null
    }
  }, [])

  // Cleanup on unmount — cancel any animations and stop audio
  useEffect(() => () => {
    cancelCrossfade()
    fadeRefs.current.forEach(h => cancelAnimationFrame(h))
    audioRefs.current.forEach(a => a.pause())
    effectCloneRefs.current.forEach(c => c.pause())
  }, [cancelCrossfade])

  // Load boards
  useEffect(() => {
    if (!currentCampaign) return
    window.api.getSoundBoards(currentCampaign.id).then(bs => {
      setBoards(bs)
      // Pick first user board if any, else fall back to the bundled default board
      if (!activeBoardId) setActiveBoardId(bs.length > 0 ? bs[0].id : DEFAULT_BOARD_ID)
    })
  }, [currentCampaign?.id])

  // Auto-select a session's linked board. Keyed on the (session, board) pair:
  // applies on session entry AND instantly when the link changes for the current
  // session — but a manual board switch (which doesn't change the link) is kept.
  useEffect(() => {
    const sid    = currentSession?.id ?? null
    const linked = currentSession?.soundboard_id ?? null
    if (linked == null) return
    const key = `${sid}:${linked}`
    if (key !== appliedLinkRef.current && boards.some(b => b.id === linked)) {
      appliedLinkRef.current = key
      setActiveBoardId(linked)
    }
  }, [currentSession?.id, currentSession?.soundboard_id, boards])

  // Load sounds + resolve URLs when board changes
  useEffect(() => {
    if (activeBoardId === null) return
    cancelCrossfade()
    fadeRefs.current.forEach(h => cancelAnimationFrame(h))
    fadeRefs.current.clear()
    audioRefs.current.forEach(a => { a.pause(); a.currentTime = 0 })
    audioRefs.current.clear()
    effectCloneRefs.current.forEach(c => { c.pause(); c.currentTime = 0 })
    effectCloneRefs.current.clear()
    setPlayingAmbience(null)
    setPlayingMusic(null)
    setPlayingEffects(new Set())
    setLoopingEffects(new Set())
    setErroredSounds(new Set())

    if (activeBoardId === DEFAULT_BOARD_ID) {
      // Virtual default board — scanned live from the bundled folder.
      // Synthesise Sound rows with negative ids and ready-to-play urls.
      window.api.getDefaultSounds().then(defaults => {
        const synthesised: Sound[] = defaults.map((d, i) => ({
          id: -(i + 1), board_id: DEFAULT_BOARD_ID, name: d.name,
          category: d.category, file_path: d.url, hotkey: '',
          volume: 1, loop: d.category === 'effect' ? 0 : 1, sort_order: i, created_at: '',
        }))
        setSounds(synthesised)
        setSoundUrls(new Map(synthesised.map(s => [s.id, s.file_path])))
      })
      return
    }

    window.api.getSounds(activeBoardId).then(async loaded => {
      setSounds(loaded)
      const entries = await Promise.all(
        loaded.map(async s => [s.id, await window.api.getImagePath(s.file_path)] as [number, string])
      )
      setSoundUrls(new Map(entries))
    })
  }, [activeBoardId, cancelCrossfade])

  // Effective volume = master × per-sound volume
  const effVol = useCallback((s: Sound) => volume * (s.volume ?? 1), [volume])
  const effLoop = (s: Sound) => !!s.loop

  // Lookup from sound id → sound, for re-applying per-sound volume on master change
  const soundsById = useMemo(() => new Map(sounds.map(s => [s.id, s])), [sounds])

  // Keep volume in sync on all active audio (respecting each sound's own volume)
  useEffect(() => {
    audioRefs.current.forEach((a, id) => {
      const s = soundsById.get(id)
      a.volume = volume * (s?.volume ?? 1)
    })
  }, [volume, soundsById])

  // Adjust a single sound's volume on the fly — applies live (via the effect above)
  // and persists to the DB (debounced) for real sounds; defaults are in-memory only.
  const setSoundVolume = useCallback((id: number, vol: number) => {
    setSounds(prev => prev.map(s => s.id === id ? { ...s, volume: vol } : s))
    if (id > 0) {
      if (persistVolRef.current) clearTimeout(persistVolRef.current)
      persistVolRef.current = setTimeout(() => { window.api.updateSound(id, { volume: vol }) }, 400)
    }
  }, [])

  // ── Audio helpers ─────────────────────────────────────────────────────────────

  const cancelFade = useCallback((id: number) => {
    const h = fadeRefs.current.get(id)
    if (h !== undefined) { cancelAnimationFrame(h); fadeRefs.current.delete(id) }
  }, [])

  /** Fade a sound to silence over `duration`, then pause + reset. */
  const fadeOutStop = useCallback((id: number, duration = CROSSFADE_MS, onDone?: () => void) => {
    const audio = audioRefs.current.get(id)
    if (!audio) { onDone?.(); return }
    cancelFade(id)
    const startVol  = audio.volume
    const startTime = performance.now()
    const frame = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration)
      audio.volume = Math.max(0, startVol * (1 - easeInOut(t)))
      if (t < 1) {
        fadeRefs.current.set(id, requestAnimationFrame(frame))
      } else {
        fadeRefs.current.delete(id)
        audio.pause(); audio.currentTime = 0
        onDone?.()
      }
    }
    fadeRefs.current.set(id, requestAnimationFrame(frame))
  }, [cancelFade])

  const getOrCreateAudio = useCallback((sound: Sound): HTMLAudioElement | null => {
    const url = soundUrls.get(sound.id)
    if (!url) return null
    cancelFade(sound.id)   // in case it was mid fade-out
    let audio = audioRefs.current.get(sound.id)
    if (!audio) {
      audio = new Audio(url)
      audio.volume = effVol(sound)
      audio.onerror = () => {
        audioRefs.current.delete(sound.id)
        setPlayingAmbience(prev => prev === sound.id ? null : prev)
        setPlayingMusic(prev => prev === sound.id ? null : prev)
        setLoopingEffects(prev => { const n = new Set(prev); n.delete(sound.id); return n })
        setErroredSounds(prev => new Set([...prev, sound.id]))
      }
      audioRefs.current.set(sound.id, audio)
    }
    return audio
  }, [soundUrls, effVol, cancelFade])

  /** Crossfade from `fadeOut` → `fadeIn` over CROSSFADE_MS. */
  const startCrossfade = useCallback((
    fadeOut: HTMLAudioElement | null,
    fadeIn: HTMLAudioElement,
    targetVol: number,
    loop: boolean,
    onEndedIfOnce?: () => void,
  ) => {
    cancelCrossfade()
    const startVol  = fadeOut?.volume ?? 0
    const startTime = performance.now()

    fadeIn.volume = 0
    fadeIn.loop   = loop
    fadeIn.currentTime = 0
    fadeIn.onended = loop ? null : (() => onEndedIfOnce?.())
    fadeIn.play().catch(() => {})

    const frame = (now: number) => {
      const t    = Math.min(1, (now - startTime) / CROSSFADE_MS)
      const ease = easeInOut(t)
      if (fadeOut) fadeOut.volume = Math.max(0, startVol * (1 - ease))
      fadeIn.volume = Math.min(targetVol, targetVol * ease)

      if (t < 1) {
        crossfadeRef.current = requestAnimationFrame(frame)
      } else {
        crossfadeRef.current = null
        if (fadeOut) { fadeOut.pause(); fadeOut.currentTime = 0 }
        fadeIn.volume = targetVol
      }
    }
    crossfadeRef.current = requestAnimationFrame(frame)
  }, [cancelCrossfade])

  // Stop all — used on close (instant; the fade happens before this runs)
  const stopAll = useCallback(() => {
    cancelCrossfade()
    fadeRefs.current.forEach(h => cancelAnimationFrame(h))
    fadeRefs.current.clear()
    audioRefs.current.forEach(a => { a.pause(); a.currentTime = 0 })
    audioRefs.current.clear()
    effectCloneRefs.current.forEach(c => { c.pause(); c.currentTime = 0 })
    effectCloneRefs.current.clear()
    setPlayingAmbience(null)
    setPlayingMusic(null)
    setPlayingEffects(new Set())
    setLoopingEffects(new Set())
  }, [cancelCrossfade])

  const handleClose = () => {
    // Fade everything that's looping, then hard-stop + close
    const active = [playingAmbience, playingMusic, ...loopingEffects].filter((x): x is number => x !== null)
    active.forEach(id => fadeOutStop(id, 600))
    setTimeout(() => { stopAll(); setSoundboardOpen(false) }, active.length > 0 ? 650 : 0)
  }

  // ── Play / stop ───────────────────────────────────────────────────────────────

  const toggleSound = (sound: Sound) => {
    // Retry: clear error state so the button is treated as fresh
    if (erroredSounds.has(sound.id)) {
      setErroredSounds(prev => { const n = new Set(prev); n.delete(sound.id); return n })
    }
    const looping = effLoop(sound)

    if (sound.category === 'ambience' || sound.category === 'music') {
      const isAmb    = sound.category === 'ambience'
      const playing  = isAmb ? playingAmbience : playingMusic
      const setSlot  = isAmb ? setPlayingAmbience : setPlayingMusic

      if (playing === sound.id) {
        // Stop with fade-out
        cancelCrossfade()
        fadeOutStop(sound.id)
        setSlot(null)
      } else {
        const fadeOut = playing !== null ? audioRefs.current.get(playing) ?? null : null
        const fadeIn  = getOrCreateAudio(sound)
        if (!fadeIn) return
        startCrossfade(fadeOut, fadeIn, effVol(sound), looping, () => setSlot(null))
        setSlot(sound.id)
      }

    } else {
      // Effect
      if (looping) {
        // Single-instance looping toggle
        if (loopingEffects.has(sound.id)) {
          fadeOutStop(sound.id)
          setLoopingEffects(prev => { const n = new Set(prev); n.delete(sound.id); return n })
        } else {
          const audio = getOrCreateAudio(sound)
          if (!audio) return
          audio.loop = true
          audio.volume = effVol(sound)
          audio.currentTime = 0
          audio.play().catch(() => {})
          setLoopingEffects(prev => new Set(prev).add(sound.id))
        }
      } else {
        // One-shot — stop if already playing (check the ref, not React state,
        // so the stop path is reliable even before the next render commits)
        if (effectCloneRefs.current.has(sound.id)) {
          const clone = effectCloneRefs.current.get(sound.id)!
          clone.pause()
          clone.currentTime = 0
          effectCloneRefs.current.delete(sound.id)
          setPlayingEffects(prev => { const n = new Set(prev); n.delete(sound.id); return n })
          return
        }
        const url = soundUrls.get(sound.id)
        if (!url) return
        const clone = new Audio(url)
        clone.volume = effVol(sound)
        clone.play().catch(() => {})
        effectCloneRefs.current.set(sound.id, clone)
        setPlayingEffects(prev => new Set(prev).add(sound.id))
        clone.onended = () => {
          effectCloneRefs.current.delete(sound.id)
          setPlayingEffects(prev => { const n = new Set(prev); n.delete(sound.id); return n })
        }
      }
    }
  }

  // ── Hotkeys ───────────────────────────────────────────────────────────────────

  // Keep ref current so the listener always calls the latest toggleSound
  // without needing to re-register on every playback state change
  useEffect(() => { toggleSoundRef.current = toggleSound })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire while typing in any input or editable element
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const key   = e.key.toUpperCase()
      const sound = sounds.find(s => s.hotkey?.toUpperCase() === key)
      if (sound) {
        e.preventDefault()
        toggleSoundRef.current(sound)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [sounds]) // only re-register when the board's sound list changes

  // ── Drag ──────────────────────────────────────────────────────────────────────

  const onDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, select, input')) return
    e.preventDefault()
    const rect = widgetRef.current!.getBoundingClientRect()
    const ox = e.clientX - rect.left
    const oy = e.clientY - rect.top
    const onMove = (me: MouseEvent) => setPos({
      x: Math.max(0, Math.min(window.innerWidth  - WIDGET_W, me.clientX - ox)),
      y: Math.max(0, Math.min(window.innerHeight - 36,       me.clientY - oy)),
    })
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  // Default board is pinned at the top, ahead of the campaign's own boards
  const allBoards   = [defaultBoard, ...boards]
  const activeBoard = allBoards.find(b => b.id === activeBoardId)
  const byCategory  = (cat: SoundCategory) => sounds.filter(s => s.category === cat)
  const isPlaying   = (s: Sound) =>
    s.category === 'ambience' ? playingAmbience === s.id :
    s.category === 'music'    ? playingMusic    === s.id :
    playingEffects.has(s.id) || loopingEffects.has(s.id)

  const widgetStyle: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, zIndex: 1000 }
    : { position: 'fixed', right: 24, bottom: 24, zIndex: 1000 }

  const WIDGET_W = 320

  // ── Minimised ─────────────────────────────────────────────────────────────────

  if (soundboardMinimized) {
    return (
      <div
        ref={widgetRef}
        style={{
          ...widgetStyle, width: WIDGET_W,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-gold)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 10px', cursor: 'grab', userSelect: 'none',
        }}
        onMouseDown={onDragStart}
      >
        <Music2 size={13} color="var(--gold-dim)" style={{ flexShrink: 0 }} />
        <span style={{
          fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: 'var(--font-display)', color: 'var(--gold)', letterSpacing: '0.04em',
        }}>
          {activeBoard?.name ?? 'Soundboard'}
        </span>
        {(playingAmbience !== null || playingMusic !== null) && (
          <span style={{ fontSize: 9, color: 'var(--gold-dim)', letterSpacing: '0.08em', fontFamily: 'var(--font-ui)', textTransform: 'uppercase' }}>
            ♪ playing
          </span>
        )}
        <button onClick={() => setSoundboardMinimized(false)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex' }}
          title="Expand">
          <ChevronDown size={13} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <button onClick={handleClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex' }}
          title="Close">
          <X size={13} />
        </button>
      </div>
    )
  }

  // ── Expanded ──────────────────────────────────────────────────────────────────

  return (
    <div
      ref={widgetRef}
      style={{
        ...widgetStyle, width: WIDGET_W,
        background: 'var(--bg-surface)', border: '1px solid var(--border-gold)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg), 0 0 0 1px rgba(200,168,75,0.06)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', userSelect: 'none', fontFamily: 'var(--font-ui)',
      }}
    >
      {/* Header / drag handle */}
      <div onMouseDown={onDragStart} style={{
        padding: '9px 10px', background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border-gold)',
        display: 'flex', alignItems: 'center', gap: 8,
        cursor: 'grab', flexShrink: 0,
      }}>
        <Music2 size={13} color="var(--gold-dim)" style={{ flexShrink: 0 }} />

        {allBoards.length > 1 ? (
          <div style={{ position: 'relative', flex: 1 }}>
            <button
              onClick={() => setBoardOpen(v => !v)}
              title="Click to switch soundboard"
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                background: boardOpen ? 'var(--bg-hover)' : 'var(--bg-surface)',
                border: '1px solid var(--border-gold)', borderRadius: 'var(--radius-sm)',
                cursor: 'pointer', padding: '3px 8px',
                color: 'var(--gold)', fontSize: 12, textAlign: 'left',
                fontFamily: 'var(--font-display)', letterSpacing: '0.04em',
                transition: 'background var(--transition)',
              }}
              className="hover-bg"
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {activeBoard?.name ?? '—'}
              </span>
              <ChevronDown size={13} color="var(--gold-dim)" style={{ flexShrink: 0, transform: boardOpen ? 'rotate(180deg)' : 'none', transition: 'transform var(--transition)' }} />
            </button>
            {boardOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4,
                background: 'var(--bg-elevated)', border: '1px solid var(--border-gold)',
                borderRadius: 'var(--radius-sm)', zIndex: 10, minWidth: 160,
                boxShadow: 'var(--shadow-md)',
              }}>
                {allBoards.map(b => (
                  <button key={b.id}
                    onClick={() => { setActiveBoardId(b.id); setBoardOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                      padding: '7px 12px',
                      background: b.id === activeBoardId ? 'var(--gold-glow)' : 'none',
                      border: 'none', cursor: 'pointer',
                      color: b.id === activeBoardId ? 'var(--gold)' : 'var(--text-secondary)',
                      fontFamily: 'var(--font-ui)', fontSize: 12,
                    }}
                    className={(b.id !== activeBoardId) ? 'hover-bg' : ''}
                  >
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                    {b.id === DEFAULT_BOARD_ID && (
                      <span style={{
                        fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase',
                        color: 'var(--gold-dim)', border: '1px solid var(--border-gold)',
                        borderRadius: 2, padding: '0 4px', flexShrink: 0,
                      }}>
                        default
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <span style={{
            flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: 'var(--font-display)', color: 'var(--gold)', letterSpacing: '0.04em',
          }}>
            {activeBoard?.name ?? 'Soundboard'}
          </span>
        )}

        <button onClick={() => setMixer(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: mixer ? 'var(--gold)' : 'var(--text-muted)', padding: 2, display: 'flex', flexShrink: 0, transition: 'color var(--transition)' }}
          className={(!mixer) ? 'hover-text-secondary' : ''}
          title={mixer ? 'Back to pads' : 'Per-sound volume'}><SlidersHorizontal size={13} /></button>
        <button onClick={() => setSoundboardMinimized(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', flexShrink: 0, transition: 'color var(--transition)' }}
          className="hover-text-secondary"
          title="Minimise"><Minus size={13} /></button>
        <button onClick={handleClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', flexShrink: 0, transition: 'color var(--transition)' }}
          className="hover-danger"
          title="Close"><X size={13} /></button>
      </div>

      {/* Sound buttons */}
      <div style={{ padding: '10px 10px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(['ambience', 'music', 'effect'] as SoundCategory[]).map(cat => {
          const catSounds = byCategory(cat)
          if (catSounds.length === 0) return null
          const color = CATEGORY_COLOR[cat]
          return (
            <div key={cat}>
              <div style={{
                fontSize: 9, letterSpacing: '1.8px', textTransform: 'uppercase',
                marginBottom: 5, paddingLeft: 1, paddingBottom: 3,
                fontFamily: 'var(--font-display)',
                color, borderBottom: `1px solid ${color}30`,
              }}>
                {cat}
              </div>
              {mixer ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {catSounds.map(s => {
                    const active = isPlaying(s)
                    return (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          onClick={() => toggleSound(s)}
                          title={active ? 'Stop' : 'Play'}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                            border: `1px solid ${active ? color : 'var(--border-light)'}`,
                            background: active ? `${color}25` : 'transparent',
                            color: active ? color : 'var(--text-muted)',
                          }}
                        >
                          {active ? <Square size={9} /> : <Play size={9} />}
                        </button>
                        <span style={{
                          flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          color: active ? 'var(--gold)' : 'var(--text-secondary)',
                        }}>
                          {s.name}
                        </span>
                        <input
                          type="range" min={0} max={1} step={0.01}
                          value={s.volume ?? 1}
                          onChange={e => setSoundVolume(s.id, parseFloat(e.target.value))}
                          title={`${Math.round((s.volume ?? 1) * 100)}%`}
                          style={{ width: 84, accentColor: color, cursor: 'pointer', flexShrink: 0 }}
                        />
                      </div>
                    )
                  })}
                </div>
              ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {catSounds.map(s => {
                  const active  = isPlaying(s)
                  const errored = erroredSounds.has(s.id)
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleSound(s)}
                      title={errored
                        ? `${s.name} — file error, click to retry`
                        : s.hotkey ? `${s.name} [${s.hotkey}]` : s.name}
                      style={{
                        padding: '4px 9px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 11,
                        cursor: 'pointer',
                        transition: 'all var(--transition)',
                        border: `1px solid ${errored ? 'var(--danger-border)' : active ? 'var(--border-gold)' : 'var(--border-light)'}`,
                        background: errored ? 'var(--danger-bg)' : active ? 'var(--gold-glow)' : 'var(--bg-elevated)',
                        color: errored ? 'var(--danger-soft)' : active ? 'var(--gold)' : 'var(--text-secondary)',
                        display: 'flex', alignItems: 'center', gap: 5,
                        maxWidth: 140, overflow: 'hidden',
                        fontFamily: 'var(--font-ui)',
                      }}
                      className={(!active && !errored) ? 'hover-bg' : ''}
                    >
                      {errored ? (
                        <span style={{ fontSize: 10, flexShrink: 0, lineHeight: 1 }}>⚠</span>
                      ) : (
                        <span style={{
                          width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                          background: active ? color : 'var(--border-light)',
                          transition: 'background var(--transition)',
                        }} />
                      )}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.name}
                      </span>
                      {s.hotkey && !errored && (
                        <span style={{
                          fontSize: 9,
                          color: active ? 'var(--gold-dim)' : 'var(--text-muted)',
                          border: `1px solid ${active ? 'var(--border-gold)' : 'var(--border-light)'}`,
                          borderRadius: 2, padding: '0 3px', flexShrink: 0,
                          lineHeight: '14px', fontFamily: 'var(--font-ui)',
                        }}>
                          {s.hotkey}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              )}
            </div>
          )
        })}

        {sounds.length === 0 && (
          <div style={{
            padding: '14px 0', textAlign: 'center',
            fontSize: 12, color: 'var(--text-muted)',
            fontFamily: 'var(--font-body)', fontStyle: 'italic',
          }}>
            No sounds in this board
          </div>
        )}
      </div>

      {/* Volume */}
      <div style={{
        padding: '6px 10px 10px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderTop: '1px solid var(--border)', marginTop: 2,
      }}>
        <Volume2 size={11} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        <input
          type="range" min={0} max={1} step={0.01}
          value={volume}
          onChange={e => setVolume(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--gold)', cursor: 'pointer' }}
        />
        <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 28, textAlign: 'right', flexShrink: 0, fontFamily: 'var(--font-ui)' }}>
          {Math.round(volume * 100)}%
        </span>
      </div>
    </div>
  )
}
