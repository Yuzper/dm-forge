// path: src/components/MapCanvas.tsx
import { useState, useRef, useEffect, useCallback } from 'react'
import { useStore } from '../store/store'
import { MapPin, Plus, Maximize } from 'lucide-react'
import { getPoiColor, getPoiIcon } from '../constants/POITypes'
import type { POI } from '../types'

const MIN_SCALE = 0.2
const MAX_SCALE = 8
const ZOOM_SPEED = 0.001

function POIMarker({ poi, onSelect, isSelected, editMode, scale }: {
  poi: POI; onSelect: (p: POI) => void; isSelected: boolean; editMode: boolean; scale: number
}) {
  const { updatePOI } = useStore()
  const [showLabel, setShowLabel] = useState(false)

  const dragStart = useRef<{ mouseX: number; mouseY: number; poiX: number; poiY: number } | null>(null)
  const hasDragged = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const onMoveRef = useRef<((e: MouseEvent) => void) | null>(null)
  const onUpRef = useRef<((e: MouseEvent) => void) | null>(null)

  useEffect(() => {
    return () => {
      if (onMoveRef.current) document.removeEventListener('mousemove', onMoveRef.current)
      if (onUpRef.current) document.removeEventListener('mouseup', onUpRef.current)
    }
  }, [])

  const Icon = getPoiIcon(poi.poi_type)
  const color = getPoiColor(poi.poi_type)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!editMode) return
    e.stopPropagation()
    e.preventDefault()

    const outer = containerRef.current?.closest('[data-map-outer]') as HTMLElement
    if (!outer) return
    const rect = outer.getBoundingClientRect()

    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, poiX: poi.x, poiY: poi.y }
    hasDragged.current = false

    const onMove = (ev: MouseEvent) => {
      if (!dragStart.current) return
      if (Math.abs(ev.clientX - dragStart.current.mouseX) > 3 ||
          Math.abs(ev.clientY - dragStart.current.mouseY) > 3) {
        hasDragged.current = true
      }
      const dx = ((ev.clientX - dragStart.current.mouseX) / (rect.width * scale)) * 100
      const dy = ((ev.clientY - dragStart.current.mouseY) / (rect.height * scale)) * 100
      const newX = Math.max(0, Math.min(100, dragStart.current.poiX + dx))
      const newY = Math.max(0, Math.min(100, dragStart.current.poiY + dy))
      useStore.setState(s => ({
        pois: s.pois.map(p => p.id === poi.id ? { ...p, x: newX, y: newY } : p),
        selectedPOI: s.selectedPOI?.id === poi.id ? { ...s.selectedPOI!, x: newX, y: newY } : s.selectedPOI,
      }))
    }

    const onUp = async (ev: MouseEvent) => {
      if (!dragStart.current) return
      const dx = ((ev.clientX - dragStart.current.mouseX) / (rect.width * scale)) * 100
      const dy = ((ev.clientY - dragStart.current.mouseY) / (rect.height * scale)) * 100
      const newX = Math.max(0, Math.min(100, dragStart.current.poiX + dx))
      const newY = Math.max(0, Math.min(100, dragStart.current.poiY + dy))
      dragStart.current = null
      if (hasDragged.current) await updatePOI(poi.id, { x: newX, y: newY })
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      onMoveRef.current = null
      onUpRef.current = null
    }

    onMoveRef.current = onMove
    onUpRef.current = onUp
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [editMode, poi, updatePOI, scale])

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!hasDragged.current) onSelect(poi)
    hasDragged.current = false
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onMouseEnter={() => setShowLabel(true)}
      onMouseLeave={() => setShowLabel(false)}
      style={{
        position: 'absolute',
        left: `${poi.x}%`,
        top: `${poi.y}%`,
        transform: `translate(-50%, -50%) scale(${1 / scale})`,
        zIndex: isSelected ? 20 : 10,
        cursor: editMode ? 'grab' : 'pointer',
      }}
    >
      <div style={{
        width: isSelected ? 34 : 28, height: isSelected ? 34 : 28,
        borderRadius: '50%',
        background: 'hsla(0, 0%, 0%, 0.90)',
        border: `2px solid ${color}`,
        boxShadow: isSelected ? `0 0 0 3px ${color}66, 0 4px 12px rgba(0,0,0,0.7)` : `0 2px 8px rgba(0,0,0,0.5)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'width 150ms ease, height 150ms ease, box-shadow 150ms ease',
        pointerEvents: 'none',
      }}>
        <Icon size={isSelected ? 14 : 12} color={color} strokeWidth={2} />
      </div>

      {isSelected && (
        <div style={{
          position: 'absolute', inset: -6, borderRadius: '50%',
          border: `1px solid ${color}44`,
          animation: 'pulse 2s infinite', pointerEvents: 'none',
        }} />
      )}

      {(showLabel || isSelected) && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', border: `1px solid ${color}44`,
          borderRadius: 4, padding: '3px 8px',
          fontSize: 11, fontFamily: 'var(--font-ui)', fontWeight: 600,
          color: 'var(--text-primary)', whiteSpace: 'nowrap',
          boxShadow: 'var(--shadow-sm)', pointerEvents: 'none',
        }}>
          {poi.label}
        </div>
      )}
    </div>
  )
}

export default function MapCanvas({ readMode }: { readMode?: boolean }) {
  const { currentMap, pois, selectedPOI, selectPOI, createPOI } = useStore()
  const editMode = !readMode
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)

  const [scale, setScaleState] = useState(1)
  const [offset, setOffsetState] = useState({ x: 0, y: 0 })
  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })

  const setScale = (v: number) => { scaleRef.current = v; setScaleState(v) }
  const setOffset = (v: { x: number; y: number }) => { offsetRef.current = v; setOffsetState(v) }

  const panStart = useRef<{ mouseX: number; mouseY: number; ox: number; oy: number } | null>(null)
  const hasPanned = useRef(false)
  const isPanning = useRef(false)
  const [cursorStyle, setCursorStyle] = useState('grab')

  const outerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
    setImageLoaded(false)
    if (!currentMap) { setImageUrl(null); return }
    window.api.getImagePath(currentMap.image_path).then(setImageUrl)
  }, [currentMap?.id])

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const outer = outerRef.current
    if (!outer) return
    const rect = outer.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const currentScale = scaleRef.current
    const rawDelta = -e.deltaY * ZOOM_SPEED
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, currentScale * (1 + rawDelta)))
    const zoomFactor = newScale / currentScale
    const currentOffset = offsetRef.current
    setScale(newScale)
    setOffset({
      x: cx - zoomFactor * (cx - currentOffset.x),
      y: cy - zoomFactor * (cy - currentOffset.y),
    })
  }, [])

  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    panStart.current = { mouseX: e.clientX, mouseY: e.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y }
    hasPanned.current = false
    isPanning.current = false
    setCursorStyle('grabbing')
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!panStart.current) return
    const dx = e.clientX - panStart.current.mouseX
    const dy = e.clientY - panStart.current.mouseY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasPanned.current = true
      isPanning.current = true
    }
    if (isPanning.current) {
      setOffset({ x: panStart.current.ox + dx, y: panStart.current.oy + dy })
    }
  }

  const handleMouseUp = () => {
    panStart.current = null
    isPanning.current = false
    setCursorStyle(editMode ? 'crosshair' : 'grab')
  }

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    if (hasPanned.current) { hasPanned.current = false; return }
    if (!editMode || readMode) return
    const outer = outerRef.current
    if (!outer) return
    const rect = outer.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const x = ((cx - offsetRef.current.x) / (rect.width * scaleRef.current)) * 100
    const y = ((cy - offsetRef.current.y) / (rect.height * scaleRef.current)) * 100
    if (x < 0 || x > 100 || y < 0 || y > 100) return
    await createPOI(x, y)
  }, [editMode, createPOI])

const zoomCenter = () => {
  const outer = outerRef.current
  if (!outer) return { cx: 0, cy: 0 }
  return { cx: outer.offsetWidth / 2, cy: outer.offsetHeight / 2 }
}

  const zoomIn = () => {
    const { cx, cy } = zoomCenter()
    const newScale = Math.min(MAX_SCALE, scaleRef.current * 1.25)
    const zf = newScale / scaleRef.current
    setOffset({ x: cx - zf * (cx - offsetRef.current.x), y: cy - zf * (cy - offsetRef.current.y) })
    setScale(newScale)
  }

  const zoomOut = () => {
    const { cx, cy } = zoomCenter()
    const newScale = Math.max(MIN_SCALE, scaleRef.current * 0.8)
    const zf = newScale / scaleRef.current
    setOffset({ x: cx - zf * (cx - offsetRef.current.x), y: cy - zf * (cy - offsetRef.current.y) })
    setScale(newScale)
  }

  const resetView = () => { setScale(1); setOffset({ x: 0, y: 0 }) }

  if (!currentMap) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-muted)' }}>
        <MapPin size={40} strokeWidth={1} color="var(--border-light)" />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', marginBottom: 4 }}>No map selected</div>
          <div style={{ fontSize: 13 }}>Import a map image to get started</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

      {/* Zoom controls */}
      <div style={{
        position: 'absolute', top: 12, right: 12, zIndex: 30,
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(21,18,14,0.85)', border: '1px solid var(--border-light)',
        borderRadius: 4, padding: '4px 8px', backdropFilter: 'blur(8px)',
      }}>
        <button onClick={zoomOut} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', fontWeight: 300 }}>−</button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 36, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <button onClick={zoomIn} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', fontWeight: 300 }}>+</button>
        <div style={{ width: 1, height: 14, background: 'var(--border-light)', margin: '0 2px' }} />
        <button onClick={resetView} title="Reset view" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 2px' }}>
          <Maximize size={11} />
        </button>
      </div>

      {/* Outer container — receives pan and wheel events */}
      <div
        data-map-outer
        ref={outerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: cursorStyle, background: '#0a0908', userSelect: 'none' }}
      >
        {/* Inner container — this is what gets transformed */}
        <div style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: '0 0',
        }}>
          {imageUrl && (
            <img
              src={imageUrl}
              alt={currentMap.name}
              onLoad={() => setImageLoaded(true)}
              style={{
                width: '100%', height: '100%', objectFit: 'contain', display: 'block',
                opacity: imageLoaded ? 1 : 0, transition: 'opacity 300ms ease',
                pointerEvents: 'none', userSelect: 'none',
              }}
              draggable={false}
            />
          )}

          {imageLoaded && pois.map(poi => (
            <POIMarker
              key={poi.id}
              poi={poi}
              onSelect={selectPOI}
              isSelected={selectedPOI?.id === poi.id}
              editMode={editMode}
              scale={scale}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 0.2; transform: scale(1.3); }
        }
      `}</style>
    </div>
  )
}