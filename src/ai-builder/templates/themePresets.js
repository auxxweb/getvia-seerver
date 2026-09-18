import { SEMANTIC_KEYS } from '../../config/gvSemanticMeta.js'
import { contrastRatio, ensureContrastPair } from '../lib/contrast.js'

const PRESETS = {
  luxury_black_gold: {
    brandPrimary: '#D4AF37',
    brandSecondary: '#F5E6C4',
    brandAccent: '#D4AF37',
    accentWarm: '#C9A227',
    brandDeep: '#0B0B0B',
    gradStart: '#1A1A1A',
    gradEnd: '#D4AF37',
    btnPrimaryBg: '#D4AF37',
    btnPrimaryFg: '#111111',
    btnSecondaryBg: '#1A1A1A',
    btnSecondaryFg: '#F5E6C4',
    pageBg: '#0B0B0B',
    surfaceSoft: '#161616',
    surfaceAlt: '#1F1F1F',
    surfaceBand: '#111111',
    surfaceHighlight: '#2A2416',
    surfaceDecorative: '#2A2416',
    surfaceCard: '#161616',
    invertBg: '#D4AF37',
    invertFg: '#111111',
    invertSubtleFg: '#3A3A3A',
    heroBg: '#0B0B0B',
    welcomeBg: '#111111',
    footerBg: '#0B0B0B',
    footerFg: '#F5E6C4',
    navBg: '#0B0B0B',
    navFg: '#F5E6C4',
    navFgMuted: '#C4B896',
    navActiveFg: '#D4AF37',
    navBorder: '#2A2416',
    cardBg: '#161616',
    cardBorder: '#2A2416',
    cardTitle: '#F5E6C4',
    cardBody: '#E8DCC0',
    cardMuted: '#C4B896',
    textHeading: '#F5E6C4',
    textBody: '#E8DCC0',
    textMuted: '#C4B896',
    textInverted: '#111111',
    borderDefault: '#2A2416',
    borderStrong: '#D4AF37',
    borderSubtle: '#2A2416',
    inputBg: '#161616',
    inputBorder: '#3A3426',
    inputText: '#F5E6C4',
    inputPlaceholder: '#C4B896',
    inputFocusRing: '#D4AF37',
    link: '#D4AF37',
    linkHover: '#F5E6C4',
    badgeBg: '#D4AF37',
    badgeFg: '#111111',
    ringAccent: '#D4AF37',
  },
  modern: {
    brandPrimary: '#0F766E',
    brandSecondary: '#134E4A',
    brandAccent: '#14B8A6',
    pageBg: '#F8FAFC',
    textHeading: '#0F172A',
    textBody: '#334155',
    btnPrimaryBg: '#0F766E',
    btnPrimaryFg: '#FFFFFF',
    heroBg: '#F8FAFC',
    navBg: '#FFFFFF',
    navFg: '#0F172A',
  },
  premium: {
    brandPrimary: '#1E293B',
    brandSecondary: '#0F172A',
    brandAccent: '#C2410C',
    pageBg: '#FFF7ED',
    textHeading: '#1C1917',
    textBody: '#44403C',
    btnPrimaryBg: '#1E293B',
    btnPrimaryFg: '#FFFFFF',
  },
  clean_white: {
    brandPrimary: '#177043',
    brandSecondary: '#1E73BE',
    pageBg: '#FFFFFF',
    textHeading: '#0F172A',
    textBody: '#334155',
    heroBg: '#FFFFFF',
    btnPrimaryBg: '#177043',
    btnPrimaryFg: '#FFFFFF',
  },
}

export function themePresetIds() {
  return Object.keys(PRESETS)
}

export function resolveThemePreset(name) {
  if (!name) return null
  const key = String(name)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (PRESETS[key]) return { ...PRESETS[key] }
  if (/black/.test(key) && /gold/.test(key)) return { ...PRESETS.luxury_black_gold }
  if (/luxur|premium|elegant/.test(key) && /black|gold|dark/.test(key)) return { ...PRESETS.luxury_black_gold }
  if (/modern|minimal/.test(key)) return { ...PRESETS.modern }
  if (/premium|elegant/.test(key)) return { ...PRESETS.premium }
  if (/white|clean|simple/.test(key)) return { ...PRESETS.clean_white }
  return null
}

export function applyAccessibleTheme(baseColors = {}, patch = {}) {
  const next = { ...baseColors, ...patch }
  const pairs = [
    ['textHeading', 'pageBg'],
    ['textBody', 'pageBg'],
    ['btnPrimaryFg', 'btnPrimaryBg'],
    ['navFg', 'navBg'],
    ['cardTitle', 'cardBg'],
    ['cardBody', 'cardBg'],
  ]
  for (const [fg, bg] of pairs) {
    if (next[fg] && next[bg]) {
      const fixed = ensureContrastPair(next[fg], next[bg])
      next[fg] = fixed.fg
      next[bg] = fixed.bg
    }
  }
  for (const key of Object.keys(next)) {
    if (!SEMANTIC_KEYS.includes(key)) delete next[key]
  }
  return next
}

export function themeContrastIssues(colors = {}) {
  const issues = []
  const checks = [
    ['textHeading', 'pageBg'],
    ['textBody', 'pageBg'],
    ['btnPrimaryFg', 'btnPrimaryBg'],
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
