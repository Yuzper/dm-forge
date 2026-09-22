// path: src/components/DmOnlyMark.ts
// "DM-only" redaction, in two halves.
//
// `DmOnly` is an inline mark covering text runs. That alone used to be the whole
// feature, and it silently under-delivered: images and horizontal rules are BLOCK
// nodes with no inline content, so `toggleMark` skipped straight over them. A DM
// could select a secret passage, watch the text turn red, and still publish the
// map of the villain's lair sitting in the middle of it.
//
// `DmOnlyBlock` closes that by adding a `dmOnly` boolean attribute to exactly the
// leaf block types the mark can't reach, and `toggleDmOnly` drives both together
// so one button press means one thing. The publish pipeline drops nodes carrying
// either signal (electron/main/ipc/publishCore.ts).
import { Mark, Extension, mergeAttributes } from '@tiptap/core'

// Block nodes with no inline content — the mark cannot land on these, so they
// carry the flag as a node attribute instead. Every other block in the schema
// (paragraph, heading, list item, table cell, blockquote…) holds text, so
// marking that text covers it and the exporter prunes the emptied husk.
export const DM_ONLY_NODE_TYPES = ['image', 'horizontalRule']

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    dmOnly: {
      /** Toggle DM-only over the selection: inline runs and leaf blocks alike. */
      toggleDmOnly: () => ReturnType
    }
  }
}

export const DmOnly = Mark.create({
  name: 'dmOnly',

  parseHTML() {
    return [{ tag: 'span[data-dm-only]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-dm-only': 'true', class: 'dm-only' }), 0]
  },

  addCommands() {
    return {
      toggleDmOnly: () => ({ state, tr, dispatch, editor, commands }) => {
        const markType = state.schema.marks.dmOnly
        const { from, to, empty } = state.selection

        const blocks: number[] = []
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (DM_ONLY_NODE_TYPES.includes(node.type.name)) blocks.push(pos)
        })
        // No separator arguments on purpose: passing a leafText makes an atom
        // like an image report as " ", so a lone image would look like inline
        // content, take the mark branch, and never toggle back off.
        const hasInline = state.doc.textBetween(from, to).length > 0

        // Nothing but a collapsed cursor: fall back to the plain mark toggle so
        // stored marks work and the DM can type straight into a secret run.
        if (empty && blocks.length === 0) return commands.toggleMark('dmOnly')

        // Direction comes from whatever the selection actually contains. For a
        // lone image the mark is never active, so its own attribute decides —
        // otherwise clicking the button twice would never turn it back off.
        const currentlyOn = hasInline
          ? editor.isActive('dmOnly')
          : blocks.length > 0 && blocks.every(pos => state.doc.nodeAt(pos)?.attrs?.dmOnly === true)
        const turningOn = !currentlyOn

        if (!dispatch) return true

        // setNodeMarkup keeps the document size unchanged, so the positions
        // collected above stay valid across the loop.
        for (const pos of blocks) {
          const node = state.doc.nodeAt(pos)
          if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, dmOnly: turningOn })
        }
        if (!empty && markType) {
          if (turningOn) tr.addMark(from, to, markType.create())
          else tr.removeMark(from, to, markType)
        }
        dispatch(tr)
        return true
      },
    }
  },
})

export const DmOnlyBlock = Extension.create({
  name: 'dmOnlyBlock',

  addGlobalAttributes() {
    return [{
      types: DM_ONLY_NODE_TYPES,
      attributes: {
        dmOnly: {
          default: false,
          parseHTML: (el: HTMLElement) => el.getAttribute('data-dm-only') === 'true',
          // Only emitted when set, so untouched images keep rendering clean.
          renderHTML: (attrs: any) =>
            attrs.dmOnly ? { 'data-dm-only': 'true', class: 'dm-only-block' } : {},
        },
      },
    }]
  },
})
