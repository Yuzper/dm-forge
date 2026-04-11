// path: src/components/SectionDivider.tsx
export default function SectionDivider({ label, margin }: { label: string; margin?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: margin ?? '8px 0 20px' }}>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border-light), transparent)' }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>
        {label}
      </div>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, var(--border-light), transparent)' }} />
    </div>
  )
}