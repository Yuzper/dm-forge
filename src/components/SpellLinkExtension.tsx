// path: src/components/SpellLinkExtension.ts
import { Mark, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

const spellSearchKey = new PluginKey('spellSearch')

export const SpellLink = Mark.create({
  name: 'spellLink',
  priority: 1000,
  keepOnSplit: false,
  inclusive: false,

  addAttributes() {
    return {
      spellName: { default: null },
    }
  },

  parseHTML() {
    return [{
      tag: 'span[data-spell-link]',
      getAttrs: el => ({
        spellName: (el as HTMLElement).getAttribute('data-spell-link'),
      }),
    }]
  },

  renderHTML({ mark, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        {
          'data-spell-link': mark.attrs.spellName,
          class: 'spell-link',
        },
        HTMLAttributes
      ),
      0,
    ]
  },

  addProseMirrorPlugins() {
    return [
      // ── Fire DOM events for live @ search ────────────────────────────────
      new Plugin({
        key: spellSearchKey,
        view(editorView) {
          return {
            update(view) {
              const { from } = view.state.selection
              const $from = view.state.doc.resolve(from)
              const blockStart = $from.start()
              const textBeforeCursor = view.state.doc.textBetween(blockStart, from)
              // Match @ followed by non-space characters
              const match = textBeforeCursor.match(/@([^@\s]*)$/)

              if (match) {
                const query = match[1]
                const matchFrom = blockStart + textBeforeCursor.lastIndexOf('@')
                const coords = view.coordsAtPos(from)
                view.dom.dispatchEvent(new CustomEvent('spelllinkSearch', {
                  detail: { query, from: matchFrom, to: from, coords },
                  bubbles: true,
                }))
              } else {
                view.dom.dispatchEvent(new CustomEvent('spelllinkSearchClose', { bubbles: true }))
              }
            },
            destroy() {},
          }
        },
      }),
    ]
  },
})