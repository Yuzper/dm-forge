// path: src/components/WikiAutolinkExtension.ts
//
// Autolink: surface existing articles while writing, so the DM can link them
// without typing `[[`. Two parts:
//
//   Underline (passive): every exact-title mention in the text gets a dotted
//     underline. Click it — or press Mod+Shift+L on it — to link.
//   Live dropdown (active): typing a bare word (4+ chars) that matches article
//     titles fires `wikiWordSuggest`; RichEditor renders the picker (Tab/Enter
//     accepts). Skips [[ / @@ / \\ popovers and already-linked spans.
//
// Scaling notes:
//  • The title index is memoised by the article-list reference, so it rebuilds
//    only when articles change — not on every keystroke. Lookups are O(1), so
//    match cost is flat in article count.
//  • Decoration recompute is debounced and only scans on text change; between
//    scans, existing decorations are position-mapped through edits (cheap).
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { useStore } from '../store/store'

const key = new PluginKey<DecorationSet>('wikiAutolink')

export interface WikiAutolinkOptions {
  // The article being edited — never suggest linking a page to itself.
  excludeTitle?: string | null
  // Titles shorter than this are ignored (short words = too many false hits).
  minLength: number
  // Cap on how many words a title may span (bounds the sliding window).
  maxWords: number
  // Idle delay before rescanning the doc for mentions.
  debounceMs: number
  // Min length of a partial word before the live article dropdown may open.
  suggestMinChars: number
  // Proper-noun gate: only treat text as a mention when it's capitalised like the
  // title. Cuts false positives ("master" in prose vs. the article "Spymaster")
  // without hiding lowercase-titled articles.
  requireCapitalized: boolean
}

// The bare word ending at the cursor, and the open-sentinel patterns for the
// [[ / @@ / \\ popovers — the live dropdown must stay out of their way.
const WORD_AT_END = /(\p{L}[\p{L}\p{N}'’\-]*)$/u
const OPEN_SENTINELS = [/\[\[[^\[\]]*$/, /@@[^@\s]*$/, /\\\\[^\\]*$/]

// A capitalised title only matches capitalised text; a lowercase title matches
// anything. (First-letter case is the signal — cheap and good enough.)
const isUpperFirst = (s: string) => !!s && s[0] !== s[0].toLowerCase()
const capitalizationMatches = (text: string, title: string) => !isUpperFirst(title) || isUpperFirst(text)

// ── Memoised title index ───────────────────────────────────────────────────────
// Rebuilt only when the article list reference (or the relevant options) change,
// so per-keystroke cost doesn't scale with the number of articles.
interface TitleIndex { articles: unknown; exclude: string | null; minLength: number; index: Map<string, string>; maxWords: number }
let cache: TitleIndex | null = null

function getTitleIndex(options: WikiAutolinkOptions): TitleIndex {
  const articles = useStore.getState().allArticles
  const exclude = options.excludeTitle?.toLowerCase().trim() || null
  if (cache && cache.articles === articles && cache.exclude === exclude && cache.minLength === options.minLength) {
    return cache
  }
  const index = new Map<string, string>()
  let maxWords = 1
  for (const a of articles) {
    const t = a.title.trim()
    if (t.length < options.minLength) continue
    if (exclude && t.toLowerCase() === exclude) continue
    index.set(t.toLowerCase(), t)
    maxWords = Math.max(maxWords, t.split(/\s+/).length)
  }
  cache = { articles, exclude, minLength: options.minLength, index, maxWords: Math.min(maxWords, options.maxWords) }
  return cache
}

// Build the set of decorations for the current doc from the memoised index.
function buildDecorations(doc: PMNode, options: WikiAutolinkOptions): DecorationSet {
  const { index, maxWords } = getTitleIndex(options)
  if (index.size === 0) return DecorationSet.empty

  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    if (node.marks.some(m => m.type.name === 'wikiLink')) return // already a link

    const text = node.text
    const tokens: { start: number; end: number }[] = []
    const re = /\S+/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) tokens.push({ start: m.index, end: m.index + m[0].length })

    for (let i = 0; i < tokens.length; i++) {
      // Greedy: prefer the longest matching phrase starting at token i.
      for (let n = Math.min(maxWords, tokens.length - i); n >= 1; n--) {
        const rawStart = tokens[i].start
        const rawEnd = tokens[i + n - 1].end
        const raw = text.slice(rawStart, rawEnd)
        // Trim surrounding punctuation ("Gunba." → "Gunba") for the lookup, then
        // recover exact offsets so the decoration hugs the words themselves.
        const lead = raw.length - raw.replace(/^[^\p{L}\p{N}]+/u, '').length
        const trail = raw.length - raw.replace(/[^\p{L}\p{N}]+$/u, '').length
        const stripped = raw.slice(lead, raw.length - trail)
        if (!stripped) continue
        const canonical = index.get(stripped.toLowerCase())
        if (canonical && (!options.requireCapitalized || capitalizationMatches(stripped, canonical))) {
          const from = pos + rawStart + lead
          const to = from + stripped.length
          decorations.push(Decoration.inline(
            from, to,
            { class: 'wiki-mention-suggest', title: `Link to “${canonical}”` },
            { linkTitle: canonical },
          ))
          i += n - 1 // consume matched tokens; no overlapping suggestions
          break
        }
      }
    }
  })

  return DecorationSet.create(doc, decorations)
}

type Hit = { from: number; to: number; title: string }

// The suggestion (if any) whose range covers a document position.
function mentionAt(state: EditorState, pos: number): Hit | null {
  const set = key.getState(state)
  if (!set) return null
  const d = set.find(pos, pos)[0] as (Decoration & { from: number; to: number; spec: any }) | undefined
  if (!d) return null
  return { from: d.from, to: d.to, title: d.spec.linkTitle }
}

// The suggestion the (collapsed) cursor is inside or sitting just after — used to
// decide whether to show the Option-B hint.
function mentionCoveringCursor(state: EditorState): Hit | null {
  const sel = state.selection
  if (!sel.empty) return null
  const pos = sel.from
  const set = key.getState(state)
  if (!set) return null
  const hits = set.find(Math.max(0, pos - 1), pos) as (Decoration & { from: number; to: number; spec: any })[]
  const d = hits.find(h => h.from <= pos && pos <= h.to)
  return d ? { from: d.from, to: d.to, title: d.spec.linkTitle } : null
}

// Replace a range with the same text, now carrying a wikiLink mark.
function linkRange(state: EditorState, from: number, to: number, title: string) {
  return state.tr.replaceWith(from, to, state.schema.text(title, [
    state.schema.marks.wikiLink.create({ title }),
  ]))
}

export const WikiAutolink = Extension.create<WikiAutolinkOptions>({
  name: 'wikiAutolink',

  addOptions() {
    return { excludeTitle: null, minLength: 3, maxWords: 20, debounceMs: 150, suggestMinChars: 4, requireCapitalized: true }
  },

  addProseMirrorPlugins() {
    const options = this.options
    let timer: ReturnType<typeof setTimeout> | null = null

    // Live dropdown: the bare word being typed → suggest existing articles. Fired
    // on every edit/caret move (not debounced) so the list tracks typing. Skips
    // when inside a [[ / @@ / \\ popover or an already-linked span; the RichEditor
    // side decides whether any article actually matches.
    const fireWordSuggest = (view: EditorView) => {
      const dom = view.dom
      const close = () => dom.dispatchEvent(new CustomEvent('wikiWordSuggestClose', { bubbles: true }))
      const sel = view.state.selection
      if (!sel.empty) { close(); return }
      const from = sel.from
      const $from = view.state.doc.resolve(from)
      const textBefore = view.state.doc.textBetween($from.start(), from, '\n', '￼')
      if (OPEN_SENTINELS.some(re => re.test(textBefore))) { close(); return }
      const m = textBefore.match(WORD_AT_END)
      if (!m || m[1].length < options.suggestMinChars) { close(); return }
      // Proper-noun gate: skip lowercase words (also avoids the match scan for them).
      if (options.requireCapitalized && !isUpperFirst(m[1])) { close(); return }
      const wordFrom = from - m[1].length
      const wikiType = view.state.schema.marks.wikiLink
      if (wikiType && view.state.doc.rangeHasMark(wordFrom, from, wikiType)) { close(); return }
      const coords = view.coordsAtPos(from)
      dom.dispatchEvent(new CustomEvent('wikiWordSuggest', {
        detail: { query: m[1], from: wordFrom, to: from, coords: { left: coords.left, top: coords.top, bottom: coords.bottom } },
        bubbles: true,
      }))
    }

    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_config, state) => buildDecorations(state.doc, options),
          apply: (tr, old) => {
            const meta = tr.getMeta(key) as DecorationSet | undefined
            if (meta) return meta                 // fresh scan from the debounce
            return old.map(tr.mapping, tr.doc)     // keep positions while typing
          },
        },
        view() {
          return {
            update(view, prevState) {
              const docChanged = !view.state.doc.eq(prevState.doc)
              const selChanged = !view.state.selection.eq(prevState.selection)
              if (docChanged) {
                // Text changed: debounce a rescan of the underline decorations.
                if (timer) clearTimeout(timer)
                timer = setTimeout(() => {
                  view.dispatch(view.state.tr.setMeta(key, buildDecorations(view.state.doc, options)))
                }, options.debounceMs)
              }
              // The live dropdown must feel instant, so it's never debounced.
              if (docChanged || selChanged) fireWordSuggest(view)
            },
            destroy() { if (timer) clearTimeout(timer) },
          }
        },
        props: {
          decorations(state) { return key.getState(state) },
          // Click a suggestion to link it. TUNING: require Alt/Meta here if plain
          // clicks-to-link prove too eager while editing.
          handleClick(view, pos) {
            const hit = mentionAt(view.state, pos)
            if (!hit) return false
            view.dispatch(linkRange(view.state, hit.from, hit.to, hit.title))
            return true
          },
        },
      }),
    ]
  },

  addKeyboardShortcuts() {
    // Alternative to the Tab hint: link the mention at the cursor.
    return {
      'Mod-Shift-l': ({ editor }) => {
        const hit = mentionCoveringCursor(editor.state)
        if (!hit) return false
        editor.view.dispatch(linkRange(editor.state, hit.from, hit.to, hit.title))
        return true
      },
    }
  },
})
