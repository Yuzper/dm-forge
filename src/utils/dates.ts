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
