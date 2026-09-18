import { contrastRatio, ensureContrastPair, relativeLuminance } from '../lib/contrast.js'

export const AI_COLOR_KEYS = [
  'background',
  'surface',
  'heading',
  'text',
  'muted',
  'accent',
  'accentText',
  'border',
  'navBg',
  'navFg',
  'heroBg',
  'heroFg',
  'footerBg',
  'footerFg',
  'cardBg',
  'cardText',
  'buttonBg',
  'buttonFg',
]

export const DEFAULT_AI_THEME_COLORS = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  heading: '#111111',
  text: '#1F1F1F',
  muted: '#5C5C5C',
  accent: '#111111',
  accentText: '#FFFFFF',
  border: '#E5E5E5',
  navBg: '#FFFFFF',
  navFg: '#111111',
  heroBg: '#FFFFFF',
  heroFg: '#111111',
  footerBg: '#111111',
  footerFg: '#F5F5F5',
  cardBg: '#FFFFFF',
  cardText: '#111111',
  buttonBg: '#111111',
  buttonFg: '#FFFFFF',
}

const PRESETS = {
  original: { ...DEFAULT_AI_THEME_COLORS },
  luxury_black_gold: {
    background: '#0B0B0B',
    surface: '#161616',
    heading: '#F5E6C4',
    text: '#E8DCC0',
    muted: '#C4B896',
    accent: '#D4AF37',
    accentText: '#111111',
    border: '#2A2416',
    navBg: '#0B0B0B',
    navFg: '#F5E6C4',
    heroBg: '#0B0B0B',
    heroFg: '#F5E6C4',
    footerBg: '#050505',
    footerFg: '#F5E6C4',
    cardBg: '#161616',
    cardText: '#F5E6C4',
    buttonBg: '#D4AF37',
    buttonFg: '#111111',
  },
  modern: {
    background: '#F8FAFC',
    surface: '#FFFFFF',
    heading: '#0F172A',
    text: '#334155',
    muted: '#64748B',
    accent: '#0F766E',
    accentText: '#FFFFFF',
    border: '#E2E8F0',
    navBg: '#FFFFFF',
    navFg: '#0F172A',
    heroBg: '#0F172A',
    heroFg: '#F8FAFC',
    footerBg: '#0F172A',
    footerFg: '#E2E8F0',
    cardBg: '#FFFFFF',
    cardText: '#0F172A',
    buttonBg: '#0F766E',
    buttonFg: '#FFFFFF',
  },
  premium: {
    background: '#FFF7ED',
    surface: '#FFFFFF',
    heading: '#1C1917',
    text: '#44403C',
    muted: '#78716C',
    accent: '#C2410C',
    accentText: '#FFFFFF',
    border: '#FED7AA',
    navBg: '#FFF7ED',
    navFg: '#1C1917',
    heroBg: '#1C1917',
    heroFg: '#FFF7ED',
    footerBg: '#1C1917',
    footerFg: '#FED7AA',
    cardBg: '#FFFFFF',
    cardText: '#1C1917',
    buttonBg: '#C2410C',
    buttonFg: '#FFFFFF',
  },
  claymorphism: {
    background: '#FBEAF2',
    surface: '#FFF7FB',
    heading: '#4A2C3A',
    text: '#5C3A4A',
    muted: '#A07C8C',
    accent: '#E891B3',
    accentText: '#4A2C3A',
    border: '#F3D5E3',
    navBg: '#FDF6F9',
    navFg: '#4A2C3A',
    heroBg: '#F4D0E0',
    heroFg: '#4A2C3A',
    footerBg: '#E8C5D4',
    footerFg: '#4A2C3A',
    cardBg: '#FFEAF3',
    cardText: '#4A2C3A',
    buttonBg: '#E891B3',
    buttonFg: '#4A2C3A',
  },
  glassmorphism: {
    background: '#F4F7FB',
    surface: '#FFFFFF',
    heading: '#0F172A',
    text: '#334155',
    muted: '#64748B',
    accent: '#2563EB',
    accentText: '#FFFFFF',
    border: '#E2E8F0',
    navBg: '#F8FAFC',
    navFg: '#0F172A',
    heroBg: '#DBEAFE',
    heroFg: '#0F172A',
    footerBg: '#1E293B',
    footerFg: '#E2E8F0',
    cardBg: '#FFFFFF',
    cardText: '#0F172A',
    buttonBg: '#2563EB',
    buttonFg: '#FFFFFF',
  },
  neumorphism: {
    background: '#E8EEF4',
    surface: '#E8EEF4',
    heading: '#1E293B',
    text: '#334155',
    muted: '#64748B',
    accent: '#64748B',
    accentText: '#F8FAFC',
    border: '#D5DEE8',
    navBg: '#E8EEF4',
    navFg: '#1E293B',
    heroBg: '#E8EEF4',
    heroFg: '#1E293B',
    footerBg: '#D5DEE8',
    footerFg: '#1E293B',
    cardBg: '#E8EEF4',
    cardText: '#1E293B',
    buttonBg: '#E8EEF4',
    buttonFg: '#1E293B',
  },
  clean_white: {
    background: '#FFFFFF',
    surface: '#F8FAFC',
    heading: '#0F172A',
    text: '#334155',
    muted: '#64748B',
    accent: '#177043',
    accentText: '#FFFFFF',
    border: '#E2E8F0',
    navBg: '#FFFFFF',
    navFg: '#0F172A',
    heroBg: '#F1F5F9',
    heroFg: '#0F172A',
    footerBg: '#0F172A',
    footerFg: '#F8FAFC',
    cardBg: '#FFFFFF',
    cardText: '#0F172A',
    buttonBg: '#177043',
    buttonFg: '#FFFFFF',
  },
}

export function resolveAiThemePreset(name) {
  if (!name) return null
  const key = String(name)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (PRESETS[key]) return { ...PRESETS[key] }
  if (/claymorph|clay/.test(key)) return { ...PRESETS.claymorphism }
  if (/glassmorph|frosted/.test(key)) return { ...PRESETS.glassmorphism }
  if (/neumorph|neomorph/.test(key)) return { ...PRESETS.neumorphism }
  if (/black/.test(key) && /gold/.test(key)) return { ...PRESETS.luxury_black_gold }
  if (/luxur|premium|elegant/.test(key) && /black|gold|dark/.test(key)) return { ...PRESETS.luxury_black_gold }
  if (/modern|minimal/.test(key)) return { ...PRESETS.modern }
  if (/premium|elegant/.test(key)) return { ...PRESETS.premium }
  if (/white|clean|simple/.test(key)) return { ...PRESETS.clean_white }
  if (/original|neutral|default/.test(key)) return { ...PRESETS.original }
  return null
}

export function applyAiTheme(baseColors = {}, patch = {}) {
  const next = { ...DEFAULT_AI_THEME_COLORS, ...baseColors, ...patch }
  const pairs = [
    ['heading', 'background'],
    ['text', 'background'],
    ['buttonFg', 'buttonBg'],
    ['navFg', 'navBg'],
    ['heroFg', 'heroBg'],
    ['cardText', 'cardBg'],
    ['accentText', 'accent'],
  ]
  for (const [fg, bg] of pairs) {
    if (next[fg] && next[bg]) {
      const fixed = ensureContrastPair(next[fg], next[bg])
      next[fg] = fixed.fg
      next[bg] = fixed.bg
    }
  }
  const out = {}
  for (const key of AI_COLOR_KEYS) {
    if (next[key]) out[key] = next[key]
  }
  return out
}

export function aiThemeContrastIssues(colors = {}) {
  const issues = []
  const checks = [
    ['heading', 'background'],
    ['text', 'background'],
    ['buttonFg', 'buttonBg'],
  ]
  for (const [fg, bg] of checks) {
    if (!colors[fg] || !colors[bg]) continue
    const ratio = contrastRatio(colors[fg], colors[bg])
    if (ratio < 4.5) {
      issues.push({
        type: 'LOW_CONTRAST',
        fg,
        bg,
        ratio: Number(ratio.toFixed(2)),
      })
    }
  }
  return issues
}

export function readableOn(bg) {
  return relativeLuminance(bg) < 0.42 ? '#FFFFFF' : '#111111'
}

/** Build a theme colour patch from 1–2 requested colours without falling back to "original". */
export function paletteFromNamedColors(hexes, { target = 'site' } = {}) {
  const colors = (Array.isArray(hexes) ? hexes : []).filter((hex) => /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(String(hex || '')))
  if (!colors.length) return null
  const primary = colors[0]
  const secondary = colors[1] || null
  const fg = readableOn(primary)
  if (target === 'footer') {
    return {
      footerBg: primary,
      footerFg: fg,
      ...(secondary
        ? { accent: secondary, buttonBg: secondary, buttonFg: readableOn(secondary), accentText: readableOn(secondary) }
        : {}),
    }
  }
  if (target === 'button') {
    return {
      buttonBg: primary,
      buttonFg: fg,
      accent: primary,
      accentText: fg,
    }
  }
  if (target === 'background' || target === 'hero') {
    const area =
      target === 'hero'
        ? { heroBg: primary, heroFg: fg }
        : {
            background: primary,
            surface: primary,
            heading: fg,
            text: fg,
            navBg: primary,
            navFg: fg,
            heroBg: primary,
            heroFg: fg,
          }
    const accent = secondary || primary
    const accentFg = readableOn(accent)
    return applyAiTheme({}, { ...area, accent, accentText: accentFg, buttonBg: accent, buttonFg: accentFg })
  }
  const accent = secondary || primary
  const accentFg = readableOn(accent)
  return applyAiTheme({}, {
    background: primary,
    surface: primary,
    heading: fg,
    text: fg,
    navBg: primary,
    navFg: fg,
    heroBg: primary,
    heroFg: fg,
    cardBg: primary,
    cardText: fg,
    accent,
    accentText: accentFg,
    buttonBg: accent,
    buttonFg: accentFg,
    footerBg: secondary ? accent : primary,
    footerFg: secondary ? accentFg : fg,
  })
}

export function inferAiTypography(style) {
  const s = String(style || '').toLowerCase()
  if (/claymorph|clay|pastel|tactile/.test(s)) {
    return { headingFont: 'Outfit', bodyFont: 'DM Sans', headingWeight: 700, bodyWeight: 400 }
  }
  if (/glassmorph|neumorph/.test(s)) {
    return { headingFont: 'DM Sans', bodyFont: 'DM Sans', headingWeight: 600, bodyWeight: 400 }
  }
  if (/luxur|premium|elegant|gold/.test(s)) {
    return { headingFont: 'Cormorant Garamond', bodyFont: 'Outfit', headingWeight: 600, bodyWeight: 400 }
  }
  if (/modern|minimal/.test(s)) {
    return { headingFont: 'Space Grotesk', bodyFont: 'DM Sans', headingWeight: 600, bodyWeight: 400 }
  }
  return { headingFont: 'Outfit', bodyFont: 'Outfit', headingWeight: 600, bodyWeight: 400 }
}
