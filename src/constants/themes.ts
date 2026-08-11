// path: src/constants/themes.ts
// Appearance is four independent choices, not five locked presets:
//
//   base    — the surface family (and with it, light or dark)
//   accent  — any colour you like; the accent ramp is derived from it
//   text    — the text palette, filtered to the base's mode
//   tint    — whether surfaces take a trace of the accent hue
//
// The old model rewrote *every* var per preset, so choosing a colour repainted
// the whole app in that hue and repainted the semantic vars with it — "danger"
// came out green in Forest and violet in Void. Semantics are now fixed per mode
// (red is always danger, green always success) and only the accent ramp follows
// your choice.
import type { SectionView } from './sections'

export type Mode = 'dark' | 'light'

// ── Colour maths ──────────────────────────────────────────────────────────────

export function normalizeHex(raw: string | null | undefined): string | null {
  let v = (raw ?? '').trim().toLowerCase()
  if (!v) return null
  if (!v.startsWith('#')) v = '#' + v
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return null
  if (v.length === 4) v = '#' + [...v.slice(1)].map(c => c + c).join('')
  return v
}

function toRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? '#000000'
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}

function toHex([r, g, b]: [number, number, number]): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** `t` of 0 keeps `a`, 1 becomes `b`. */
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = toRgb(a)
  const [r2, g2, b2] = toRgb(b)
  return toHex([r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t])
}

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = toRgb(hex).map(v => v / 255)
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const d = mx - mn
  let h = 0
  if (d) {
    if (mx === r) h = 60 * (((g - b) / d) % 6)
    else if (mx === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  const l = (mx + mn) / 2
  return [h, d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l]
}

function fromHsl(h: number, s: number, l: number): string {
  s = Math.max(0, Math.min(1, s))
  l = Math.max(0, Math.min(1, l))
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return toHex([(t[0] + m) * 255, (t[1] + m) * 255, (t[2] + m) * 255])
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = toRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

/** WCAG relative luminance, for deciding what colour sits *on* the accent. */
function luminance(hex: string): number {
  const chan = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = toRgb(hex)
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
}

/**
 * WCAG contrast ratio, 1 (identical) to 21 (black on white). Used to catch an
 * accent that can't be read against its own surfaces — the cost of letting any
 * colour be chosen is that some of them are unusable.
 */
export function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a)
  const l2 = luminance(b)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

// ── Bases ─────────────────────────────────────────────────────────────────────

export type BaseKey = 'parchment' | 'charcoal' | 'midnight' | 'paper'

// Backdrop-texture inks, shared by every base of the same mode. These are the
// alphas the textures were designed at — the wood grain in particular is a
// 2%-white hairline, and pushing it further reads as scratches on black.
const DARK_TEXTURE = {
  '--texture-line':         'rgba(255,255,255,0.018)',
  '--texture-grain':        'rgba(255,255,255,0.02)',
  '--texture-shade':        'rgba(0,0,0,0.06)',
  '--texture-shade-strong': 'rgba(0,0,0,0.12)',
}

const LIGHT_TEXTURE = {
  '--texture-line':         'rgba(74,58,32,0.055)',
  '--texture-grain':        'rgba(74,58,32,0.07)',
  '--texture-shade':        'rgba(74,58,32,0.05)',
  '--texture-shade-strong': 'rgba(74,58,32,0.10)',
}

export interface BaseTheme {
  label: string
  mode: Mode
  /** Swatch fill in the picker. */
  preview: string
  /** Surfaces, borders, shadows and texture — never accent or semantics. */
  vars: Record<string, string>
  /** Section identity colours tuned for this base. User overrides win. */
  sections: Record<SectionView, string>
  /** Text palette used when the current one doesn't suit this base's mode. */
  text: TextThemeKey
}

export const BASES: Record<BaseKey, BaseTheme> = {

  parchment: {
    label: 'Parchment',
    mode: 'dark',
    preview: '#1e1a14',
    text: 'parchment',
    vars: {
      '--bg-base':      '#0d0b09',
      '--bg-surface':   '#15120e',
      '--bg-elevated':  '#1e1a14',
      '--bg-hover':     '#26211a',
      '--bg-active':    '#2e2820',
      '--border':       '#2a2318',
      '--border-light': '#3a3028',
      '--shadow-sm':    '0 2px 8px rgba(0,0,0,0.4)',
      '--shadow-md':    '0 4px 20px rgba(0,0,0,0.6)',
      '--shadow-lg':    '0 8px 40px rgba(0,0,0,0.8)',
      ...DARK_TEXTURE,
    },
    // Warmed to sit with the aged-paper surfaces.
    sections: {
      'wiki':        '#5b9fe8',
      'dm-notes':    '#fe6565',
      'loot-tables': '#49c185',
      'relations':   '#b07de8',
      'timeline':    '#e88c3a',
      'soundboard':  '#4cc9d6',
    },
  },

  charcoal: {
    label: 'Charcoal',
    mode: 'dark',
    preview: '#1c1c1f',
    text: 'snow',
    vars: {
      '--bg-base':      '#0b0b0c',
      '--bg-surface':   '#141416',
      '--bg-elevated':  '#1c1c1f',
      '--bg-hover':     '#26262a',
      '--bg-active':    '#2f2f35',
      '--border':       '#2a2a2e',
      '--border-light': '#3a3a41',
      '--shadow-sm':    '0 2px 8px rgba(0,0,0,0.45)',
      '--shadow-md':    '0 4px 20px rgba(0,0,0,0.65)',
      '--shadow-lg':    '0 8px 40px rgba(0,0,0,0.8)',
      ...DARK_TEXTURE,
    },
    // Neutral ground, so the identity colours run at full strength.
    sections: {
      'wiki':        '#64a8ff',
      'dm-notes':    '#ff6b6b',
      'loot-tables': '#3ecf87',
      'relations':   '#b07dff',
      'timeline':    '#ff9a3c',
      'soundboard':  '#3ed0e0',
    },
  },

  midnight: {
    label: 'Midnight',
    mode: 'dark',
    preview: '#151d2e',
    text: 'cool',
    vars: {
      '--bg-base':      '#070a11',
      '--bg-surface':   '#0d1220',
      '--bg-elevated':  '#151d2e',
      '--bg-hover':     '#1e293e',
      '--bg-active':    '#27344e',
      '--border':       '#1d2739',
      '--border-light': '#2c3a52',
      '--shadow-sm':    '0 2px 8px rgba(0,0,0,0.45)',
      '--shadow-md':    '0 4px 20px rgba(2,6,16,0.7)',
      '--shadow-lg':    '0 8px 40px rgba(2,6,16,0.85)',
      ...DARK_TEXTURE,
    },
    // Cooled so nothing clashes with the blue ground.
    sections: {
      'wiki':        '#6cb2ff',
      'dm-notes':    '#ff7a86',
      'loot-tables': '#46d1a0',
      'relations':   '#a98cff',
      'timeline':    '#f2a154',
      'soundboard':  '#4ad6e8',
    },
  },

  paper: {
    label: 'Paper',
    mode: 'light',
    preview: '#f6f1e6',
    text: 'ink',
    vars: {
      '--bg-base':      '#e9e2d3',
      '--bg-surface':   '#f4efe3',
      '--bg-elevated':  '#fdfaf2',
      '--bg-hover':     '#e2d9c6',
      '--bg-active':    '#d6cab2',
      '--border':       '#d3c8b0',
      '--border-light': '#bfb198',
      // Warm-black shadows: pure black over paper reads as dirt.
      '--shadow-sm':    '0 1px 4px rgba(74,58,32,0.10)',
      '--shadow-md':    '0 4px 16px rgba(74,58,32,0.16)',
      '--shadow-lg':    '0 8px 32px rgba(74,58,32,0.22)',
      ...LIGHT_TEXTURE,
    },
    // Darkened and saturated so they carry against a light ground.
    sections: {
      'wiki':        '#2c6bbd',
      'dm-notes':    '#c8433f',
      'loot-tables': '#1f8b5b',
      'relations':   '#7440be',
      'timeline':    '#b4631b',
      'soundboard':  '#17849c',
    },
  },
}

// ── Semantics ─────────────────────────────────────────────────────────────────
// Fixed per mode, never per theme: a delete confirmation has to read as danger
// in every appearance, which is exactly what the old presets gave away.

const SEMANTICS: Record<Mode, Record<string, string>> = {
  dark: {
    '--danger':        '#e05555',
    '--danger-hover':  '#ff7777',
    '--danger-soft':   '#e87070',
    '--danger-bg':     'rgba(224,85,85,0.09)',
    '--danger-border': 'rgba(224,85,85,0.33)',
    '--success':        '#49c185',
    '--success-bg':     'rgba(73,193,133,0.09)',
    '--success-border': 'rgba(73,193,133,0.28)',
    '--warning':        '#e88c3a',
    '--info':           '#5b9fe8',
    '--crimson':        '#8b2533',
    '--crimson-dim':    '#5a1820',
    '--teal':           '#2a7a6e',
  },
  light: {
    '--danger':        '#c33a2c',
    '--danger-hover':  '#a52d21',
    '--danger-soft':   '#cf5546',
    '--danger-bg':     'rgba(195,58,44,0.10)',
    '--danger-border': 'rgba(195,58,44,0.35)',
    '--success':        '#1f8b5b',
    '--success-bg':     'rgba(31,139,91,0.11)',
    '--success-border': 'rgba(31,139,91,0.32)',
    '--warning':        '#b4631b',
    '--info':           '#2c6bbd',
    '--crimson':        '#9c2b36',
    '--crimson-dim':    '#c8b0b3',
    '--teal':           '#1c7d70',
  },
}

// ── Accent ────────────────────────────────────────────────────────────────────

export const DEFAULT_ACCENT = '#c8a84b'

/**
 * The accent ramp, derived from one colour. The var names still say "gold" —
 * they are used in ~200 places and renaming them is a separate job from making
 * the colour choosable.
 */
export function accentVars(accent: string, mode: Mode): Record<string, string> {
  const hex = normalizeHex(accent) ?? DEFAULT_ACCENT
  const light = mode === 'light'
  const [h, s, l] = toHsl(hex)
  return {
    '--gold': hex,
    // Hover and dim move along the colour's own hue rather than being mixed
    // with white or black — mixing washes the hue out, which turned the stock
    // gold's hover from #dab84f into a pale #d1b668. These land within a shade
    // of the values the original palette used by hand.
    '--gold-hover':  light ? fromHsl(h, s * 1.08, l - 0.07) : fromHsl(h, s * 1.16, l + 0.065),
    '--gold-dim':    light ? fromHsl(h, s * 0.9, l - 0.12) : fromHsl(h, s * 0.86, l - 0.165),
    '--gold-glow':   rgba(hex, light ? 0.18 : 0.15),
    '--shadow-gold': `0 0 20px ${rgba(hex, light ? 0.28 : 0.22)}`,
    '--border-gold': rgba(hex, light ? 0.42 : 0.3),
    // What sits *on* the accent — a primary button's label, the logo mark.
    // Whichever of the two actually reads on it: a fixed luminance threshold
    // put near-white on the stock gold at a contrast of 2.1:1, where the
    // original (and the far better) choice is near-black at 8.2:1.
    '--text-inverse': contrastRatio(hex, '#141109') >= contrastRatio(hex, '#fbf7ee') ? '#141109' : '#fbf7ee',
  }
}

/** Surfaces carrying a trace of the accent hue. Subtle by design — the old
 *  presets tinted everything to saturation, which is what made a colour choice
 *  feel like a wash rather than a choice. */
function tintedSurfaces(base: BaseTheme, accent: string): Record<string, string> {
  const hex = normalizeHex(accent) ?? DEFAULT_ACCENT
  const amounts: Record<string, number> = {
    '--bg-base': 0.05, '--bg-surface': 0.06, '--bg-elevated': 0.07,
    '--bg-hover': 0.08, '--bg-active': 0.09,
    '--border': 0.10, '--border-light': 0.12,
  }
  const out: Record<string, string> = {}
  for (const [key, amount] of Object.entries(amounts)) {
    const from = base.vars[key]
    if (from) out[key] = mix(from, hex, amount)
  }
  return out
}

// ── Text palettes ─────────────────────────────────────────────────────────────
// Independent of the base, but not of its mode: ink on a dark ground is as
// unreadable as parchment on a light one, so each palette declares which it is
// for and the picker only offers the matching set.

export type TextThemeKey =
  | 'parchment' | 'snow' | 'cool' | 'sepia' | 'rose' | 'mint'
  | 'ink' | 'walnut' | 'graphite' | 'indigo'

export interface TextTheme {
  label: string
  mode: Mode
  preview: string
  vars: Record<string, string>
}

export const TEXT_THEMES: Record<TextThemeKey, TextTheme> = {
  parchment: {
    label: 'Parchment', mode: 'dark', preview: '#e8dcc8',
    vars: { '--text-primary': '#e8dcc8', '--text-secondary': '#a09070', '--text-muted': '#5a5040' },
  },
  snow: {
    label: 'Snow', mode: 'dark', preview: '#eef0f4',
    vars: { '--text-primary': '#eef0f4', '--text-secondary': '#a6acb8', '--text-muted': '#5e646e' },
  },
  cool: {
    label: 'Cool', mode: 'dark', preview: '#e4ecf8',
    vars: { '--text-primary': '#e4ecf8', '--text-secondary': '#9fb4d4', '--text-muted': '#5c6e8c' },
  },
  sepia: {
    label: 'Sepia', mode: 'dark', preview: '#f0d8b4',
    vars: { '--text-primary': '#f0d8b4', '--text-secondary': '#b89868', '--text-muted': '#6e5840' },
  },
  rose: {
    label: 'Rose', mode: 'dark', preview: '#f4dde0',
    vars: { '--text-primary': '#f4dde0', '--text-secondary': '#c79aaa', '--text-muted': '#7a5c62' },
  },
  mint: {
    label: 'Mint', mode: 'dark', preview: '#e0f2e6',
    vars: { '--text-primary': '#e0f2e6', '--text-secondary': '#98c4a6', '--text-muted': '#547062' },
  },

  ink: {
    label: 'Ink', mode: 'light', preview: '#2b2419',
    vars: { '--text-primary': '#2b2419', '--text-secondary': '#6b5c42', '--text-muted': '#9a8c73' },
  },
  walnut: {
    label: 'Walnut', mode: 'light', preview: '#43301c',
    vars: { '--text-primary': '#43301c', '--text-secondary': '#7a6142', '--text-muted': '#a5917a' },
  },
  graphite: {
    label: 'Graphite', mode: 'light', preview: '#26262a',
    vars: { '--text-primary': '#26262a', '--text-secondary': '#5e5e66', '--text-muted': '#92929c' },
  },
  indigo: {
    label: 'Indigo', mode: 'light', preview: '#1f2740',
    vars: { '--text-primary': '#1f2740', '--text-secondary': '#54608a', '--text-muted': '#8d95b0' },
  },
}

export function textThemesFor(mode: Mode): TextThemeKey[] {
  return (Object.keys(TEXT_THEMES) as TextThemeKey[]).filter(k => TEXT_THEMES[k].mode === mode)
}

// ── Type faces ────────────────────────────────────────────────────────────────
// The three roles the app already had vars for. Families load from Google Fonts
// on demand — the three defaults come down with index.html, anything else gets a
// <link> appended when it's first chosen. Each role also offers a System option
// that needs no network at all, which is the only choice that survives being
// offline.

export interface FontOption {
  key: string
  label: string
  stack: string
  /** Google Fonts `family=` value, or null for a system stack. */
  family: string | null
}

export const FONTS: Record<'display' | 'body' | 'ui', FontOption[]> = {
  display: [
    { key: 'cinzel',    label: 'Cinzel',    stack: `'Cinzel', serif`,             family: 'Cinzel:wght@400;500;600;700' },
    { key: 'marcellus', label: 'Marcellus', stack: `'Marcellus', serif`,          family: 'Marcellus' },
    { key: 'cormorant', label: 'Cormorant', stack: `'Cormorant Garamond', serif`, family: 'Cormorant+Garamond:wght@400;500;600;700' },
    { key: 'uncial',    label: 'Uncial',    stack: `'Uncial Antiqua', serif`,     family: 'Uncial+Antiqua' },
    { key: 'system',    label: 'System',    stack: `Georgia, 'Times New Roman', serif`, family: null },
  ],
  body: [
    { key: 'garamond',  label: 'Garamond',  stack: `'EB Garamond', Georgia, serif`, family: 'EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500' },
    { key: 'lora',      label: 'Lora',      stack: `'Lora', Georgia, serif`,        family: 'Lora:ital,wght@0,400;0,500;0,600;1,400' },
    { key: 'crimson',   label: 'Crimson',   stack: `'Crimson Text', Georgia, serif`, family: 'Crimson+Text:ital,wght@0,400;0,600;1,400' },
    { key: 'system',    label: 'System',    stack: `Georgia, 'Times New Roman', serif`, family: null },
  ],
  ui: [
    { key: 'raleway',   label: 'Raleway',   stack: `'Raleway', system-ui, sans-serif`,   family: 'Raleway:wght@300;400;500;600' },
    { key: 'inter',     label: 'Inter',     stack: `'Inter', system-ui, sans-serif`,     family: 'Inter:wght@300;400;500;600' },
    { key: 'worksans',  label: 'Work Sans', stack: `'Work Sans', system-ui, sans-serif`, family: 'Work+Sans:wght@300;400;500;600' },
    { key: 'system',    label: 'System',    stack: `system-ui, 'Segoe UI', sans-serif`,  family: null },
  ],
}

export interface FontChoice { display: string; body: string; ui: string }

export const DEFAULT_FONTS: FontChoice = { display: 'cinzel', body: 'garamond', ui: 'raleway' }

function fontOption(role: keyof typeof FONTS, key: string): FontOption {
  return FONTS[role].find(f => f.key === key) ?? FONTS[role][0]
}

/** Appends a stylesheet link the first time a family is asked for. */
function ensureFontLoaded(option: FontOption): void {
  if (!option.family) return
  const id = `font-${option.key}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${option.family}&display=swap`
  document.head.appendChild(link)
}

// ── Starting points ───────────────────────────────────────────────────────────
// Not a return to presets: these set the four choices in one click and then get
// out of the way, so you can take any of them somewhere else.

export interface Look {
  key: string
  label: string
  base: BaseKey
  accent: string
  text: TextThemeKey
  tint: boolean
}

export const LOOKS: Look[] = [
  { key: 'forge',  label: 'Forge',  base: 'parchment', accent: '#c8a84b', text: 'parchment', tint: false },
  { key: 'ember',  label: 'Ember',  base: 'charcoal',  accent: '#e2603c', text: 'snow',      tint: true },
  { key: 'arcane', label: 'Arcane', base: 'charcoal',  accent: '#b04dff', text: 'snow',      tint: true },
  { key: 'frost',  label: 'Frost',  base: 'midnight',  accent: '#4bc4ff', text: 'cool',      tint: true },
  { key: 'grove',  label: 'Grove',  base: 'charcoal',  accent: '#49c185', text: 'mint',      tint: true },
  { key: 'ink',    label: 'Ink',    base: 'paper',     accent: '#8a6d2f', text: 'ink',       tint: false },
]

// ── Applying ──────────────────────────────────────────────────────────────────

export interface Appearance {
  base: BaseKey
  accent: string
  tint: boolean
  text: TextThemeKey
  fonts: FontChoice
  /** Per-section overrides on top of the base's tuned defaults. */
  sections: Partial<Record<SectionView, string>>
}

/** The section colours actually in force: the base's set, user overrides on top. */
export function resolveSections(a: Appearance): Record<SectionView, string> {
  const base = BASES[a.base] ?? BASES.parchment
  const out = { ...base.sections }
  for (const [view, hex] of Object.entries(a.sections)) {
    const valid = normalizeHex(hex)
    if (valid) out[view as SectionView] = valid
  }
  return out
}

/** A text palette that suits the base, falling back when the mode doesn't match. */
export function resolveTextTheme(a: Appearance): TextThemeKey {
  const base = BASES[a.base] ?? BASES.parchment
  const chosen = TEXT_THEMES[a.text]
  return chosen && chosen.mode === base.mode ? a.text : base.text
}

/** Writes the whole appearance to the document root in one pass. */
export function applyAppearance(a: Appearance): void {
  const base = BASES[a.base] ?? BASES.parchment
  const root = document.documentElement
  const fonts = { ...DEFAULT_FONTS, ...a.fonts }
  const display = fontOption('display', fonts.display)
  const body = fontOption('body', fonts.body)
  const ui = fontOption('ui', fonts.ui)
  for (const f of [display, body, ui]) ensureFontLoaded(f)

  const vars: Record<string, string> = {
    ...base.vars,
    ...(a.tint ? tintedSurfaces(base, a.accent) : {}),
    ...SEMANTICS[base.mode],
    ...accentVars(a.accent, base.mode),
    ...TEXT_THEMES[resolveTextTheme(a)].vars,
    '--font-display': display.stack,
    '--font-body': body.stack,
    '--font-ui': ui.stack,
  }
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)

  // Section colours ride along as vars too, for stylesheets and for anything
  // that would rather not import the record.
  for (const [view, hex] of Object.entries(resolveSections(a))) {
    root.style.setProperty(`--section-${view}`, hex)
  }
  // Lets CSS (and any component that asks) branch on light vs dark.
  root.dataset.mode = base.mode
}

// ── Storage ───────────────────────────────────────────────────────────────────

// The app-wide look, plus an optional override per campaign — a grim campaign
// and a light-hearted one can each carry their own. A campaign with no override
// simply uses the app-wide one, so this costs nothing until it's turned on.
const KEY = 'dmforge:appearance:v2'
const campaignKey = (id: number) => `${KEY}:campaign:${id}`

export const DEFAULT_APPEARANCE: Appearance = {
  base: 'parchment', accent: DEFAULT_ACCENT, tint: false, text: 'parchment',
  fonts: { ...DEFAULT_FONTS }, sections: {},
}

// What each v1 preset becomes: its base family, its accent, and the tint that
// gave it its character. Nobody's app should look different after an update.
const LEGACY: Record<string, Pick<Appearance, 'base' | 'accent' | 'tint'>> = {
  parchment: { base: 'parchment', accent: '#c8a84b', tint: false },
  slate:     { base: 'midnight',  accent: '#2fb6ff', tint: true },
  forest:    { base: 'charcoal',  accent: '#2ff58a', tint: true },
  crimson:   { base: 'charcoal',  accent: '#ff3b52', tint: true },
  void:      { base: 'charcoal',  accent: '#b04dff', tint: true },
}

function parse(raw: string | null): Appearance | null {
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    return {
      base: BASES[p?.base as BaseKey] ? p.base : DEFAULT_APPEARANCE.base,
      accent: normalizeHex(p?.accent) ?? DEFAULT_ACCENT,
      tint: !!p?.tint,
      text: TEXT_THEMES[p?.text as TextThemeKey] ? p.text : DEFAULT_APPEARANCE.text,
      fonts: { ...DEFAULT_FONTS, ...(p?.fonts && typeof p.fonts === 'object' ? p.fonts : {}) },
      sections: p?.sections && typeof p.sections === 'object' ? p.sections : {},
    }
  } catch {
    return null
  }
}

/** The campaign's own look when it has one, otherwise the app-wide look. */
export function loadAppearance(campaignId?: number | null): Appearance {
  try {
    if (campaignId) {
      const own = parse(localStorage.getItem(campaignKey(campaignId)))
      if (own) return own
    }
    const global = parse(localStorage.getItem(KEY))
    if (global) return global

    // v1: a preset key plus a separate text palette.
    const legacy = LEGACY[localStorage.getItem('dmforge:color-theme') ?? '']
    const legacyText = localStorage.getItem('dmforge:text-theme') as TextThemeKey | null
    if (legacy) {
      return {
        ...legacy,
        text: legacyText && TEXT_THEMES[legacyText] ? legacyText : BASES[legacy.base].text,
        fonts: { ...DEFAULT_FONTS },
        sections: {},
      }
    }
  } catch { /* fall through to defaults */ }
  return { ...DEFAULT_APPEARANCE }
}

export function saveAppearance(a: Appearance, campaignId?: number | null): void {
  try { localStorage.setItem(campaignId ? campaignKey(campaignId) : KEY, JSON.stringify(a)) } catch { /* private mode */ }
}

export function hasCampaignAppearance(campaignId: number | null | undefined): boolean {
  if (!campaignId) return false
  try { return localStorage.getItem(campaignKey(campaignId)) !== null } catch { return false }
}

export function clearCampaignAppearance(campaignId: number): void {
  try { localStorage.removeItem(campaignKey(campaignId)) } catch { /* nothing to do */ }
}
