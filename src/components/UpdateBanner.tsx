// components/UpdateBanner.tsx
import { useEffect, useState } from 'react'

type UpdateState = 'idle' | 'available' | 'ready'

export function UpdateBanner() {
  const [state, setState] = useState<UpdateState>('idle')
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.api.onUpdateAvailable((info) => {
      setState('available')
      setVersion(info.version)
    })
    window.api.onUpdateDownloaded((info) => {
      setState('ready')
      setVersion(info.version)
    })
  }, [])

  if (state === 'idle') return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-gold)',
      borderRadius: 'var(--radius-md)',
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      boxShadow: 'var(--shadow-lg)',
      zIndex: 9999,
      fontSize: 13,
      color: 'var(--text-primary)',
    }}>
      {state === 'available' ? (
        <>
          <span style={{ color: 'var(--text-secondary)' }}>
            v{version} is downloading…
          </span>
        </>
      ) : (
        <>
          <span>v{version} is ready to install</span>
          <button
            onClick={() => window.api.installUpdate()}
            style={{
              background: 'var(--gold)',
              color: '#000',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 12px',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'var(--font-ui)',
            }}
          >
            Restart & update
          </button>
          <button
            onClick={() => setState('idle')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            Later
          </button>
        </>
      )}
    </div>
  )
}