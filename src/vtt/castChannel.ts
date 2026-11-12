// path: src/vtt/castChannel.ts
// The only place either end knows how cast messages travel.
//
// Today that is Electron IPC: the DM window hands a message to the main
// process, which forwards it to the table window and remembers it for a table
// window that opens later. When the Raspberry Pi tracker lands and the table
// becomes a WebSocket client — possibly a browser on another machine — this
// file is what changes. `sendCast` and `subscribeCast` keep their signatures,
// so neither the projection nor the table view is touched.
import type { CastMessage } from './protocol'
import { isCastMessage } from './protocol'

/** DM side: push state to the table. */
export function sendCast(msg: CastMessage): void {
  void window.api.vttCast(msg)
}

/**
 * Table side: receive state. Returns an unsubscribe. Messages this build does
 * not understand are dropped, not guessed at.
 */
export function subscribeCast(onMessage: (msg: CastMessage) => void): () => void {
  return window.api.onVTTMessage((raw: unknown) => {
    if (isCastMessage(raw)) onMessage(raw)
  })
}

/** Table side: ask for the current state after a reload. */
export function requestCastResend(): void {
  void window.api.vttResend()
}
