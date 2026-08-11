// path: src/components/sidebar/SidebarFooter.tsx
// A slim bar of buttons, replacing the six full-width setting rows the sidebar
// used to end with. The controls themselves live in SettingsModal — these are
// just the two doors into it, each landing on the tab it used to be a popover
// for. The version sits in the tail.
import { useState } from 'react'
import { Database, Settings, PanelLeftClose } from 'lucide-react'
import { useStore } from '../../store/store'

export default function SidebarFooter({ rail = false, version = '', onCollapse }: {
  /** Rail mode stacks the buttons instead of laying them out in a row. */
  rail?: boolean
  version?: string
  /** Expanded sidebar only — the rail renders its own expand button. */
  onCollapse?: () => void
}) {
  const setSettingsTab = useStore(s => s.setSettingsTab)

  const buttons = (
    <>
      <FooterButton
        icon={<Settings size={15} />} title="Appearance & settings"
        onClick={() => setSettingsTab('appearance')}
      />
      <FooterButton
        icon={<Database size={15} />} title="Backup & restore"
        onClick={() => setSettingsTab('data')}
      />
    </>
  )

  if (rail) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        {buttons}
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2,
      padding: '6px 8px', borderTop: '1px solid var(--border)', flexShrink: 0,
    }}>
      {onCollapse && (
        <FooterButton icon={<PanelLeftClose size={15} />} title="Collapse sidebar" onClick={onCollapse} />
      )}
      {buttons}
      <div style={{
        marginLeft: 'auto', paddingRight: 4, fontSize: 10, letterSpacing: '0.04em',
        color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        v{version}
      </div>
    </div>
  )
}

function FooterButton({ icon, title, onClick }: {
  icon: React.ReactNode
  title: string
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 30, height: 30, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        color: hovered ? 'var(--gold)' : 'var(--text-muted)',
        transition: 'background var(--transition), color var(--transition)',
      }}
    >
      {icon}
    </button>
  )
}
