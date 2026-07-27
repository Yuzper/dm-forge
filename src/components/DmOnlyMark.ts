// path: src/components/DmOnlyMark.ts
// Inline mark flagging text as DM-only. It renders with a red tint in the editor
// (and the DM's read view) so secret spans are visible while authoring; the
// player-site publish pipeline strips every dmOnly-marked run and prunes any
// block it empties (electron/main/ipc/publishCore.ts). Lets one page serve both
// audiences without maintaining a duplicate.
import { Mark, mergeAttributes } from '@tiptap/core'

export const DmOnly = Mark.create({
  name: 'dmOnly',

  parseHTML() {
    return [{ tag: 'span[data-dm-only]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-dm-only': 'true', class: 'dm-only' }), 0]
  },
})
