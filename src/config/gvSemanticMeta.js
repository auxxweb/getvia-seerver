/**
 * Mirrors frontend/src/theme/gvTokens.js (semantic list + labels) for API validation.
 * Keep SEMANTIC_KEYS order in sync with the frontend.
 */

export const SEMANTIC_KEYS = [
  'brandPrimary',
  'brandSecondary',
  'brandAccent',
  'accentWarm',
  'brandDeep',
  'gradStart',
  'gradEnd',
  'btnPrimaryBg',
  'btnPrimaryFg',
  'btnSecondaryBg',
  'btnSecondaryFg',
  'pageBg',
  'surfaceSoft',
  'surfaceAlt',
  'surfaceBand',
  'surfaceHighlight',
  'surfaceDecorative',
  'surfaceCard',
  'invertBg',
  'invertFg',
  'invertSubtleFg',
  'heroBg',
  'welcomeBg',
  'footerBg',
  'footerFg',
  'navBg',
  'navFg',
  'navFgMuted',
  'navActiveFg',
  'navBorder',
  'cardBg',
  'cardBorder',
  'cardTitle',
  'cardBody',
  'cardMuted',
  'textHeading',
  'textBody',
  'textMuted',
  'textInverted',
  'borderDefault',
  'borderStrong',
  'borderSubtle',
  'inputBg',
  'inputBorder',
  'inputText',
  'inputPlaceholder',
  'inputFocusRing',
  'link',
  'linkHover',
  'badgeBg',
  'badgeFg',
  'ringAccent',
]

export const SEMANTIC_SLOT_LABELS = {
  brandPrimary: 'Brand primary',
  brandSecondary: 'Brand secondary',
  brandAccent: 'Brand accent',
  accentWarm: 'Warm accent (alt CTA)',
  brandDeep: 'Brand deep / dark',
  gradStart: 'Gradient start',
  gradEnd: 'Gradient end',
  btnPrimaryBg: 'Primary button background',
  btnPrimaryFg: 'Primary button text',
  btnSecondaryBg: 'Secondary button background',
  btnSecondaryFg: 'Secondary button text',
  pageBg: 'Page background',
  surfaceSoft: 'Surface (cards / white areas)',
  surfaceAlt: 'Alternate surface',
  surfaceBand: 'Band / strip background',
  surfaceHighlight: 'Highlight surface',
  surfaceDecorative: 'Decorative surface',
  surfaceCard: 'Card surface',
  heroBg: 'Hero section background',
  welcomeBg: 'Welcome section background',
  footerBg: 'Footer background',
  footerFg: 'Footer text',
  invertBg: 'Inverted / dark section background',
  invertFg: 'Inverted section text',
  invertSubtleFg: 'Inverted subtle text',
  navBg: 'Navbar background',
  navFg: 'Navbar text',
  navFgMuted: 'Navbar muted text',
  navActiveFg: 'Navbar active link',
  navBorder: 'Navbar border',
  cardBg: 'Card background',
  cardBorder: 'Card border',
  cardTitle: 'Card title',
  cardBody: 'Card body',
  cardMuted: 'Card muted text',
  textHeading: 'Heading text',
  textBody: 'Body text',
  textMuted: 'Muted text',
  textInverted: 'Inverted text (on dark)',
  borderDefault: 'Default border',
  borderStrong: 'Strong border',
  borderSubtle: 'Subtle border',
  inputBg: 'Input background',
  inputBorder: 'Input border',
  inputText: 'Input text',
  inputPlaceholder: 'Input placeholder',
  inputFocusRing: 'Input focus ring',
  link: 'Link color',
  linkHover: 'Link hover',
  badgeBg: 'Badge background',
  badgeFg: 'Badge text',
  ringAccent: 'Focus / ring accent',
}

/** @param {string} key */
export function categoryForSemanticKey(key) {
  if (
    [
      'brandPrimary',
      'brandSecondary',
      'brandAccent',
      'accentWarm',
      'brandDeep',
      'gradStart',
      'gradEnd',
      'link',
      'linkHover',
      'ringAccent',
    ].includes(key)
  ) {
    return 'brand'
  }
  if (key.startsWith('btn')) return 'buttons'
  if (key.startsWith('nav')) return 'navbar'
  if (key.startsWith('card')) return 'cards'
  if (
    [
      'pageBg',
      'surfaceSoft',
      'surfaceAlt',
      'surfaceBand',
      'surfaceHighlight',
      'surfaceDecorative',
      'surfaceCard',
      'heroBg',
      'welcomeBg',
      'footerBg',
      'footerFg',
      'invertBg',
      'invertFg',
      'invertSubtleFg',
    ].includes(key)
  ) {
    return 'sections'
  }
  if (key.startsWith('text')) return 'typography'
  if (key.startsWith('border')) return 'borders'
  if (key.startsWith('input')) return 'inputs'
  if (key.startsWith('badge')) return 'badges'
  return 'brand'
}
