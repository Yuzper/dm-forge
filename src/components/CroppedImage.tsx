// path: src/components/CroppedImage.tsx
// A hover card's picture strip: shows the article's chosen crop, or the default
// framing (top-weighted) when none is set. The strip is PREVIEW_ASPECT wide, so
// a crop box drawn at that aspect maps onto it without stretching; a crop saved
// for an older strip shape is reshaped once the image's size is known.
import { useState, type CSSProperties } from 'react'
import { DEFAULT_FOCUS_Y, fitCropToAspect, type CropRect } from '../utils/previewCrop'

export function CroppedImage({ src, crop, height, style }: {
  src: string
  crop?: CropRect | null
  height: number
  style?: CSSProperties
}) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  // Until the image reports its size the crop can't be reshaped safely, so the
  // default framing shows for that first moment.
  const fitted = crop && dims ? fitCropToAspect(crop, dims.w, dims.h) : null
  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) =>
    setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })

  return (
    <div style={{ position: 'relative', width: '100%', height, overflow: 'hidden', ...style }}>
      {fitted ? (
        // Scale the image so the crop fills the strip, then shift it into place.
        <img src={src} draggable={false} onLoad={onLoad} style={{
          position: 'absolute', maxWidth: 'none',
          width: `${100 / fitted.w}%`, height: `${100 / fitted.h}%`,
          left: `${(-fitted.x / fitted.w) * 100}%`, top: `${(-fitted.y / fitted.h) * 100}%`,
        }} />
      ) : (
        <img src={src} draggable={false} onLoad={onLoad} style={{
          width: '100%', height: '100%', display: 'block',
          objectFit: 'cover', objectPosition: `50% ${DEFAULT_FOCUS_Y * 100}%`,
        }} />
      )}
    </div>
  )
}
