import type { ReactNode, CSSProperties } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
  style?: CSSProperties
}

export default function EmptyState({ icon, title, description, action, style }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 16, color: 'var(--text-muted)',
      ...style,
    }}>
      {icon}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', marginBottom: 4 }}>
          {title}
        </div>
        {description && <div style={{ fontSize: 13 }}>{description}</div>}
      </div>
      {action}
    </div>
  )
}
