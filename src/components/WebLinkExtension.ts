// path: src/components/WebLinkExtension.ts
// Plain web links in rich text — the YouTube video you pasted for inspiration,
// the homebrew thread, the map generator. Distinct from wikiLink/sessionLink/
// spellLink, which point inside the campaign; this one leaves the app, so
// clicking it opens the user's own browser (handled in RichEditor).
//
// Two ways a link gets made, deliberately no more:
//   • pasting a URL, which is the case this exists for
//   • typing one and then pressing space or Enter
// Nothing linkifies mid-word as you type, so a half-typed address is never
// turned into a link you then have to fight.

import { Mark, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

// Deliberately conservative: a scheme we can hand to the OS, or a bare
// www.-style host. No bare "foo.com" — too many false hits on ordinary prose
// ("...the fall of Rome.Ancient history..." and similar run-together text).
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()[\]{}"']+/gi

/** Trailing punctuation belongs to the sentence, not the address. */
function trimTrailing(url: string): string {
  return url.replace(/[.,;:!?'"]+$/, '')
}

/** What the OS should be handed for a match — www.x.com needs a scheme. */
export function normalizeUrl(raw: string): string {
  const trimmed = trimTrailing(raw)
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

/** Whole string is a single URL (used by the paste handler). */
export function isUrlOnly(text: string): boolean {
  const t = text.trim()
  if (/\s/.test(t)) return false
  URL_RE.lastIndex = 0
  const m = URL_RE.exec(t)
  return !!m && m[0].length === t.length
}

export const WebLink = Mark.create({
  name: 'webLink',
  priority: 1000,
  keepOnSplit: false,
  inclusive: false,        // typing after a link doesn't extend it
  exitable: true,

  addAttributes() {
    return {
      href: { default: null },
    }
  },

  parseHTML() {
    // Pasting rich content from a browser brings real anchors with it. Keep the
    // campaign's own link types out of this — they parse from <span data-*>.
    return [{
      tag: 'a[href]',
      getAttrs: el => {
        const href = (el as HTMLElement).getAttribute('href') || ''
        return /^(https?:|mailto:)/i.test(href) ? { href } : false
      },
    }]
  },

  renderHTML({ mark, HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(
        {
          'data-web-link': '',
          href: mark.attrs.href,
          class: 'web-link',
          // The click is intercepted in RichEditor, but if one ever escapes,
          // these keep it from opening a second Electron window.
          rel: 'noopener noreferrer',
          title: mark.attrs.href,
        },
        HTMLAttributes,
      ),
      0,
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        // Space or Enter closes off the address just typed, exactly as the
        // session-link plugin treats \\…\\.
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some(tr => tr.docChanged)) return null

          const { from, $from } = newState.selection
          const charBefore = from > 0 ? newState.doc.textBetween(Math.max(0, from - 1), from) : ''
          if (charBefore !== ' ' && !($from.parentOffset === 0 && $from.parent.isTextblock)) return null

          const matches: { from: number; to: number; href: string }[] = []
          newState.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return
            // Already a link of some kind (web, wiki, session, spell)? Leave it.
            if (node.marks.length > 0) return
            URL_RE.lastIndex = 0
            let match: RegExpExecArray | null
            while ((match = URL_RE.exec(node.text)) !== null) {
              const text = trimTrailing(match[0])
              if (!text) continue
              matches.push({
                from: pos + match.index,
                to: pos + match.index + text.length,
                href: normalizeUrl(text),
              })
            }
          })
          if (matches.length === 0) return null

          const tr = newState.tr
          // Back to front so earlier positions stay valid.
          for (let i = matches.length - 1; i >= 0; i--) {
            const m = matches[i]
            tr.addMark(m.from, m.to, newState.schema.marks.webLink.create({ href: m.href }))
          }
          return tr.steps.length > 0 ? tr : null
        },
      }),
    ]
  },
})
