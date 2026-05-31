export function parseDay(raw: string): number | null {
  try { return JSON.parse(raw)?.day ?? null } catch { return null }
}
