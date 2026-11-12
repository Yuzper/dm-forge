// path: src/components/map/MapAnimation.tsx
// An animated map (GIF, MP4 or WebM) drawn over the map's still.
//
// The still (maps.image_path) stays the thing the app measures, pins and fogs
// against; this only has to look the same on top of it. It is therefore laid
// over the still with the same object-fit, and fades in once it has a frame so
// the still shows through while a video loads instead of a black flash.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { GameMap } from '../../types'

const VIDEO_EXT = /\.(mp4|webm|m4v|mov)(\?|#|$)/i

export const isVideoUrl = (url: string) => VIDEO_EXT.test(url)

/** Fills its (positioned) parent with the same fit the still uses. */
export const ANIMATION_FILL: CSSProperties = {
  position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
}

export default function MapAnimation({ url, style = ANIMATION_FILL }: { url: string; style?: CSSProperties }) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(false), [url])

  const shared: CSSProperties = {
    pointerEvents: 'none', userSelect: 'none',
    opacity: ready ? 1 : 0, transition: 'opacity 300ms ease',
    ...style,
  }

  return isVideoUrl(url)
    ? (
      <video
        src={url} autoPlay loop muted playsInline disablePictureInPicture
        onLoadedData={() => setReady(true)}
        style={shared}
      />
    )
    : <img src={url} alt="" draggable={false} onLoad={() => setReady(true)} style={shared} />
}

/** The map's animation as a displayable URL, or null for a plain still map. */
export function useMapAnimationUrl(map: Pick<GameMap, 'id' | 'animation_path'> | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  const rel = map?.animation_path ?? null
  useEffect(() => {
    let cancelled = false
    if (!rel) { setUrl(null); return }
    window.api.getImagePath(rel).then(u => { if (!cancelled) setUrl(u) })
    return () => { cancelled = true }
  }, [map?.id, rel])
  return url
}

/** Natural size of a GIF or video, for checking it matches its still. */
export function measureMedia(url: string): Promise<{ w: number; h: number }> {
  return new Promise(resolve => {
    if (isVideoUrl(url)) {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.onloadedmetadata = () => resolve({ w: v.videoWidth, h: v.videoHeight })
      v.onerror = () => resolve({ w: 0, h: 0 })
      v.src = url
    } else {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => resolve({ w: 0, h: 0 })
      img.src = url
    }
  })
}
