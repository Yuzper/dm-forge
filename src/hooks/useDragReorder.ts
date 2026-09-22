// path: src/hooks/useDragReorder.ts
// Flat-list drag-to-reorder over the native HTML5 drag events.
//
// The app grew four hand-rolled copies of this (session drafts, DM-note pages,
// workspace tabs, session map tabs) before it was worth extracting. Those stay
// as they are — the notes tree drags *between* containers, which this doesn't
// model — but every plain "drag a row up or down one list" now shares this.
//
// Only the mechanics live here: which row is being dragged, where it would land,
// and the from/to pair once it's dropped. Chrome is the caller's, because a pin
// list, a tab strip and a sound row look nothing alike.
import { useState } from 'react'
import type { DragEvent } from 'react'

/** Horizontal lists (tab strips) split on X, vertical ones on Y. */
export type ReorderAxis = 'x' | 'y'

export interface DragReorderRowProps {
  draggable: boolean
  onDragStart: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onDragEnd: () => void
}

export interface DragReorder {
  /** The row under the cursor, so the caller can fade it. */
  dragIndex: number | null
  /** True while this list has a drag in flight — handy for suppressing hovers. */
  active: boolean
  rowProps: (index: number) => DragReorderRowProps
  /**
   * Spread on the list container so releasing below (or after) the last row
   * still lands at the end, rather than doing nothing.
   */
  tailProps: (count: number) => { onDragOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void }
  /** Draw the insertion line before this row. */
  isDropBefore: (index: number) => boolean
  /** Insertion line after the last row. */
  isDropAtEnd: (count: number) => boolean
}

/** Move one item and return a new array — the usual companion to `onMove`. */
export function reorder<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/**
 * @param onMove  Called with the item's old index and its *final* index — the
 *                caller never has to correct for the gap the item leaves behind.
 *                It only fires when the position actually changes.
 */
export function useDragReorder(
  onMove: (from: number, to: number) => void,
  { axis = 'y', enabled = true }: { axis?: ReorderAxis; enabled?: boolean } = {},
): DragReorder {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  // The *gap* the row would drop into: 0..count, not a row index.
  const [dropAt, setDropAt] = useState<number | null>(null)

  const reset = () => { setDragIndex(null); setDropAt(null) }

  const commit = (at: number) => {
    const from = dragIndex
    reset()
    if (from === null) return
    // Dropping into the gap after your own slot is the same slot: correct for
    // the row being lifted out before it is put back.
    const to = at > from ? at - 1 : at
    if (to !== from) onMove(from, to)
  }

  // A drop that changes nothing shouldn't advertise a line — the two gaps
  // either side of the dragged row are both no-ops.
  const isNoop = (at: number) => dragIndex !== null && (at === dragIndex || at === dragIndex + 1)

  return {
    dragIndex,
    active: dragIndex !== null,

    rowProps: index => ({
      draggable: enabled,
      onDragStart: e => {
        if (!enabled) return
        setDragIndex(index)
        e.dataTransfer.effectAllowed = 'move'
        // Some browsers refuse to start a drag with an empty payload.
        e.dataTransfer.setData('text/plain', String(index))
      },
      onDragOver: e => {
        // Ignore drags from anywhere else, including another list on the page.
        if (dragIndex === null) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const past = axis === 'x'
          ? e.clientX > r.left + r.width / 2
          : e.clientY > r.top + r.height / 2
        setDropAt(past ? index + 1 : index)
      },
      onDrop: e => {
        if (dragIndex === null) return
        e.preventDefault()
        e.stopPropagation()
        commit(dropAt ?? index)
      },
      onDragEnd: reset,
    }),

    tailProps: count => ({
      onDragOver: e => {
        if (dragIndex === null) return
        e.preventDefault()
        setDropAt(count)
      },
      onDrop: e => {
        if (dragIndex === null) return
        e.preventDefault()
        commit(count)
      },
    }),

    isDropBefore: index => dropAt === index && !isNoop(index),
    isDropAtEnd: count => dropAt === count && !isNoop(count),
  }
}
