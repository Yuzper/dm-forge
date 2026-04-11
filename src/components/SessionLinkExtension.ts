// path: src/components/SessionLinkExtension.ts
import { Mark, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

const sessionSearchKey = new PluginKey('sessionSearch')

export const SessionLink = Mark.create({
  name: 'sessionLink',
  priority: 1000,
  keepOnSplit: false,
  inclusive: false,

  addAttributes() {
    return {
      sessionId: { default: null },
      label:     { default: null },
    }
  },

  parseHTML() {
    return [{
      tag: 'span[data-session-link]',
      getAttrs: el => ({
        sessionId: parseInt((el as HTMLElement).getAttribute('data-session-id') || '0') || null,
        label:     (el as HTMLElement).getAttribute('data-session-link'),
      }),
    }]
  },

  renderHTML({ mark, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        {
          'data-session-link': mark.attrs.label,
          'data-session-id':   String(mark.attrs.sessionId),
          class: 'session-link',
        },
        HTMLAttributes
      ),
      0,
    ]
  },

  addProseMirrorPlugins() {
    // Matches ((anything)) with optional closing ))
    const sessionLinkRegex = /\(\(([^()]+)\)\)/g

    return [
      // ── Convert ((Label)) to link on space/Enter ──────────────────────────
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

          const matches: { from: number; to: number; label: string }[] = []

          newState.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return
            sessionLinkRegex.lastIndex = 0
            let match
            while ((match = sessionLinkRegex.exec(node.text)) !== null) {
              matches.push({
                from:  pos + match.index,
                to:    pos + match.index + match[0].length,
                label: match[1],
              })
            }
          })

          if (matches.length === 0) return null

          const tr = newState.tr
          for (let i = matches.length - 1; i >= 0; i--) {
            const { from, to, label } = matches[i]
            // Store sessionId as 0 for now — resolved on click via label lookup
            tr.replaceWith(from, to, newState.schema.text(label, [
              newState.schema.marks.sessionLink.create({ sessionId: null, label })
            ]))
          }

          return tr
        },
      }),

      // ── Fire DOM events for live (( search ───────────────────────────────
      new Plugin({
        key: sessionSearchKey,
        view(editorView) {
          return {
            update(view) {
              const { from } = view.state.selection
              const $from = view.state.doc.resolve(from)
              const blockStart = $from.start()
              const textBeforeCursor = view.state.doc.textBetween(blockStart, from)
              const match = textBeforeCursor.match(/\(\(([^()]*)$/)

              if (match) {
                const query = match[1]
                const matchFrom = blockStart + textBeforeCursor.lastIndexOf('((')
                const coords = view.coordsAtPos(from)
                view.dom.dispatchEvent(new CustomEvent('sessionlinkSearch', {
                  detail: { query, from: matchFrom, to: from, coords },
                  bubbles: true,
                }))
              } else {
                view.dom.dispatchEvent(new CustomEvent('sessionlinkSearchClose', { bubbles: true }))
              }
            },
            destroy() {},
          }
        },
      }),
    ]
  },
})