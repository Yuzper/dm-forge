import { useState, useEffect } from 'react'
import { Upload, Check } from 'lucide-react'

interface CampaignMapImage {
  image_path: string
  name: string
  label: string
}

interface Props {
  campaignId: number
  onPickExisting: (result: { path: string; name: string }) => void
  onUploadNew: () => void
  onClose: () => void
}

function Thumbnail({ image, selected, onClick }: {
  image: CampaignMapImage; selected: boolean; onClick: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    window.api.getImagePath(image.image_path).then(setUrl)
  }, [image.image_path])

  return (
    <div
      onClick={onClick}
      style={{
        cursor: 'pointer',
        borderRadius: 'var(--radius-md)',
        border: `2px solid ${selected ? 'var(--gold)' : 'var(--border-light)'}`,
        overflow: 'hidden',
        background: 'var(--bg-base)',
        transition: 'border-color 120ms ease',
        position: 'relative',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)' }}
    >
      <div style={{ width: '100%', paddingBottom: '60%', position: 'relative', background: '#0a0908' }}>
        {url && (
          <img
            src={url}
            alt={image.name}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover', display: 'block',
            }}
          />
        )}
        {selected && (
          <div style={{
            position: 'absolute', top: 6, right: 6,
            background: 'var(--gold)', borderRadius: '50%',
            width: 20, height: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Check size={12} color="#0d0b09" strokeWidth={3} />
          </div>
        )}
      </div>
      <div style={{ padding: '6px 8px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
          {image.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
          {image.label}
        </div>
      </div>
    </div>
  )
}

export default function MapPickerModal({ campaignId, onPickExisting, onUploadNew, onClose }: Props) {
  const [images, setImages] = useState<CampaignMapImage[]>([])
  const [selected, setSelected] = useState<CampaignMapImage | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.getCampaignMapImages(campaignId).then(imgs => {
      setImages(imgs)
      setLoading(false)
    })
  }, [campaignId])

  const handleConfirm = () => {
    if (!selected) return
    onPickExisting({ path: selected.image_path, name: selected.name })
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 580, maxWidth: '90vw' }}>
        <div className="modal-title">Add Map</div>

        {/* Upload new */}
        <button
          onClick={onUploadNew}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 14px', marginBottom: 16,
            background: 'var(--bg-base)', border: '1px dashed var(--border-light)',
            borderRadius: 'var(--radius-md)', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 13,
            transition: 'all 120ms ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--gold)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
          }}
        >
          <Upload size={16} />
          Upload new image…
        </button>

        {/* Existing images */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Loading…
          </div>
        ) : images.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            No previously imported maps in this campaign.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10 }}>
              Reuse existing image
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
              maxHeight: 320, overflowY: 'auto', paddingRight: 4,
            }}>
              {images.map(img => (
                <Thumbnail
                  key={img.image_path}
                  image={img}
                  selected={selected?.image_path === img.image_path}
                  onClick={() => setSelected(s => s?.image_path === img.image_path ? null : img)}
                />
              ))}
            </div>
          </>
        )}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          {selected && (
            <button className="btn btn-primary" onClick={handleConfirm}>
              Use Selected
            </button>
          )}
        </div>
      </div>
    </div>
  )
}