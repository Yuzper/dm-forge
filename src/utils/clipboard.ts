// path: src/utils/clipboard.ts
// The app is served from file:// in a packaged build, which Chromium does not
// treat as a secure context — so `navigator.clipboard` may be undefined or
// reject. Fall back to the old selection trick, which has no such requirement.
export function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => legacyCopy(text))
      return
    }
  } catch { /* fall through */ }
  legacyCopy(text)
}

function legacyCopy(text: string) {
  const el = document.createElement('textarea')
  el.value = text
  // Off-screen rather than hidden: display:none can't hold a selection.
  el.style.cssText = 'position:fixed;top:-1000px;opacity:0'
  document.body.appendChild(el)
  el.select()
  try { document.execCommand('copy') } catch { /* nothing else to try */ }
  document.body.removeChild(el)
}
