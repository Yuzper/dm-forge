export function parseDay(raw: string): number | null {
  try { return JSON.parse(raw)?.day ?? null } catch { return null }
}

// Today as YYYY-MM-DD in the user's local timezone — the format <input
// type="date"> expects. Built from local parts rather than toISOString(),
// which would shift the date across the UTC boundary.
export function todayISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// "12m ago", "Yesterday", "3 Aug" — a real timestamp read at a glance. Used by
// the wiki's resume strip and the hub's party strip.
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${Math.max(mins, 0)}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
