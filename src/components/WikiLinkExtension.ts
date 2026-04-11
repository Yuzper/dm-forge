// path: src/components/WikiLinkExtension.ts
import { Mark, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { useStore } from '../store/store'

const wikiSearchKey = new PluginKey('wikiSearch')
const wikiBrokenKey = new PluginKey('wikiBroken')

export const WikiLink = Mark.create({
  name: 'wikiLink',
  priority: 1000,
  keepOnSplit: false,
  inclusive: false,

  addAttributes() {
    return {
      title: { default: null },
    }
  },

  parseHTML() {
    return [{
      tag: 'span[data-wiki-link]',
      getAttrs: el => ({ title: (el as HTMLElement).getAttribute('data-wiki-link') }),
    }]
  },

  renderHTML({ mark, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes({ 'data-wiki-link': mark.attrs.title, class: 'wiki-link' }, HTMLAttributes),
      0,
    ]
  },

  addProseMirrorPlugins() {
    const wikiLinkRegex = /\[\[([^\[\]]+)\]\]/g

    return [
      // ── Convert [[Title]] to link on space/Enter ─────────────────────────
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some(tr => tr.docChanged)) return null

          const { from, $from } = newState.selection
          const charBefore = from > 0
            ? newState.doc.textBetween(Math.max(0, from - 1), from)
            : ''
          const isSpace = charBefore === ' '
          const isEnter = $from.parentOffset === 0 && $from.parent.isTextblock

          if (!isSpace && !isEnter) return null

          const matches: { from: number; to: number; title: string }[] = []

          newState.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return
            wikiLinkRegex.lastIndex = 0
            let match
            while ((match = wikiLinkRegex.exec(node.text)) !== null) {
              matches.push({
                from: pos + match.index,
                to: pos + match.index + match[0].length,
                title: match[1],
              })
            }
          })

          if (matches.length === 0) return null

          const tr = newState.tr
          for (let i = matches.length - 1; i >= 0; i--) {
            const { from, to, title } = matches[i]
            tr.replaceWith(from, to, newState.schema.text(title, [
              newState.schema.marks.wikiLink.create({ title })
            ]))
          }

          return tr
        },
      }),

      // ── Fire DOM events for live [[ search ───────────────────────────────
      new Plugin({
        key: wikiSearchKey,
        view(editorView) {
          return {
            update(view) {
              const { from } = view.state.selection
              const $from = view.state.doc.resolve(from)
              const blockStart = $from.start()
              const textBeforeCursor = view.state.doc.textBetween(blockStart, from)
              const match = textBeforeCursor.match(/\[\[([^\[\]]*)$/)

              if (match) {
                const query = match[1]
                const matchFrom = blockStart + textBeforeCursor.lastIndexOf('[[')
                const coords = view.coordsAtPos(from)
                view.dom.dispatchEvent(new CustomEvent('wikilinkSearch', {
                  detail: { query, from: matchFrom, to: from, coords },
                  bubbles: true,
                }))
              } else {
                view.dom.dispatchEvent(new CustomEvent('wikilinkSearchClose', { bubbles: true }))
              }
            },
            destroy() {},
          }
        },
      }),

      // ── Decorate broken links (title not in articles) ────────────────────
      new Plugin({
        key: wikiBrokenKey,
        state: {
          init() { return DecorationSet.empty },
          apply(tr, _old, _oldState, newState) {
            const articles = useStore.getState().articles
            const knownTitles = new Set(articles.map(a => a.title.toLowerCase()))
            const decorations: Decoration[] = []

            newState.doc.descendants((node, pos) => {
              if (!node.isText) return
              node.marks.forEach(mark => {
                if (mark.type.name === 'wikiLink') {
                  const title = mark.attrs.title as string
                  if (title && !knownTitles.has(title.toLowerCase())) {
                    decorations.push(
                      Decoration.inline(pos, pos + node.nodeSize, {
                        class: 'wiki-link-broken',
                      })
                    )
                  }
                }
              })
            })

            return DecorationSet.create(newState.doc, decorations)
          },
        },
        props: {
          decorations(state) { return this.getState(state) },
        },
      }),
    ]
  },
})