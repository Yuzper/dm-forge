// path: src/pages/DMNotesPage.tsx
import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { useMenuClose } from '../hooks/useMenuClose'
import Modal from '../components/Modal'
import SwatchPicker from '../components/SwatchPicker'
import { STANDARD_PALETTE } from '../constants/palettes'
import { SECTION_ACCENTS } from '../constants/sections'
import { useStore } from '../store/store'
import {
  Sparkles, Plus, Trash2, MoreHorizontal, FileText, Check,
  ArrowLeft, FolderPlus, ChevronDown, ChevronUp, Pencil, ArrowUpCircle, ArrowDownCircle, GripVertical, Lock, ArrowUp, ArrowDown,
} from 'lucide-react'
import { useContextMenu, useMenuCtx } from '../hooks/useContextMenu'
import { buildLocationMenu, truncate } from '../utils/contextMenus'
import type { Location } from '../store/location'

// ── Drag-and-drop plumbing (pages + groups in the notes sidebar) ────────────────
type NotesDropHint =
  | { kind: 'page'; container: number | null; index: number }
  | { kind: 'group'; index: number }

interface NotesDnd {
  dragItem: { kind: 'page' | 'group'; id: number } | null
  dropHint: NotesDropHint | null
  startPageDrag: (id: number) => void
  startGroupDrag: (id: number) => void
  endDrag: () => void
  onPageRowDragOver: (container: number | null, index: number, e: React.DragEvent) => void
  onContainerDragOver: (container: number | null, count: number, e: React.DragEvent) => void
  onGroupHeaderDragOver: (groupIndex: number, container: number, e: React.DragEvent) => void
  commitDrop: () => void
}

const DropLine = () => (
  <div style={{ height: 2, background: '#9b7de8', borderRadius: 2, margin: '2px 6px' }} />
)
import RichEditor from '../components/RichEditor'
import { useConfirmDelete } from '../hooks/useConfirmDelete'

// ── Types ──────────────────────────────────────────────────────────────────────

interface DMNoteGroup {
  id: number
  campaign_id: number
  name: string
  color: string
  sort_order: number
  is_system: number
  created_at: string
}

interface DMNotePageSummary {
  id: number
  campaign_id: number
  title: string
  group_id: number | null
  sort_order: number
  session_id: number | null
  created_at: string
  updated_at: string
}

interface DMNotePageFull extends DMNotePageSummary {
  content: string
}

// ── Constants ──────────────────────────────────────────────────────────────────


// ── Create Group Modal ─────────────────────────────────────────────────────────

function CreateGroupModal({ campaignId, onClose, onCreate }: {
  campaignId: number
  onClose: () => void
  onCreate: (group: DMNoteGroup) => void
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(STANDARD_PALETTE[6])
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    const group = await window.api.createDMNoteGroup(campaignId, name.trim(), color)
    onCreate(group)
    onClose()
  }

  return (
    <Modal title="New Group" onClose={onClose}>
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
          <SwatchPicker value={color} onChange={setColor} />
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim() || saving}>
          {saving ? 'Creating…' : 'Create Group'}
        </button>
      </div>
    </Modal>
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
  useMenuClose(open, menuRef, setOpen)

  // Session pages are locked to their folder; non-session pages can't enter system groups
  const moveTargets: { label: string; groupId: number | null }[] = page.session_id ? [] : [
    ...(page.group_id !== null ? [{ label: 'Ungrouped', groupId: null }] : []),
    ...groups
      .filter(g => g.id !== page.group_id && !g.is_system)
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
          {!page.session_id && !isFirst && (
            <button onClick={() => { onMoveUp(); setOpen(false) }} className="menu-item menu-item-sm">
              <ArrowUpCircle size={12} /> Move up
            </button>
          )}
          {!page.session_id && !isLast && (
            <button onClick={() => { onMoveDown(); setOpen(false) }} className="menu-item menu-item-sm">
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
                  className="menu-item menu-item-sm"
                >
                  <FileText size={12} /> Move to: {t.label}
                </button>
              ))}
            </>
          )}
          <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
          <button
            onClick={() => trigger(() => { onDelete(); setOpen(false) })}
            className="menu-item menu-item-sm menu-item-danger" style={confirming ? { color: 'var(--danger-hover)' } : undefined}
          >
            <Trash2 size={12} /> {confirming ? 'Confirm delete' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Group Menu ─────────────────────────────────────────────────────────────────

function GroupMenu({ group, isFirst, isLast, onMoveUp, onMoveDown, onRename, onDelete, onChangeColor }: {
  group: DMNoteGroup
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRename: () => void
  onDelete: () => void
  onChangeColor: (color: string) => void
}) {
  const [open, setOpen] = useState(false)
  const { confirming, trigger } = useConfirmDelete()
  const menuRef = useRef<HTMLDivElement>(null)
  useMenuClose(open, menuRef, setOpen)

  const isSystem = !!group.is_system

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
          minWidth: 148, zIndex: 50, overflow: 'hidden',
        }}>
          {!isSystem && (
            <button onClick={() => { onRename(); setOpen(false) }} className="menu-item menu-item-sm">
              <Pencil size={12} /> Rename
            </button>
          )}
          {!isFirst && (
            <button onClick={() => { onMoveUp(); setOpen(false) }} className="menu-item menu-item-sm">
              <ArrowUpCircle size={12} /> Move up
            </button>
          )}
          {!isLast && (
            <button onClick={() => { onMoveDown(); setOpen(false) }} className="menu-item menu-item-sm">
              <ArrowDownCircle size={12} /> Move down
            </button>
          )}
          <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
          <div style={{ padding: '4px 10px 6px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Colour</div>
            <SwatchPicker value={group.color} onChange={onChangeColor} size={16} gap={5} />
          </div>
          {!isSystem && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
              <button
                onClick={() => trigger(() => { onDelete(); setOpen(false) })}
                className="menu-item menu-item-sm menu-item-danger" style={confirming ? { color: 'var(--danger-hover)' } : undefined}
              >
                <Trash2 size={12} /> {confirming ? 'Confirm delete' : 'Delete'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page Item ──────────────────────────────────────────────────────────────────

function PageItem({ page, isActive, groups, isFirst, isLast, dnd, index, container, onClick, onDelete, onMoveUp, onMoveDown, onMoveToGroup }: {
  page: DMNotePageSummary
  isActive: boolean
  groups: DMNoteGroup[]
  isFirst: boolean
  isLast: boolean
  dnd: NotesDnd
  index: number
  container: number | null
  onClick: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onMoveToGroup: (groupId: number | null) => void
}) {
  const isDragging = dnd.dragItem?.kind === 'page' && dnd.dragItem.id === page.id
  const locked = !!page.session_id
  const showMenu = useContextMenu()
  const menuCtx = useMenuCtx()
  const loc: Location = { type: 'dm-notes', pageId: page.id }
  return (
    <div
      onClick={onClick}
      onAuxClick={e => { if (e.button === 1) { e.preventDefault(); menuCtx.goTab(loc, true) } }}
      onContextMenu={e => showMenu(e, buildLocationMenu(loc, menuCtx, {
        label: `Open “${truncate(page.title)}”`,
        copy: { label: 'Copy title', text: page.title },
        extra: [
          !isFirst && { label: 'Move up', click: onMoveUp },
          !isLast && { label: 'Move down', click: onMoveDown },
          groups.length > 0 && !locked && {
            label: 'Move to folder',
            submenu: [
              { label: 'No folder', click: () => onMoveToGroup(null) },
              ...groups.map(g => ({ label: g.name, click: () => onMoveToGroup(g.id) })),
            ],
          },
        ],
        // Session notes pages mirror a session's own notes — deleting one here
        // would be deleting the session's notes from the wrong place.
        onDelete: locked ? undefined : onDelete,
        deleteLabel: `Delete “${truncate(page.title)}”`,
      }))}
      draggable={!locked}
      onDragStart={locked ? undefined : e => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(page.id))
        // Defer the state update one frame: mounting the "drop to ungroup" zone
        // synchronously here would mutate the DOM mid-dragstart and Chromium would
        // abort the drag (only reproducible when every page lives in a folder).
        const id = page.id
        requestAnimationFrame(() => dnd.startPageDrag(id))
      }}
      onDragEnd={locked ? undefined : () => dnd.endDrag()}
      onDragOver={locked ? undefined : e => dnd.onPageRowDragOver(container, index, e)}
      onDrop={locked ? undefined : e => { e.preventDefault(); dnd.commitDrop() }}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 8px',
        borderRadius: 'var(--radius-sm)',
        cursor: isActive ? 'default' : 'pointer',
        background: isActive ? 'var(--bg-active)' : 'transparent',
        border: `1px solid ${isActive ? '#9b7de840' : 'transparent'}`,
        transition: 'background 120ms ease',
        opacity: isDragging ? 0.4 : 1,
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
      {!locked && <GripVertical
        size={12}
        color="var(--text-muted)"
        style={{ flexShrink: 0, opacity: 0.45, cursor: 'grab' }}
        aria-label="Drag to reorder"
      />}
      <FileText size={11} color={'var(--text-muted)'} style={{ flexShrink: 0 }} />
      <span style={{
        flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: 'var(--text-secondary)',
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

function GroupSection({ group, pages, groups, isFirst, isLast, groupIndex, dnd, dropHint, activePage, editingGroupId, onOpenPage, onCreatePage, onDeletePage, onMovePageUp, onMovePageDown, onMovePageToGroup, onMoveGroupUp, onMoveGroupDown, onDeleteGroup, onStartRename, onFinishRename, onChangeGroupColor }: {
  group: DMNoteGroup
  pages: DMNotePageSummary[]
  groups: DMNoteGroup[]
  isFirst: boolean
  isLast: boolean
  groupIndex: number
  dnd: NotesDnd
  dropHint: NotesDropHint | null
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
  onChangeGroupColor: (color: string) => void
}) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(`dmnotes:group-collapsed:${group.id}`) === '1' } catch { return false }
  })
  const toggleCollapsed = () => {
    setCollapsed(v => {
      const next = !v
      try { localStorage.setItem(`dmnotes:group-collapsed:${group.id}`, next ? '1' : '0') } catch {}
      return next
    })
  }
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => {
    try { return localStorage.getItem(`dmnotes:group-sort:${group.id}`) === 'desc' ? 'desc' : 'asc' } catch { return 'asc' }
  })
  const toggleSort = () => {
    setSortDir(d => {
      const next = d === 'asc' ? 'desc' : 'asc'
      try { localStorage.setItem(`dmnotes:group-sort:${group.id}`, next) } catch {}
      return next
    })
  }
  const [renameValue, setRenameValue] = useState(group.name)
  const renameRef = useRef<HTMLInputElement>(null)

  const isRenaming = editingGroupId === group.id
  const isGroupDragging = dnd.dragItem?.kind === 'group' && dnd.dragItem.id === group.id
  // Highlight the header when a page is being dragged onto this group.
  const pageDropTarget = dnd.dragItem?.kind === 'page' && dropHint?.kind === 'page' && dropHint.container === group.id

  const displayedPages = group.is_system && sortDir === 'desc' ? [...pages].reverse() : pages

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
    <div
      style={{ marginBottom: 4, opacity: isGroupDragging ? 0.4 : 1 }}
      onDragOver={e => { if (dnd.dragItem?.kind === 'group') dnd.onGroupHeaderDragOver(groupIndex, group.id, e) }}
      onDrop={e => { e.preventDefault(); dnd.commitDrop() }}
    >
      {/* Group header — drag handle (group reorder) + drop target (page into group) */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 4px 3px', borderRadius: 'var(--radius-sm)', background: pageDropTarget ? `${group.color}22` : 'transparent' }}
        onDragOver={e => dnd.onGroupHeaderDragOver(groupIndex, group.id, e)}
        onDrop={e => { e.preventDefault(); dnd.commitDrop() }}
      >
        <span
          draggable={!isRenaming}
          onDragStart={e => {
            e.dataTransfer.effectAllowed = 'move'
            const id = group.id
            requestAnimationFrame(() => dnd.startGroupDrag(id))
          }}
          onDragEnd={() => dnd.endDrag()}
          title="Drag to reorder group"
          style={{ display: 'flex', alignItems: 'center', cursor: 'grab', color: 'var(--text-muted)', flexShrink: 0 }}
          onClick={e => e.stopPropagation()}
        >
          <GripVertical size={12} />
        </span>
        <button
          onClick={toggleCollapsed}
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
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: group.color, letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
              {group.name}
              {!!group.is_system && <Lock size={9} style={{ flexShrink: 0, opacity: 0.6 }} />}
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
        {!!group.is_system && (
          <button
            onClick={e => { e.stopPropagation(); toggleSort() }}
            title={sortDir === 'asc' ? 'Sorted ascending — click for descending' : 'Sorted descending — click for ascending'}
            className="btn btn-ghost btn-icon btn-sm"
            style={{ color: 'var(--text-muted)', flexShrink: 0 }}
          >
            {sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
          </button>
        )}
        <GroupMenu
          group={group}
          isFirst={isFirst}
          isLast={isLast}
          onMoveUp={onMoveGroupUp}
          onMoveDown={onMoveGroupDown}
          onRename={onStartRename}
          onDelete={onDeleteGroup}
          onChangeColor={onChangeGroupColor}
        />
      </div>

      {/* Group pages */}
      {!collapsed && (
        <div
          style={{ paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 1 }}
          onDragOver={e => dnd.onContainerDragOver(group.id, pages.length, e)}
          onDrop={e => { e.preventDefault(); dnd.commitDrop() }}
        >
          {displayedPages.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 8px', fontStyle: 'italic' }}>
              Empty group
            </div>
          )}
          {displayedPages.map((p, idx) => (
            <Fragment key={p.id}>
              {dropHint?.kind === 'page' && dropHint.container === group.id && dropHint.index === idx && <DropLine />}
              <PageItem
                page={p}
                isActive={activePage?.id === p.id}
                groups={groups}
                isFirst={idx === 0}
                isLast={idx === displayedPages.length - 1}
                dnd={dnd}
                index={idx}
                container={group.id}
                onClick={() => activePage?.id !== p.id && onOpenPage(p.id)}
                onDelete={() => onDeletePage(p)}
                onMoveUp={() => onMovePageUp(p)}
                onMoveDown={() => onMovePageDown(p)}
                onMoveToGroup={groupId => onMovePageToGroup(p, groupId)}
              />
            </Fragment>
          ))}
          {dropHint?.kind === 'page' && dropHint.container === group.id && dropHint.index === displayedPages.length && <DropLine />}
          {!group.is_system && (
            <button
              onClick={() => onCreatePage(group.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 8px', background: 'none',
                border: '1px dashed var(--border-light)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
                transition: 'all 120ms ease', marginTop: 2,
                '--hover-accent': group.color,
              } as React.CSSProperties}
              className="hover-accent-border"
            >
              <Plus size={10} /> Add to {group.name}
            </button>
          )}
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
  const { navigateToArticleByTitle, patchSessionInMemory } = useStore()
  const [title, setTitle] = useState(page.title)
  const [content, setContent] = useState(page.content)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const pendingRef = useRef({ title, content, dirty, id: page.id, sessionId: page.session_id })
  pendingRef.current = { title, content, dirty, id: page.id, sessionId: page.session_id }

  useEffect(() => {
    return () => {
      const p = pendingRef.current
      if (p.dirty) {
        window.api.updateDMNotePage(p.id, { title: p.title, content: p.content })
        if (p.sessionId) patchSessionInMemory(p.sessionId, { notes: p.content })
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
    if (page.session_id) patchSessionInMemory(page.session_id, { notes: content })
    setDirty(false)
    setSaving(false)
  }, [page.id, page.session_id, dirty, title, content])

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

  const { confirming: confirmingDelete, trigger: triggerDelete } = useConfirmDelete()

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
            onClick={() => triggerDelete(handleDelete)}
            className="btn btn-ghost btn-sm"
            style={{ color: confirmingDelete ? '#e05555' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}
            title="Delete page"
          >
            <Trash2 size={13} /> {confirmingDelete ? 'Confirm' : ''}
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <RichEditor
          key={page.id}
          content={content}
          onChange={v => { setContent(v); setDirty(true) }}
          placeholder="Start a DM note… Use [[ to link wiki articles, @@ for spells, \\ for sessions."
          onWikiLinkClick={navigateToArticleByTitle}
          expandable
        />
      </div>
    </div>
  )
}

// ── DM Notes Page ──────────────────────────────────────────────────────────────

export default function DMNotesPage() {
  const { currentCampaign, setView, setCampaignSubView, setHintContext } = useStore()
  const dmNotesOpenPageId = useStore(s => s.dmNotesOpenPageId)
  const setDMNotesOpenPageId = useStore(s => s.setDMNotesOpenPageId)
  useEffect(() => { setHintContext('dmnotes'); return () => setHintContext(null) }, [setHintContext])
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
    if (!currentCampaign) return
    window.api.syncDMSessionNotes(currentCampaign.id).then(() => {
      loadAll().then(ps => {
        if (ps && ps.length > 0 && !activePage && !useStore.getState().dmNotesOpenPageId) {
          openPage(ps[0].id)
        }
      })
    })
  }, [currentCampaign?.id])

  // Deep-link from global search: open the requested page, then clear the hand-off.
  useEffect(() => {
    if (dmNotesOpenPageId != null) {
      openPage(dmNotesOpenPageId)
      setDMNotesOpenPageId(null)
    }
  }, [dmNotesOpenPageId])

  // Remember the open page on this tab's location (a sub-position, not a new
  // history step), so returning to DM Notes reopens the page you left on.
  const publishLocationNames = useStore(s => s.publishLocationNames)
  useEffect(() => {
    if (pages.length) publishLocationNames('dm-notes', Object.fromEntries(pages.map(p => [p.id, p.title])))
  }, [pages, publishLocationNames])

  const patchLocation = useStore(s => s.patchLocation)
  useEffect(() => {
    if (activePage) patchLocation('dm-notes', { pageId: activePage.id })
  }, [activePage?.id, patchLocation])

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

  const handleChangeGroupColor = async (groupId: number, color: string) => {
    setGroups(gs => gs.map(g => g.id === groupId ? { ...g, color } : g))
    window.api.updateDMNoteGroup(groupId, { color })
  }

  const sortedGroups = [...groups].sort((a, b) => a.sort_order - b.sort_order)

  // ── Drag-and-drop reordering ──────────────────────────────────────────────────
  const [dragItem, setDragItem] = useState<{ kind: 'page' | 'group'; id: number } | null>(null)
  const [dropHint, setDropHint] = useState<NotesDropHint | null>(null)

  // Move a page into a container (group id, or null for ungrouped) at a position,
  // renumbering that container 0..n. Handles both within- and cross-group moves.
  const movePageTo = (pageId: number, targetGroupId: number | null, targetIndex: number) => {
    // Target index is expressed against the rendered list, which for a same-group
    // move still includes the dragged page — so translate it into the index of the
    // list with the dragged page removed (shift down by one if it sat earlier).
    const containerAll = pages
      .filter(p => p.group_id === targetGroupId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(p => p.id)
    const fromIdx = containerAll.indexOf(pageId)
    const ids = containerAll.filter(id => id !== pageId)
    let at = targetIndex
    if (fromIdx >= 0 && fromIdx < at) at -= 1
    at = Math.max(0, Math.min(at, ids.length))
    ids.splice(at, 0, pageId)
    const orders = ids.map((id, i) => ({ id, sort_order: i, group_id: targetGroupId }))
    setPages(ps => ps.map(p => {
      const o = orders.find(x => x.id === p.id)
      return o ? { ...p, sort_order: o.sort_order, group_id: targetGroupId } : p
    }))
    window.api.reorderDMNotePages(orders)
  }

  const moveGroupTo = (groupId: number, targetIndex: number) => {
    const all = sortedGroups.map(g => g.id)
    const fromIdx = all.indexOf(groupId)
    const ids = all.filter(id => id !== groupId)
    let at = targetIndex
    if (fromIdx >= 0 && fromIdx < at) at -= 1
    at = Math.max(0, Math.min(at, ids.length))
    ids.splice(at, 0, groupId)
    const orders = ids.map((id, i) => ({ id, sort_order: i }))
    setGroups(gs => gs.map(g => {
      const o = orders.find(x => x.id === g.id)
      return o ? { ...g, sort_order: o.sort_order } : g
    }))
    window.api.reorderDMNoteGroups(orders)
  }

  const canDropPageInto = (pageId: number, targetGroupId: number | null) => {
    const page = pages.find(p => p.id === pageId)
    const targetGroup = targetGroupId !== null ? groups.find(g => g.id === targetGroupId) : null
    if (page?.session_id && targetGroupId !== page.group_id) return false
    if (!page?.session_id && targetGroup?.is_system) return false
    return true
  }

  const dnd: NotesDnd = {
    dragItem,
    dropHint,
    startPageDrag: id => setDragItem({ kind: 'page', id }),
    startGroupDrag: id => setDragItem({ kind: 'group', id }),
    endDrag: () => { setDragItem(null); setDropHint(null) },
    onPageRowDragOver: (container, index, e) => {
      if (dragItem?.kind !== 'page') return
      if (!canDropPageInto(dragItem.id, container)) return
      e.preventDefault(); e.stopPropagation()
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const after = e.clientY > r.top + r.height / 2
      setDropHint({ kind: 'page', container, index: after ? index + 1 : index })
    },
    onContainerDragOver: (container, count, e) => {
      if (dragItem?.kind !== 'page') return
      if (!canDropPageInto(dragItem.id, container)) return
      e.preventDefault()
      setDropHint({ kind: 'page', container, index: count })
    },
    onGroupHeaderDragOver: (groupIndex, container, e) => {
      if (dragItem?.kind === 'group') {
        e.preventDefault(); e.stopPropagation()
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const after = e.clientY > r.top + r.height / 2
        setDropHint({ kind: 'group', index: after ? groupIndex + 1 : groupIndex })
      } else if (dragItem?.kind === 'page') {
        if (!canDropPageInto(dragItem.id, container)) return
        e.preventDefault(); e.stopPropagation()
        setDropHint({ kind: 'page', container, index: 0 })
      }
    },
    commitDrop: () => {
      if (dragItem && dropHint) {
        if (dragItem.kind === 'page' && dropHint.kind === 'page' && canDropPageInto(dragItem.id, dropHint.container))
          movePageTo(dragItem.id, dropHint.container, dropHint.index)
        else if (dragItem.kind === 'group' && dropHint.kind === 'group')
          moveGroupTo(dragItem.id, dropHint.index)
      }
      setDragItem(null); setDropHint(null)
    },
  }

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
          className="hover-text"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <Sparkles size={13} color={SECTION_ACCENTS['dm-notes']} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '0.03em', flex: 1 }}>
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


            {/* Ungrouped pages — always a drop target so pages can be moved out of groups */}
            {(ungroupedPages.length > 0 || dragItem?.kind === 'page') && (
              <div
                style={{ marginBottom: 6 }}
                onDragOver={e => dnd.onContainerDragOver(null, ungroupedPages.length, e)}
                onDrop={() => dnd.commitDrop()}
              >
                {ungroupedPages.map((p, idx) => (
                  <Fragment key={p.id}>
                    {dropHint?.kind === 'page' && dropHint.container === null && dropHint.index === idx && <DropLine />}
                    <PageItem
                      page={p}
                      isActive={activePage?.id === p.id}
                      groups={groups}
                      isFirst={idx === 0}
                      isLast={idx === ungroupedPages.length - 1}
                      dnd={dnd}
                      index={idx}
                      container={null}
                      onClick={() => activePage?.id !== p.id && openPage(p.id)}
                      onDelete={() => handleDeletePage(p)}
                      onMoveUp={() => movePageUp(p)}
                      onMoveDown={() => movePageDown(p)}
                      onMoveToGroup={groupId => movePageToGroup(p, groupId)}
                    />
                  </Fragment>
                ))}
                {dropHint?.kind === 'page' && dropHint.container === null && dropHint.index === ungroupedPages.length && <DropLine />}
                {ungroupedPages.length === 0 && dragItem?.kind === 'page' && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px', textAlign: 'center', border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-sm)', fontStyle: 'italic' }}>
                    Drop here to ungroup
                  </div>
                )}
              </div>
            )}

            {/* Groups */}
            {sortedGroups.map((group, gIdx) => (
              <Fragment key={group.id}>
                {dropHint?.kind === 'group' && dropHint.index === gIdx && <DropLine />}
                <GroupSection
                  group={group}
                  pages={pagesForGroup(group.id)}
                  groups={groups}
                  isFirst={gIdx === 0}
                  isLast={gIdx === sortedGroups.length - 1}
                  groupIndex={gIdx}
                  dnd={dnd}
                  dropHint={dropHint}
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
                  onChangeGroupColor={color => handleChangeGroupColor(group.id, color)}
                />
              </Fragment>
            ))}
            {dropHint?.kind === 'group' && dropHint.index === sortedGroups.length && <DropLine />}

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