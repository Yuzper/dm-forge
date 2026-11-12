// path: src/utils/mapAnimation.ts
// The menu actions for a map's animated background, shared by every surface
// that lists maps (world map, article maps, session tabs).
import { measureMedia } from '../components/map/MapAnimation'
import { isVideoUrl } from '../components/map/MapAnimation'
import type { GameMap, PickedMap, VTTImportResult } from '../types'

/**
 * Pick an animation for a map. Returns the updated row, or null if cancelled or
 * it failed (failure is reported to the user here).
 *
 * Pins, walls and the grid are stored as percentages of the still, so an
 * animation with a different shape would slide out from under all of them. The
 * file is kept either way -- the DM may know better -- but they are told.
 */
export async function chooseMapAnimation(map: GameMap): Promise<GameMap | null> {
  const res = await window.api.setMapAnimation(map.id)
  if (!res) return null
  if ('error' in res) { window.alert(res.error); return null }

  const updated = res.map
  try {
    const [stillUrl, animUrl] = await Promise.all([
      window.api.getImagePath(updated.image_path),
      window.api.getImagePath(updated.animation_path as string),
    ])
    const [still, anim] = await Promise.all([measureMedia(stillUrl), measureMedia(animUrl)])
    if (anim.w === 0 || anim.h === 0) {
      window.alert('That file could not be played here. GIF, MP4 (H.264) and WebM work; some other video codecs do not.')
    } else if (still.w > 0 && still.h > 0) {
      const drift = Math.abs(anim.w / anim.h - still.w / still.h) / (still.w / still.h)
      if (drift > 0.02) {
        window.alert(
          'This animation is a different shape from the map image, so pins, walls and the grid will not line up with it. ' +
          'Export the animated version from the same scene and framing as the still.',
        )
      }
    }
  } catch { /* the check is advice, never a blocker */ }
  return updated
}

export const removeMapAnimation = (map: GameMap) => window.api.clearMapAnimation(map.id)

// ── Importing an animation as a map in its own right ─────────────────────────

const STILL_MAX_WIDTH = 4000

/**
 * Grab a frame from near the start of a video. Frame zero is often a fade-in or
 * a black card, so this looks a little way in -- far enough to be past that,
 * near enough to still be the opening shot. Resolves a JPEG data URL, or null
 * if the codec cannot be decoded here.
 */
export function captureEarlyFrame(url: string): Promise<string | null> {
  return new Promise(resolve => {
    const v = document.createElement('video')
    v.muted = true
    v.preload = 'auto'
    v.crossOrigin = 'anonymous'
    const done = (r: string | null) => { v.removeAttribute('src'); v.load(); resolve(r) }
    const draw = () => {
      try {
        const scale = Math.min(1, STILL_MAX_WIDTH / v.videoWidth)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(v.videoWidth * scale)
        canvas.height = Math.round(v.videoHeight * scale)
        canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height)
        done(canvas.toDataURL('image/jpeg', 0.85))
      } catch { done(null) }
    }
    v.onerror = () => done(null)
    v.onloadedmetadata = () => {
      if (!v.videoWidth || !v.videoHeight) { done(null); return }
      const t = Number.isFinite(v.duration) && v.duration > 0 ? Math.min(0.5, v.duration / 2) : 0
      v.onseeked = draw
      v.currentTime = t
    }
    v.src = url
    // A video that never produces metadata would hang the import forever.
    setTimeout(() => done(null), 15000)
  })
}

/**
 * Turn what the picker returned into something a map row can be made from.
 * Plain images pass straight through; a GIF already has its still; a video gets
 * one captured here. Returns null (after telling the user) if no still could be
 * made, and removes the copied file so a failed import leaves nothing behind.
 */
export async function finishAnimatedPick(picked: PickedMap | null): Promise<PickedMap | null> {
  if (!picked || !picked.animation_path || picked.path) return picked

  const animUrl = await window.api.getImagePath(picked.animation_path)
  const frame = isVideoUrl(animUrl) ? await captureEarlyFrame(animUrl) : null
  const still = frame ? await window.api.saveMapStill(frame, picked.name) : null
  if (!still) {
    await window.api.discardUpload(picked.animation_path)
    window.alert('That file could not be turned into a map: this app could not read a frame from it. MP4 (H.264), WebM and GIF work; some other video codecs do not.')
    return null
  }
  return { ...picked, path: still }
}

/**
 * Import a VTT scene, completing the still for a scene that came with a video
 * and no picture (Dungeon Alchemist's animated Universal VTT export). The main
 * process finds the video beside the scene file and asks for a frame; this
 * captures one and lets it finish the import.
 */
export async function importVTTWithFrame(owner: { kind: 'article' | 'session' | 'campaign'; id: number }): Promise<VTTImportResult> {
  const first = await window.api.importVTTMap(owner)
  if (!first.needsFrame) return first

  const { scenePath, animationSrc } = first.needsFrame
  const frame = await captureEarlyFrame('file://' + animationSrc.replace(/\\/g, '/'))
  if (!frame) {
    return {
      success: false,
      error: 'The animation next to this scene could not be read, so there is no picture to use. MP4 (H.264), WebM and GIF work; some other video codecs do not.',
    }
  }
  return window.api.importVTTMap(owner, { scenePath, animationSrc, stillDataUrl: frame })
}
