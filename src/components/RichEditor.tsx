// path: src/components/RichEditor.tsx
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import TextStyle from '@tiptap/extension-text-style'
import { WikiLink } from './WikiLinkExtension'
import { SessionLink } from './SessionLinkExtension'
import { SpellLink } from './SpellLinkExtension'
import { useStore } from '../store/store'
import spellsData from '../data/spells_2014.json'
import {
  Bold, Italic, UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, Quote,
  AlignLeft, AlignCenter, AlignRight,
  Image as ImageIcon, Highlighter, Link2,
  Undo, Redo, Minus
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface RichEditorProps {
  content: string
  onChange: (json: string) => void
  placeholder?: string
  onWikiLinkClick?: (title: string) => void
  readOnly?: boolean
  expandable?: boolean
}

function ToolbarButton({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 28, height: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'var(--bg-active)' : 'transparent',
        border: active ? '1px solid var(--border-gold)' : '1px solid transparent',
        borderRadius: 4,
        color: active ? 'var(--gold)' : 'var(--text-secondary)',
        cursor: 'pointer',
        transition: 'all 120ms ease',
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' } }}
      onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' } }}
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return <div style={{ width: 1, height: 18, background: 'var(--border-light)', margin: '0 2px', flexShrink: 0 }} />
}

// ── Wiki Link Popover ──────────────────────────────────────────────────────────

function WikiLinkPopover({ query, coords, onSelect, onClose }: {
  query: string
  coords: { left: number; top: number; bottom: number }
  onSelect: (title: string) => void
  onClose: () => void
}) {
  const { articles } = useStore()
  const ref = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const filtered = articles.filter(a =>
    a.title.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => { setSelectedIndex(0) }, [query])

  useEffect(() => {
    const el = ref.current?.querySelectorAll('[data-wiki-option]')[selectedIndex] as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filtered.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)) }
      else if (e.key === 'Tab') { e.preventDefault(); setSelectedIndex(i => (i + 1) % filtered.length) }
      else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault(); e.stopPropagation()
        onSelect(filtered[selectedIndex].title)
      } else if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [filtered, selectedIndex, onSelect, onClose])

  if (filtered.length === 0 && query === '') return null

  return (
    <div ref={ref} style={{
      position: 'fixed', left: coords.left, top: coords.bottom + 6,
      width: 260, background: 'var(--bg-elevated)',
      border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-md)', zIndex: 1000, overflow: 'hidden',
    }}>
      {filtered.length === 0 ? (
        <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
          No articles match "{query}"
        </div>
      ) : (
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          {filtered.map((a, i) => (
            <button
              key={a.id}
              data-wiki-option
              onMouseDown={e => { e.preventDefault(); onSelect(a.title) }}
              onMouseEnter={() => setSelectedIndex(i)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px',
                background: i === selectedIndex ? 'var(--bg-hover)' : 'none',
                border: 'none',
                color: i === selectedIndex ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: 13, fontFamily: 'var(--font-ui)', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.title}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                {a.article_type}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function WikiLinkToolbarPopover({ onSelect, onClose }: {
  onSelect: (title: string) => void
  onClose: () => void
}) {
  const { articles } = useStore()
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const filtered = articles.filter(a =>
    a.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 40, left: 0,
      width: 260, background: 'var(--bg-elevated)',
      border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-md)', zIndex: 100, overflow: 'hidden',
    }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
        <input
          ref={inputRef}
          className="input"
          style={{ height: 30, fontSize: 12 }}
          placeholder="Search articles…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && filtered.length > 0) onSelect(filtered[0].title)
          }}
        />
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            {search ? `No articles match "${search}"` : 'No articles yet'}
          </div>
        ) : (
          filtered.map(a => (
            <button
              key={a.id}
              onMouseDown={e => { e.preventDefault(); onSelect(a.title) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', background: 'none', border: 'none',
                color: 'var(--text-secondary)', fontSize: 13,
                fontFamily: 'var(--font-ui)', cursor: 'pointer', textAlign: 'left',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.title}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                {a.article_type}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// ── Spell types ────────────────────────────────────────────────────────────────

type Spell = {
  name: string
  level: number
  school: string
  casting_time: string
  range: string
  components: string
  duration: string
  desc: string
  higher_levels?: string
}

const spells: Spell[] = spellsData as Spell[]

function levelLabel(level: number): string {
  if (level === 0) return 'Cantrip'
  if (level === 1) return '1st-level'
  if (level === 2) return '2nd-level'
  if (level === 3) return '3rd-level'
  return `${level}th-level`
}

// ── Spell Search Popover ───────────────────────────────────────────────────────

function SpellLinkPopover({ query, coords, onSelect, onClose }: {
  query: string
  coords: { left: number; top: number; bottom: number }
  onSelect: (spellName: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const filtered = spells.filter(s =>
    s.name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8)

  useEffect(() => { setSelectedIndex(0) }, [query])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filtered.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)) }
      else if (e.key === 'Tab') { e.preventDefault(); setSelectedIndex(i => (i + 1) % filtered.length) }
      else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault(); e.stopPropagation()
        onSelect(filtered[selectedIndex].name)
      } else if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [filtered, selectedIndex, onSelect, onClose])

  if (filtered.length === 0 && query === '') return null

  return (
    <div ref={ref} style={{
      position: 'fixed', left: coords.left, top: coords.bottom + 6,
      width: 300, background: 'var(--bg-elevated)',
      border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-md)', zIndex: 1000, overflow: 'hidden',
    }}>
      {filtered.length === 0 ? (
        <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
          No spells match "{query}"
        </div>
      ) : (
        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
          {filtered.map((s, i) => (
            <button
              key={s.name}
              onMouseDown={e => { e.preventDefault(); onSelect(s.name) }}
              onMouseEnter={() => setSelectedIndex(i)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px',
                background: i === selectedIndex ? 'var(--bg-hover)' : 'none',
                border: 'none',
                color: i === selectedIndex ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: 13, fontFamily: 'var(--font-ui)', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.name}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                {s.level === 0 ? 'Cantrip' : `Lv ${s.level}`} · {s.school}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Spell Hover Card ───────────────────────────────────────────────────────────

function SpellHoverCard({ spell, x, y }: { spell: Spell; x: number; y: number }) {
  // Position card above cursor, or below if near top
  const cardHeight = 280
  const top = y - cardHeight - 12 < 0 ? y + 16 : y - cardHeight - 12

  return (
    <div style={{
      position: 'fixed', left: Math.min(x, window.innerWidth - 340), top,
      width: 320, zIndex: 2000, pointerEvents: 'none',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-gold)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-lg)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-gold)',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 15,
          color: 'var(--gold)', letterSpacing: '0.04em', marginBottom: 2,
        }}>
          {spell.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {levelLabel(spell.level)} {spell.school}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 0, borderBottom: '1px solid var(--border)',
      }}>
        {[
          ['Casting Time', spell.casting_time],
          ['Range', spell.range],
          ['Duration', spell.duration],
          ['Components', spell.components],
        ].map(([label, value]) => (
          <div key={label} style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-light)', borderRight: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
              {label}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Description */}
      <div style={{ padding: '10px 14px', maxHeight: 120, overflowY: 'auto' }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {spell.desc}
        </div>
        {spell.higher_levels && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.4 }}>
            <strong>At Higher Levels. </strong>{spell.higher_levels}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Session Link Popover ───────────────────────────────────────────────────────

function SessionLinkPopover({ query, coords, onSelect, onClose }: {
  query: string
  coords: { left: number; top: number; bottom: number }
  onSelect: (sessionId: number, label: string) => void
  onClose: () => void
}) {
  const { sessions } = useStore()
  const ref = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const filtered = sessions.filter(s =>
    `Session ${s.session_number}${s.session_sub ?? ''}: ${s.name}`.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => { setSelectedIndex(0) }, [query])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filtered.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)) }
      else if (e.key === 'Tab') { e.preventDefault(); setSelectedIndex(i => (i + 1) % filtered.length) }
      else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault(); e.stopPropagation()
        const s = filtered[selectedIndex]
        onSelect(s.id, `Session ${s.session_number}${s.session_sub ?? ''}: ${s.name}`)
      } else if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [filtered, selectedIndex, onSelect, onClose])

  if (filtered.length === 0 && query === '') return null

  return (
    <div ref={ref} style={{
      position: 'fixed', left: coords.left, top: coords.bottom + 6,
      width: 280, background: 'var(--bg-elevated)',
      border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-md)', zIndex: 1000, overflow: 'hidden',
    }}>
      {filtered.length === 0 ? (
        <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
          No sessions match "{query}"
        </div>
      ) : (
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          {filtered.map((s, i) => (
            <button
              key={s.id}
              onMouseDown={e => { e.preventDefault(); onSelect(s.id, `Session ${s.session_number}${s.session_sub ?? ''}: ${s.name}`) }}
              onMouseEnter={() => setSelectedIndex(i)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px',
                background: i === selectedIndex ? 'var(--bg-hover)' : 'none',
                border: 'none',
                color: i === selectedIndex ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: 13, fontFamily: 'var(--font-ui)', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Session {s.session_number}{s.session_sub ?? ''}: {s.name}
              </span>
              {s.date && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{s.date}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Editor ────────────────────────────────────────────────────────────────

export default function RichEditor({ content, onChange, placeholder, onWikiLinkClick, readOnly, expandable }: RichEditorProps) {
  const { navigateToArticleByTitle, navigateToSessionById } = useStore()
  const editorRef = useRef<HTMLDivElement>(null)

  const [wikiSearch, setWikiSearch] = useState<{
    query: string; from: number; to: number
    coords: { left: number; top: number; bottom: number }
  } | null>(null)

  const [sessionSearch, setSessionSearch] = useState<{
    query: string; from: number; to: number
    coords: { left: number; top: number; bottom: number }
  } | null>(null)

  const [spellSearch, setSpellSearch] = useState<{
    query: string; from: number; to: number
    coords: { left: number; top: number; bottom: number }
  } | null>(null)

  const [hoveredSpell, setHoveredSpell] = useState<{ spell: Spell; x: number; y: number } | null>(null)

  const [showToolbarPopover, setShowToolbarPopover] = useState(false)

  const parsedContent = (() => {
    try {
      const parsed = content ? JSON.parse(content) : null
      if (!parsed?.content?.length) return { type: 'doc', content: [{ type: 'paragraph' }] }
      return parsed
    }
    catch { return { type: 'doc', content: [{ type: 'paragraph' }] } }
  })()

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextStyle,
      Highlight.configure({ multicolor: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ allowBase64: true }),
      Placeholder.configure({ placeholder: placeholder || 'Begin writing…' }),
      WikiLink,
      SessionLink,
      SpellLink,
    ],
    content: parsedContent,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      onChange(JSON.stringify(editor.getJSON()))
    },
  })

  // Sync readOnly changes
  useEffect(() => {
    if (!editor) return
    editor.setEditable(!readOnly)
  }, [editor, readOnly])

  // Handle wiki link and session link clicks
  useEffect(() => {
    if (!editorRef.current) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement

      const wikiLink = target.closest('[data-wiki-link]') as HTMLElement | null
      if (wikiLink) {
        e.preventDefault(); e.stopPropagation()
        const title = wikiLink.getAttribute('data-wiki-link')
        if (title) {
          if (onWikiLinkClick) onWikiLinkClick(title)
          else navigateToArticleByTitle(title)
        }
        return
      }

      const sessionLink = target.closest('[data-session-link]') as HTMLElement | null
      if (sessionLink) {
        e.preventDefault(); e.stopPropagation()
        const sessionId = parseInt(sessionLink.getAttribute('data-session-id') || '0')
        if (sessionId) navigateToSessionById(sessionId)
      }
    }
    const el = editorRef.current
    el.addEventListener('click', handleClick, true)
    return () => el.removeEventListener('click', handleClick, true)
  }, [onWikiLinkClick, navigateToArticleByTitle, navigateToSessionById])

  // Listen for wiki and session search events from extensions
  useEffect(() => {
    const el = editorRef.current
    if (!el) return

    const onWikiSearch = (e: Event) => {
      const { query, from, to, coords } = (e as CustomEvent).detail
      setWikiSearch({ query, from, to, coords })
      setSessionSearch(null)
    }
    const onWikiClose = () => setWikiSearch(null)

    const onSessionSearch = (e: Event) => {
      const { query, from, to, coords } = (e as CustomEvent).detail
      setSessionSearch({ query, from, to, coords })
      setWikiSearch(null)
    }
    const onSessionClose = () => setSessionSearch(null)

    const onSpellSearch = (e: Event) => {
      const { query, from, to, coords } = (e as CustomEvent).detail
      setSpellSearch({ query, from, to, coords })
      setWikiSearch(null)
      setSessionSearch(null)
    }
    const onSpellClose = () => setSpellSearch(null)

    // Spell hover — mouseover on spell-link spans
    const onMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-spell-link]') as HTMLElement | null
      if (!target) { setHoveredSpell(null); return }
      const spellName = target.getAttribute('data-spell-link')
      if (!spellName) return
      const spell = spells.find(s => s.name === spellName)
      if (spell) setHoveredSpell({ spell, x: e.clientX, y: e.clientY })
    }
    const onMouseOut = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-spell-link]')
      if (target) setHoveredSpell(null)
    }

    el.addEventListener('wikilinkSearch', onWikiSearch)
    el.addEventListener('wikilinkSearchClose', onWikiClose)
    el.addEventListener('sessionlinkSearch', onSessionSearch)
    el.addEventListener('sessionlinkSearchClose', onSessionClose)
    el.addEventListener('spelllinkSearch', onSpellSearch)
    el.addEventListener('spelllinkSearchClose', onSpellClose)
    el.addEventListener('mouseover', onMouseOver)
    el.addEventListener('mouseout', onMouseOut)
    return () => {
      el.removeEventListener('wikilinkSearch', onWikiSearch)
      el.removeEventListener('wikilinkSearchClose', onWikiClose)
      el.removeEventListener('sessionlinkSearch', onSessionSearch)
      el.removeEventListener('sessionlinkSearchClose', onSessionClose)
      el.removeEventListener('spelllinkSearch', onSpellSearch)
      el.removeEventListener('spelllinkSearchClose', onSpellClose)
      el.removeEventListener('mouseover', onMouseOver)
      el.removeEventListener('mouseout', onMouseOut)
    }
  }, [])

  const insertImage = async () => {
    if (!editor) return
    const path = await window.api.selectImageFile()
    if (!path) return
    const fullPath = await window.api.getImagePath(path)
    editor.chain().focus().setImage({ src: fullPath }).run()
  }

  const insertWikiLinkInline = (title: string) => {
    if (!editor || !wikiSearch) return
    editor.chain().focus()
      .deleteRange({ from: wikiSearch.from, to: wikiSearch.to })
      .insertContentAt(wikiSearch.from, {
        type: 'text', text: title,
        marks: [{ type: 'wikiLink', attrs: { title } }],
      })
      .run()
    setWikiSearch(null)
  }

  const insertWikiLinkFromToolbar = (title: string) => {
    if (!editor) return
    editor.chain().focus().insertContent({
      type: 'text', text: title,
      marks: [{ type: 'wikiLink', attrs: { title } }],
    }).run()
    setShowToolbarPopover(false)
  }

  const insertSessionLinkInline = (sessionId: number, label: string) => {
    if (!editor || !sessionSearch) return
    editor.chain().focus()
      .deleteRange({ from: sessionSearch.from, to: sessionSearch.to })
      .insertContentAt(sessionSearch.from, {
        type: 'text', text: label,
        marks: [{ type: 'sessionLink', attrs: { sessionId, label } }],
      })
      .run()
    setSessionSearch(null)
  }

  const insertSpellLink = (spellName: string) => {
    if (!editor || !spellSearch) return
    editor.chain().focus()
      .deleteRange({ from: spellSearch.from, to: spellSearch.to })
      .insertContentAt(spellSearch.from, {
        type: 'text', text: spellName,
        marks: [{ type: 'spellLink', attrs: { spellName } }],
      })
      .run()
    setSpellSearch(null)
  }

  if (!editor) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: expandable ? 'auto' : '100%' }}>
      {!readOnly && (
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2,
          padding: '6px 10px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          flexShrink: 0,
          position: 'relative',
        }}>
          <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo"><Undo size={13} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo"><Redo size={13} /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1"><Heading1 size={14} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2"><Heading2 size={14} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3"><Heading3 size={14} /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold"><Bold size={13} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic"><Italic size={13} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline"><UnderlineIcon size={13} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough"><Strikethrough size={13} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title="Highlight"><Highlighter size={13} /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list"><List size={14} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list"><ListOrdered size={14} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote"><Quote size={13} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider"><Minus size={13} /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align left"><AlignLeft size={13} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align center"><AlignCenter size={13} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align right"><AlignRight size={13} /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton onClick={insertImage} title="Insert image"><ImageIcon size={13} /></ToolbarButton>
          <ToolbarButton
            onClick={() => setShowToolbarPopover(v => !v)}
            active={showToolbarPopover}
            title="Insert wiki link"
          >
            <Link2 size={13} />
          </ToolbarButton>

          {showToolbarPopover && (
            <WikiLinkToolbarPopover
              onSelect={insertWikiLinkFromToolbar}
              onClose={() => setShowToolbarPopover(false)}
            />
          )}
        </div>
      )}

      <div
        ref={editorRef}
        style={{
          flex: expandable ? undefined : 1,
          overflow: expandable ? 'visible' : 'auto',
          minHeight: expandable ? 240 : undefined,
          padding: '16px 20px',
        }}
        onClick={() => editor.chain().focus().run()}
      >
        <EditorContent editor={editor} style={{ height: '100%' }} />
      </div>

      {wikiSearch && (
        <WikiLinkPopover
          query={wikiSearch.query}
          coords={wikiSearch.coords}
          onSelect={insertWikiLinkInline}
          onClose={() => setWikiSearch(null)}
        />
      )}

      {sessionSearch && (
        <SessionLinkPopover
          query={sessionSearch.query}
          coords={sessionSearch.coords}
          onSelect={insertSessionLinkInline}
          onClose={() => setSessionSearch(null)}
        />
      )}

      {spellSearch && (
        <SpellLinkPopover
          query={spellSearch.query}
          coords={spellSearch.coords}
          onSelect={insertSpellLink}
          onClose={() => setSpellSearch(null)}
        />
      )}

      {hoveredSpell && (
        <SpellHoverCard
          spell={hoveredSpell.spell}
          x={hoveredSpell.x}
          y={hoveredSpell.y}
        />
      )}
    </div>
  )
}