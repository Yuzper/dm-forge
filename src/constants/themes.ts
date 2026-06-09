// path: src/constants/themes.ts

export type ThemeKey = 'parchment' | 'slate' | 'forest' | 'crimson' | 'void'

export interface Theme {
  label: string
  bgPreview: string      // swatch background
  accentPreview: string  // swatch accent dot
  vars: Record<string, string>
}

export const THEMES: Record<ThemeKey, Theme> = {

  parchment: {
    label: 'Parchment',
    bgPreview: '#1e1a14',
    accentPreview: '#c8a84b',
    vars: {
      '--bg-base':       '#0d0b09',
      '--bg-surface':    '#15120e',
      '--bg-elevated':   '#1e1a14',
      '--bg-hover':      '#26211a',
      '--bg-active':     '#2e2820',
      '--gold':          '#c8a84b',
      '--gold-dim':      '#8a7035',
      '--gold-glow':     'rgba(200,168,75,0.15)',
      '--gold-hover':    '#dab84f',
      '--shadow-gold':   '0 0 20px rgba(200,168,75,0.2)',
      '--crimson':       '#8b2533',
      '--crimson-dim':   '#5a1820',
      '--teal':          '#2a7a6e',
      '--text-primary':  '#e8dcc8',
      '--text-secondary':'#a09070',
      '--text-muted':    '#5a5040',
      '--text-inverse':  '#0d0b09',
      '--border':        '#2a2318',
      '--border-light':  '#3a3028',
      '--border-gold':   'rgba(200,168,75,0.3)',
    },
  },

  slate: {
    // Electric cyber-blue — deep navy bg + neon blue accent
    label: 'Slate',
    bgPreview: '#152038',
    accentPreview: '#2fb6ff',
    vars: {
      '--bg-base':       '#060a16',
      '--bg-surface':    '#0b1126',
      '--bg-elevated':   '#121d3c',
      '--bg-hover':      '#1b2a55',
      '--bg-active':     '#243a6e',
      '--gold':          '#2fb6ff',
      '--gold-dim':      '#1a7ac4',
      '--gold-glow':     'rgba(47,182,255,0.32)',
      '--gold-hover':    '#5cc8ff',
      '--shadow-gold':   '0 0 28px rgba(47,182,255,0.45)',
      '--crimson':       '#1f52b8',
      '--crimson-dim':   '#123476',
      '--teal':          '#23a8e0',
      '--text-primary':  '#eaf4ff',
      '--text-secondary':'#94c2f0',
      '--text-muted':    '#52749e',
      '--text-inverse':  '#060a16',
      '--border':        '#1a2e54',
      '--border-light':  '#284472',
      '--border-gold':   'rgba(47,182,255,0.5)',
    },
  },

  forest: {
    // Toxic neon green — deep forest bg + acid-green accent
    label: 'Forest',
    bgPreview: '#0e2418',
    accentPreview: '#2ff58a',
    vars: {
      '--bg-base':       '#040f09',
      '--bg-surface':    '#081a10',
      '--bg-elevated':   '#0e2418',
      '--bg-hover':      '#163524',
      '--bg-active':     '#1e4831',
      '--gold':          '#2ff58a',
      '--gold-dim':      '#1a9e58',
      '--gold-glow':     'rgba(47,245,138,0.32)',
      '--gold-hover':    '#5cffa6',
      '--shadow-gold':   '0 0 28px rgba(47,245,138,0.45)',
      '--crimson':       '#1f9a4c',
      '--crimson-dim':   '#12602e',
      '--teal':          '#1fc88e',
      '--text-primary':  '#e6ffee',
      '--text-secondary':'#86dca6',
      '--text-muted':    '#467a5e',
      '--text-inverse':  '#040f09',
      '--border':        '#143a26',
      '--border-light':  '#1e5436',
      '--border-gold':   'rgba(47,245,138,0.5)',
    },
  },

  crimson: {
    // Infernal hot red — deep blood bg + searing red accent
    label: 'Crimson',
    bgPreview: '#2c0f12',
    accentPreview: '#ff3b52',
    vars: {
      '--bg-base':       '#120406',
      '--bg-surface':    '#20090c',
      '--bg-elevated':   '#2c0f12',
      '--bg-hover':      '#3e171c',
      '--bg-active':     '#522227',
      '--gold':          '#ff3b52',
      '--gold-dim':      '#b81f30',
      '--gold-glow':     'rgba(255,59,82,0.32)',
      '--gold-hover':    '#ff5e72',
      '--shadow-gold':   '0 0 28px rgba(255,59,82,0.45)',
      '--crimson':       '#e01f30',
      '--crimson-dim':   '#8a1018',
      '--teal':          '#d6394a',
      '--text-primary':  '#ffeae8',
      '--text-secondary':'#e09a9a',
      '--text-muted':    '#965c5e',
      '--text-inverse':  '#120406',
      '--border':        '#3c151a',
      '--border-light':  '#562227',
      '--border-gold':   'rgba(255,59,82,0.5)',
    },
  },

  void: {
    // Arcane neon violet — deep void bg + electric purple accent
    label: 'Void',
    bgPreview: '#1c1142',
    accentPreview: '#b04dff',
    vars: {
      '--bg-base':       '#0a0518',
      '--bg-surface':    '#140a28',
      '--bg-elevated':   '#1c1142',
      '--bg-hover':      '#281858',
      '--bg-active':     '#352270',
      '--gold':          '#b04dff',
      '--gold-dim':      '#7a2bc4',
      '--gold-glow':     'rgba(176,77,255,0.32)',
      '--gold-hover':    '#c46cff',
      '--shadow-gold':   '0 0 28px rgba(176,77,255,0.45)',
      '--crimson':       '#7a2bd0',
      '--crimson-dim':   '#4e1a8a',
      '--teal':          '#8a3ae0',
      '--text-primary':  '#f4e8ff',
      '--text-secondary':'#bea0ee',
      '--text-muted':    '#7058a6',
      '--text-inverse':  '#0a0518',
      '--border':        '#2a1a52',
      '--border-light':  '#3c286e',
      '--border-gold':   'rgba(176,77,255,0.5)',
    },
  },
}

export function applyTheme(key: ThemeKey): void {
  const theme = THEMES[key] ?? THEMES.parchment
  const root = document.documentElement
  for (const [k, v] of Object.entries(theme.vars)) {
    root.style.setProperty(k, v)
  }
}

export function getStoredTheme(): ThemeKey {
  const saved = localStorage.getItem('dmforge:color-theme') as ThemeKey | null
  return saved && THEMES[saved] ? saved : 'parchment'
}

// ── Text colour themes ──────────────────────────────────────────────────────
// Independent of the colour theme — overrides only the text vars so any text
// palette can be paired with any background. Parchment is the standard default.

export type TextThemeKey = 'parchment' | 'snow' | 'cool' | 'sepia' | 'rose' | 'mint'

export interface TextTheme {
  label: string
  preview: string  // swatch letterform colour (= text-primary)
  vars: Record<string, string>
}

export const TEXT_THEMES: Record<TextThemeKey, TextTheme> = {
  parchment: {
    label: 'Parchment',
    preview: '#e8dcc8',
    vars: {
      '--text-primary':  '#e8dcc8',
      '--text-secondary':'#a09070',
      '--text-muted':    '#5a5040',
    },
  },
  snow: {
    label: 'Snow',
    preview: '#eef0f4',
    vars: {
      '--text-primary':  '#eef0f4',
      '--text-secondary':'#a6acb8',
      '--text-muted':    '#5e646e',
    },
  },
  cool: {
    label: 'Cool',
    preview: '#e4ecf8',
    vars: {
      '--text-primary':  '#e4ecf8',
      '--text-secondary':'#9fb4d4',
      '--text-muted':    '#5c6e8c',
    },
  },
  sepia: {
    label: 'Sepia',
    preview: '#f0d8b4',
    vars: {
      '--text-primary':  '#f0d8b4',
      '--text-secondary':'#b89868',
      '--text-muted':    '#6e5840',
    },
  },
  rose: {
    label: 'Rose',
    preview: '#f4dde0',
    vars: {
      '--text-primary':  '#f4dde0',
      '--text-secondary':'#c79aaa',
      '--text-muted':    '#7a5c62',
    },
  },
  mint: {
    label: 'Mint',
    preview: '#e0f2e6',
    vars: {
      '--text-primary':  '#e0f2e6',
      '--text-secondary':'#98c4a6',
      '--text-muted':    '#547062',
    },
  },
}

export function applyTextTheme(key: TextThemeKey): void {
  const t = TEXT_THEMES[key] ?? TEXT_THEMES.parchment
  const root = document.documentElement
  for (const [k, v] of Object.entries(t.vars)) {
    root.style.setProperty(k, v)
  }
}

export function getStoredTextTheme(): TextThemeKey {
  const saved = localStorage.getItem('dmforge:text-theme') as TextThemeKey | null
  return saved && TEXT_THEMES[saved] ? saved : 'parchment'
}
