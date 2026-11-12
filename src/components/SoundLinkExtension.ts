// path: src/components/SoundLinkExtension.ts
import { Mark, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

const soundSearchKey = new PluginKey('soundSearch')

// A shortcut to the soundboard: clicking the link plays that library sound (or
// sets it as the music / ambience). `soundId` is the sound_library row; the
// name and category ride along so the link still reads and colours correctly
// if the library entry has since been deleted.
export const SoundLink = Mark.create({
  name: 'soundLink',
  priority: 1000,
  keepOnSplit: false,
  inclusive: false,

  addAttributes() {
    return {
      soundId:  { default: null },
      name:     { default: null },
      category: { default: 'effect' },
    }
  },

  parseHTML() {
    return [{
      tag: 'span[data-sound-link]',
      getAttrs: el => ({
        soundId:  parseInt((el as HTMLElement).getAttribute('data-sound-link') || '0') || null,
        name:     (el as HTMLElement).getAttribute('data-sound-name'),
        category: (el as HTMLElement).getAttribute('data-sound-category') || 'effect',
      }),
    }]
  },

  renderHTML({ mark, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        {
          'data-sound-link':     String(mark.attrs.soundId),
          'data-sound-name':     mark.attrs.name,
          'data-sound-category': mark.attrs.category,
          class: 'sound-link',
        },
        HTMLAttributes
      ),
      0,
    ]
  },

  addProseMirrorPlugins() {
    return [
      // ── Fire DOM events for live %% search ───────────────────────────────
      new Plugin({
        key: soundSearchKey,
        view(_editorView) {
          return {
            update(view) {
              const { from } = view.state.selection
              const $from = view.state.doc.resolve(from)
              const blockStart = $from.start()
              const textBeforeCursor = view.state.doc.textBetween(blockStart, from)
              // Sound names have spaces ("Tavern Brawl"), so — like the session
              // link — the query runs to the cursor rather than to the first space.
              const match = textBeforeCursor.match(/%%([^%]*)$/)

              if (match) {
                const query = match[1]
                const matchFrom = blockStart + textBeforeCursor.lastIndexOf('%%')
                const coords = view.coordsAtPos(from)
                view.dom.dispatchEvent(new CustomEvent('soundlinkSearch', {
                  detail: { query, from: matchFrom, to: from, coords },
                  bubbles: true,
                }))
              } else {
                view.dom.dispatchEvent(new CustomEvent('soundlinkSearchClose', { bubbles: true }))
              }
            },
            destroy() {},
          }
        },
      }),
    ]
  },
})
