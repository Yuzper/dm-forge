// path: src/pages/DMNotesPage.tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useStore } from '../store/store'
import {
  Sparkles, Plus, Trash2, MoreHorizontal, FileText, Check,
  ArrowLeft, FolderPlus, ChevronDown, ChevronUp, Pencil, ArrowUpCircle, ArrowDownCircle,
} from 'lucide-react'
import RichEditor from '../components/RichEditor'
import { useConfirmDelete } from '../hooks/useConfirmDelete'

// ── Types ──────────────────────────────────────────────────────────────────────

interface DMNoteGroup {
  id: number
  campaign_id: number
  name: string
  color: string
  sort_order: number
  created_at: string
}

interface DMNotePageSummary {
  id: number
  campaign_id: number
  title: string
  group_id: number | null
  sort_order: number
  created_at: string
  updated_at: string
}

interface DMNotePageFull extends DMNotePageSummary {
  content: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const GROUP_COLORS = [
  '#9b7de8', '#5b9fe8', '#5bbfb0', '#49c185',
  '#c8a84b', '#e88c3a', '#e05555', '#8a8a8a',
]

const menuItemStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
  padding: '7px 12px', background: 'none', border: 'none',
  color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'var(--font-ui)',
  cursor: 'pointer', textAlign: 'left', transition: 'all 120ms ease',
}

// ── Create Group Modal ─────────────────────────────────────────────────────────

function CreateGroupModal({ campaignId, onClose, onCreate }: {
  campaignId: number
  onClose: () => void
  onCreate: (group: DMNoteGroup) => void
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(GROUP_COLORS[0])
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    const group = await window.api.createDMNoteGroup(campaignId, name.trim(), color)
    onCreate(group)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">New Group</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="input-group">
            <label className="input-label">Group Name</label>
            <input
              className="input"
              placeholder="One-shot ideas…"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          <div className="input-group">
            <label className="input-label">Colour</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {GROUP_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 22, height: 22, borderRadius: '50%', background: c, padding: 0,
                    border: `2px solid ${color === c ? 'var(--text-primary)' : 'transparent'}`,
                    cursor: 'pointer', transition: 'border 120ms ease',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim() || saving}>
            {saving ? 'Creating…' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page Menu ──────────────────────────────────────────────────────────────────

function PageMenu({ page, groups, isFirst, isLast, onDelete, onMoveUp, onMoveDown, onMoveToGroup }: {
  page: DMNotePageSummary
  groups: DMNoteGroup[]
  isFirst: boolean
  isLast: boolean
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onMoveToGroup: (groupId: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const { confirming, trigger } = useConfirmDelete()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Build move-to targets: all groups + ungrouped, excluding current
  const moveTargets: { label: string; groupId: number | null }[] = [
    ...(page.group_id !== null ? [{ label: 'Ungrouped', groupId: null }] : []),
    ...groups
      .filter(g => g.id !== page.group_id)
      .map(g => ({ label: g.name, groupId: g.id })),
  ]

  return (
    <div ref={menuRef} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button
        className="btn btn-ghost btn-icon btn-sm"
        data-menu-btn="true"
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{ color: 'var(--text-muted)', opacity: 0, transition: 'opacity 120ms ease' }}
      >
        <MoreHorizontal size={13} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 4,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
          minWidth: 160, zIndex: 50, overflow: 'hidden',
        }}>
          {!isFirst && (
            <button onClick={() => { onMoveUp(); setOpen(false) }} style={menuItemStyle}>
              <ArrowUpCircle size={12} /> Move up
            </button>
          )}
          {!isLast && (
            <button onClick={() => { onMoveDown(); setOpen(false) }} style={menuItemStyle}>
              <ArrowDownCircle size={12} /> Move down
            </button>
          )}
          {moveTargets.length > 0 && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
              {moveTargets.map(t => (
                <button
                  key={t.groupId ?? 'ungrouped'}
                  onClick={() => { onMoveToGroup(t.groupId); setOpen(false) }}
                  style={menuItemStyle}
                >
                  <FileText size={12} /> Move to: {t.label}
                </button>
              ))}
            </>
          )}
          <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
          <button
            onClick={() => trigger(() => { onDelete(); setOpen(false) })}
            style={{ ...menuItemStyle, color: confirming ? '#ff7777' : '#e05555' }}
          >
            <Trash2 size={12} /> {confirming ? 'Confirm delete' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Group Menu ─────────────────────────────────────────────────────────────────

function GroupMenu({ group, isFirst, isLast, onMoveUp, onMoveDown, onRename, onDelete }: {
  group: DMNoteGroup
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const { confirming, trigger } = useConfirmDelete()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={menuRef} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button
        className="btn btn-ghost btn-icon btn-sm"
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{ color: 'var(--text-muted)' }}
      >
        <MoreHorizontal size={13} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 4,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
          minWidth: 140, zIndex: 50, overflow: 'hidden',
        }}>
          <button onClick={() => { onRename(); setOpen(false) }} style={menuItemStyle}>
            <Pencil size={12} /> Rename
          </button>
          {!isFirst && (
            <button onClick={() => { onMoveUp(); setOpen(false) }} style={menuItemStyle}>
              <ArrowUpCircle size={12} /> Move up
            </button>
          )}
          {!isLast && (
            <button onClick={() => { onMoveDown(); setOpen(false) }} style={menuItemStyle}>
              <ArrowDownCircle size={12} /> Move down
            </button>
          )}
          <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
          <button
            onClick={() => trigger(() => { onDelete(); setOpen(false) })}
            style={{ ...menuItemStyle, color: confirming ? '#ff7777' : '#e05555' }}
          >
            <Trash2 size={12} /> {confirming ? 'Confirm delete' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Page Item ──────────────────────────────────────────────────────────────────

function PageItem({ page, isActive, groups, isFirst, isLast, onClick, onDelete, onMoveUp, onMoveDown, onMoveToGroup }: {
  page: DMNotePageSummary
  isActive: boolean
  groups: DMNoteGroup[]
  isFirst: boolean
  isLast: boolean
  onClick: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onMoveToGroup: (groupId: number | null) => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 8px',
        borderRadius: 'var(--radius-sm)',
        cursor: isActive ? 'default' : 'pointer',
        background: isActive ? 'var(--bg-active)' : 'transparent',
        border: `1px solid ${isActive ? '#9b7de840' : 'transparent'}`,
        transition: 'all 120ms ease',
      }}
      onMouseEnter={e => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
        const btn = (e.currentTarget as HTMLElement).querySelector('[data-menu-btn]') as HTMLElement | null
        if (btn) btn.style.opacity = '1'
      }}
      onMouseLeave={e => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
        const btn = (e.currentTarget as HTMLElement).querySelector('[data-menu-btn]') as HTMLElement | null
        if (btn) btn.style.opacity = '0'
      }}
    >
      <FileText size={11} color={isActive ? '#9b7de8' : 'var(--text-muted)'} style={{ flexShrink: 0 }} />
      <span style={{
        flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: isActive ? '#9b7de8' : 'var(--text-secondary)',
        fontFamily: 'var(--font-ui)',
      }}>
        {page.title || 'Untitled'}
      </span>
      <PageMenu
        page={page}
        groups={groups}
        isFirst={isFirst}
        isLast={isLast}
        onDelete={onDelete}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onMoveToGroup={onMoveToGroup}
      />
    </div>
  )
}

// ── Group Section ──────────────────────────────────────────────────────────────

function GroupSection({ group, pages, groups, isFirst, isLast, activePage, editingGroupId, onOpenPage, onCreatePage, onDeletePage, onMovePageUp, onMovePageDown, onMovePageToGroup, onMoveGroupUp, onMoveGroupDown, onDeleteGroup, onStartRename, onFinishRename }: {
  group: DMNoteGroup
  pages: DMNotePageSummary[]
  groups: DMNoteGroup[]
  isFirst: boolean
  isLast: boolean
  activePage: DMNotePageFull | null
  editingGroupId: number | null
  onOpenPage: (id: number) => void
  onCreatePage: (groupId: number) => void
  onDeletePage: (page: DMNotePageSummary) => void
  onMovePageUp: (page: DMNotePageSummary) => void
  onMovePageDown: (page: DMNotePageSummary) => void
  onMovePageToGroup: (page: DMNotePageSummary, groupId: number | null) => void
  onMoveGroupUp: () => void
  onMoveGroupDown: () => void
  onDeleteGroup: () => void
  onStartRename: () => void
  onFinishRename: (name: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [renameValue, setRenameValue] = useState(group.name)
  const renameRef = useRef<HTMLInputElement>(null)

  const isRenaming = editingGroupId === group.id

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(group.name)
      setTimeout(() => renameRef.current?.focus(), 50)
    }
  }, [isRenaming])

  const handleRenameSubmit = () => {
    onFinishRename(renameValue.trim() || group.name)
  }

  return (
    <div style={{ marginBottom: 4 }}>
      {/* Group header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 4px 3px' }}>
        <button
          onClick={() => setCollapsed(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', flex: 1, textAlign: 'left', padding: 0, minWidth: 0 }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: group.color, flexShrink: 0 }} />
          {isRenaming ? (
            <input
              ref={renameRef}
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') onFinishRename(group.name) }}
              onClick={e => e.stopPropagation()}
              style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border-gold)', borderRadius: 'var(--radius-sm)', padding: '1px 6px', fontSize: 12, color: group.color, fontFamily: 'var(--font-display)', outline: 'none', minWidth: 0 }}
            />
          ) : (
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: group.color, letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {group.name}
            </span>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '0px 5px', borderRadius: 99, border: '1px solid var(--border-light)', flexShrink: 0 }}>
            {pages.length}
          </span>
          {collapsed
            ? <ChevronDown size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            : <ChevronUp size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          }
        </button>
        <GroupMenu
          group={group}
          isFirst={isFirst}
          isLast={isLast}
          onMoveUp={onMoveGroupUp}
          onMoveDown={onMoveGroupDown}
          onRename={onStartRename}
          onDelete={onDeleteGroup}
        />
      </div>

      {/* Group pages */}
      {!collapsed && (
        <div style={{ paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {pages.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 8px', fontStyle: 'italic' }}>
              Empty group
            </div>
          )}
          {pages.map((p, idx) => (
            <PageItem
              key={p.id}
              page={p}
              isActive={activePage?.id === p.id}
              groups={groups}
              isFirst={idx === 0}
              isLast={idx === pages.length - 1}
              onClick={() => activePage?.id !== p.id && onOpenPage(p.id)}
              onDelete={() => onDeletePage(p)}
              onMoveUp={() => onMovePageUp(p)}
              onMoveDown={() => onMovePageDown(p)}
              onMoveToGroup={groupId => onMovePageToGroup(p, groupId)}
            />
          ))}
          <button
            onClick={() => onCreatePage(group.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 8px', background: 'none',
              border: '1px dashed var(--border-light)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
              transition: 'all 120ms ease', marginTop: 2,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = group.color; (e.currentTarget as HTMLElement).style.color = group.color }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
          >
            <Plus size={10} /> Add to {group.name}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Page Editor ────────────────────────────────────────────────────────────────

function PageEditor({ page, onDeleted, onTitleChange }: {
  page: DMNotePageFull
  onDeleted: () => void
  onTitleChange: (id: number, title: string) => void
}) {
  const { navigateToArticleByTitle } = useStore()
  const [title, setTitle] = useState(page.title)
  const [content, setContent] = useState(page.content)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const pendingRef = useRef({ title, content, dirty, id: page.id })
  pendingRef.current = { title, content, dirty, id: page.id }

  useEffect(() => {
    return () => {
      const p = pendingRef.current
      if (p.dirty) {
        window.api.updateDMNotePage(p.id, { title: p.title, content: p.content })
      }
    }
  }, [])

  useEffect(() => {
    setTitle(page.title)
    setContent(page.content)
    setDirty(false)
  }, [page.id])

  const save = useCallback(async () => {
    if (!dirty) return
    setSaving(true)
    await window.api.updateDMNotePage(page.id, { title, content })
    setDirty(false)
    setSaving(false)
  }, [page.id, dirty, title, content])

  // Auto-save debounce for content
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(save, 1500)
    return () => clearTimeout(t)
  }, [dirty, content])

  const handleTitleBlur = () => {
    if (title !== page.title) {
      onTitleChange(page.id, title)
      window.api.updateDMNotePage(page.id, { title })
        .then(() => setDirty(false))
    }
  }

  const handleDelete = async () => {
    setDirty(false)
    await window.api.deleteDMNotePage(page.id)
    onDeleted()
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '0 24px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'stretch', minHeight: 52, flexShrink: 0,
        background: 'var(--bg-surface)',
      }}>
        <input
          value={title}
          onChange={e => { setTitle(e.target.value); setDirty(true) }}
          onBlur={handleTitleBlur}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500,
            color: 'var(--text-primary)', letterSpacing: '0.03em',
          }}
          placeholder="Page title…"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderLeft: '1px solid var(--border)', paddingLeft: 16, flexShrink: 0 }}>
          {dirty
            ? <button className="btn btn-sm" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : <><Check size={12} /> Save</>}
              </button>
            : <span style={{ fontSize: 11, color: 'var(--gold-dim)' }}>Saved</span>
          }
          <button
            onClick={handleDelete}
            className="btn btn-ghost btn-icon btn-sm"
            style={{ color: 'var(--text-muted)' }}
            title="Delete page"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <RichEditor
          key={page.id}
          content={content}
          onChange={v => { setContent(v); setDirty(true) }}
          placeholder="Start a DM note… Use [[Article Title]] to link wiki articles, (( to link sessions, and @ to link spells."
          onWikiLinkClick={navigateToArticleByTitle}
          expandable
        />
      </div>
    </div>
  )
}

// ── DM Notes Page ──────────────────────────────────────────────────────────────

export default function DMNotesPage() {
  const { currentCampaign, setView, setCampaignSubView } = useStore()
  const [pages, setPages] = useState<DMNotePageSummary[]>([])
  const [groups, setGroups] = useState<DMNoteGroup[]>([])
  const [activePage, setActivePage] = useState<DMNotePageFull | null>(null)
  const [loading, setLoading] = useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null)

  const ungroupedPages = pages
    .filter(p => p.group_id === null)
    .sort((a, b) => a.sort_order - b.sort_order)

  const pagesForGroup = (groupId: number) =>
    pages.filter(p => p.group_id === groupId).sort((a, b) => a.sort_order - b.sort_order)

  const loadAll = useCallback(async () => {
    if (!currentCampaign) return
    const [ps, gs] = await Promise.all([
      window.api.getDMNotesPages(currentCampaign.id),
      window.api.getDMNoteGroups(currentCampaign.id),
    ])
    setPages(ps as DMNotePageSummary[])
    setGroups(gs as DMNoteGroup[])
    return ps as DMNotePageSummary[]
  }, [currentCampaign?.id])

  useEffect(() => {
    loadAll().then(ps => {
      if (ps && ps.length > 0 && !activePage) {
        openPage(ps[0].id)
      }
    })
  }, [currentCampaign?.id])

  const openPage = async (id: number) => {
    setLoading(true)
    const page = await window.api.getDMNotePage(id)
    setActivePage(page as DMNotePageFull)
    setLoading(false)
  }

  const handleCreatePage = async (groupId: number | null = null) => {
    if (!currentCampaign) return
    const page = await window.api.createDMNotePage(currentCampaign.id, groupId)
    setPages(ps => [...ps, { ...page, content: undefined } as unknown as DMNotePageSummary])
    const full = await window.api.getDMNotePage(page.id)
    setActivePage(full as DMNotePageFull)
  }

  const handleDeletePage = async (page: DMNotePageSummary) => {
    await window.api.deleteDMNotePage(page.id)
    setPages(ps => ps.filter(p => p.id !== page.id))
    if (activePage?.id === page.id) {
      setActivePage(null)
      const remaining = pages.filter(p => p.id !== page.id)
      if (remaining.length > 0) openPage(remaining[0].id)
    }
  }

  const handleTitleChange = (id: number, newTitle: string) => {
    setPages(ps => ps.map(p => p.id === id ? { ...p, title: newTitle } : p))
    if (activePage?.id === id) setActivePage(prev => prev ? { ...prev, title: newTitle } : prev)
  }

  // ── Page reordering ──────────────────────────────────────────────────────────

  const swapPages = (a: DMNotePageSummary, b: DMNotePageSummary) => {
    const orders = [
      { id: a.id, sort_order: b.sort_order, group_id: a.group_id },
      { id: b.id, sort_order: a.sort_order, group_id: b.group_id },
    ]
    setPages(ps => ps.map(p => {
      const o = orders.find(x => x.id === p.id)
      return o ? { ...p, sort_order: o.sort_order } : p
    }))
    window.api.reorderDMNotePages(orders)
  }

  const movePageUp = (page: DMNotePageSummary) => {
    const siblings = page.group_id === null ? ungroupedPages : pagesForGroup(page.group_id)
    const idx = siblings.findIndex(p => p.id === page.id)
    if (idx <= 0) return
    swapPages(page, siblings[idx - 1])
  }

  const movePageDown = (page: DMNotePageSummary) => {
    const siblings = page.group_id === null ? ungroupedPages : pagesForGroup(page.group_id)
    const idx = siblings.findIndex(p => p.id === page.id)
    if (idx >= siblings.length - 1) return
    swapPages(page, siblings[idx + 1])
  }

  const movePageToGroup = async (page: DMNotePageSummary, groupId: number | null) => {
    // Get max sort_order in target group
    const targetPages = groupId === null
      ? pages.filter(p => p.group_id === null && p.id !== page.id)
      : pages.filter(p => p.group_id === groupId && p.id !== page.id)
    const newSortOrder = targetPages.length > 0
      ? Math.max(...targetPages.map(p => p.sort_order)) + 1
      : 0

    const order = [{ id: page.id, sort_order: newSortOrder, group_id: groupId }]
    setPages(ps => ps.map(p => p.id === page.id ? { ...p, group_id: groupId, sort_order: newSortOrder } : p))
    window.api.reorderDMNotePages(order)
  }

  // ── Group reordering ─────────────────────────────────────────────────────────

  const swapGroups = (a: DMNoteGroup, b: DMNoteGroup) => {
    const orders = [
      { id: a.id, sort_order: b.sort_order },
      { id: b.id, sort_order: a.sort_order },
    ]
    setGroups(gs => gs.map(g => {
      const o = orders.find(x => x.id === g.id)
      return o ? { ...g, sort_order: o.sort_order } : g
    }))
    window.api.reorderDMNoteGroups(orders)
  }

  const moveGroupUp = (group: DMNoteGroup) => {
    const sorted = [...groups].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(g => g.id === group.id)
    if (idx <= 0) return
    swapGroups(group, sorted[idx - 1])
  }

  const moveGroupDown = (group: DMNoteGroup) => {
    const sorted = [...groups].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(g => g.id === group.id)
    if (idx >= sorted.length - 1) return
    swapGroups(group, sorted[idx + 1])
  }

  const handleDeleteGroup = async (groupId: number) => {
    await window.api.deleteDMNoteGroup(groupId)
    setGroups(gs => gs.filter(g => g.id !== groupId))
    setPages(ps => ps.map(p => p.group_id === groupId ? { ...p, group_id: null } : p))
  }

  const handleRenameGroup = async (groupId: number, name: string) => {
    setEditingGroupId(null)
    if (!name.trim()) return
    await window.api.updateDMNoteGroup(groupId, { name })
    setGroups(gs => gs.map(g => g.id === groupId ? { ...g, name } : g))
  }

  const sortedGroups = [...groups].sort((a, b) => a.sort_order - b.sort_order)

  if (!currentCampaign) return null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{
        padding: '0 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12,
        minHeight: 48, flexShrink: 0, background: 'var(--bg-surface)',
      }}>
        <button
          onClick={() => { setView('campaign'); setCampaignSubView('hub') }}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '0 12px 0 0', background: 'transparent', border: 'none',
            borderRight: '1px solid var(--border)', height: '100%', minHeight: 48,
            color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
            transition: 'color var(--transition)',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <Sparkles size={13} color="#9b7de8" />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: '#9b7de8', letterSpacing: '0.04em', flex: 1 }}>
          DM Notes
        </span>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{
          width: 230, flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-surface)',
          overflow: 'hidden',
        }}>
          {/* Sidebar toolbar */}
          <div style={{
            padding: '8px 8px 6px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 4,
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1, paddingLeft: 4 }}>Pages</span>
            <button
              onClick={() => handleCreatePage(null)}
              title="New ungrouped page"
              className="btn btn-ghost btn-icon btn-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              <Plus size={13} />
            </button>
            <button
              onClick={() => setShowCreateGroup(true)}
              title="New group"
              className="btn btn-ghost btn-icon btn-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              <FolderPlus size={13} />
            </button>
          </div>

          {/* Page list */}
          <div style={{ flex: 1, overflow: 'auto', padding: '6px 4px' }}>

            {/* Ungrouped pages */}
            {ungroupedPages.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                {ungroupedPages.map((p, idx) => (
                  <PageItem
                    key={p.id}
                    page={p}
                    isActive={activePage?.id === p.id}
                    groups={groups}
                    isFirst={idx === 0}
                    isLast={idx === ungroupedPages.length - 1}
                    onClick={() => activePage?.id !== p.id && openPage(p.id)}
                    onDelete={() => handleDeletePage(p)}
                    onMoveUp={() => movePageUp(p)}
                    onMoveDown={() => movePageDown(p)}
                    onMoveToGroup={groupId => movePageToGroup(p, groupId)}
                  />
                ))}
              </div>
            )}

            {/* Groups */}
            {sortedGroups.map((group, gIdx) => (
              <GroupSection
                key={group.id}
                group={group}
                pages={pagesForGroup(group.id)}
                groups={groups}
                isFirst={gIdx === 0}
                isLast={gIdx === sortedGroups.length - 1}
                activePage={activePage}
                editingGroupId={editingGroupId}
                onOpenPage={openPage}
                onCreatePage={handleCreatePage}
                onDeletePage={handleDeletePage}
                onMovePageUp={movePageUp}
                onMovePageDown={movePageDown}
                onMovePageToGroup={movePageToGroup}
                onMoveGroupUp={() => moveGroupUp(group)}
                onMoveGroupDown={() => moveGroupDown(group)}
                onDeleteGroup={() => handleDeleteGroup(group.id)}
                onStartRename={() => setEditingGroupId(group.id)}
                onFinishRename={name => handleRenameGroup(group.id, name)}
              />
            ))}

            {/* Empty state */}
            {pages.length === 0 && groups.length === 0 && (
              <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
                No pages yet.
                <br />
                <button
                  onClick={() => handleCreatePage(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9b7de8', fontSize: 12, padding: '4px 0', marginTop: 4 }}
                >
                  Create your first page
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Editor */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Loading…
            </div>
          ) : activePage ? (
            <PageEditor
              key={activePage.id}
              page={activePage}
              onDeleted={() => {
                setPages(ps => ps.filter(p => p.id !== activePage.id))
                setActivePage(null)
                const remaining = pages.filter(p => p.id !== activePage.id)
                if (remaining.length > 0) openPage(remaining[0].id)
              }}
              onTitleChange={handleTitleChange}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)' }}>
              <Sparkles size={40} strokeWidth={1} color="var(--border-light)" />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', marginBottom: 4 }}>No page selected</div>
                <div style={{ fontSize: 13 }}>Create a page to start a new DM Note</div>
              </div>
              <button className="btn btn-primary" onClick={() => handleCreatePage(null)}>
                <Plus size={14} /> New Page
              </button>
            </div>
          )}
        </div>
      </div>

      {showCreateGroup && currentCampaign && (
        <CreateGroupModal
          campaignId={currentCampaign.id}
          onClose={() => setShowCreateGroup(false)}
          onCreate={group => setGroups(gs => [...gs, group])}
        />
      )}
    </div>
  )
}