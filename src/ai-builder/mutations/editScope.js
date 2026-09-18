import { AI_SECTION_TYPES } from '../constants.js'
import { normalizeSelectedElement } from '../lib/selectedElement.js'
import { resolveSectionId } from './targetResolver.js'

const EXTRA_SECTIONS = ['nav', 'pricing', 'feed', 'testimonials', 'location', 'social']
const ALL_SECTIONS = [...new Set([...AI_SECTION_TYPES, ...EXTRA_SECTIONS])]

const SECTION_FILE = Object.freeze({
  hero: 'src/components/Hero.jsx',
  about: 'src/components/About.jsx',
  services: 'src/components/Cards.jsx',
  products: 'src/components/Cards.jsx',
  offers: 'src/components/Cards.jsx',
  pricing: 'src/components/Cards.jsx',
  feed: 'src/components/Feed.jsx',
  gallery: 'src/components/Gallery.jsx',
  testimonials: 'src/components/Testimonials.jsx',
  reviews: 'src/components/Reviews.jsx',
  faq: 'src/App.jsx',
  cta: 'src/components/Cta.jsx',
  contact: 'src/components/Contact.jsx',
  location: 'src/components/Location.jsx',
  hours: 'src/components/Hours.jsx',
  social: 'src/components/Social.jsx',
  nav: 'src/components/Nav.jsx',
  footer: 'src/components/Footer.jsx',
})

const SECTION_ALIASES = [
  { id: 'hero', re: /\b(hero|banner|landing|top section|main (heading|title)|h1)\b/i },
  { id: 'about', re: /\b(about|welcome|story)\b/i },
  { id: 'services', re: /\b(services?|service list|service cards?)\b/i },
  { id: 'products', re: /\b(products?|catalogue|catalog|shop|new arrivals)\b/i },
  { id: 'offers', re: /\b(offers?|deals?|promos?|collections?)\b/i },
  { id: 'gallery', re: /\b(gallery|photos?|images grid)\b/i },
  { id: 'feed', re: /\b(feed|updates|posts?)\b/i },
  { id: 'testimonials', re: /\b(testimonials?|quotes?)\b/i },
  { id: 'reviews', re: /\b(reviews?)\b/i },
  { id: 'faq', re: /\b(faq|faqs|frequently asked)\b/i },
  { id: 'cta', re: /\b(cta|call to action)\b/i },
  { id: 'contact', re: /\b(contact( section)?|enquiry|inquiry|get in touch)\b/i },
  { id: 'location', re: /\b(location|map|address|directions)\b/i },
  { id: 'hours', re: /\b(hours|opening hours|timings?)\b/i },
  { id: 'social', re: /\b(social|instagram|facebook|twitter)\b/i },
  { id: 'nav', re: /\b(nav|navigation|menu|header)\b/i },
  { id: 'footer', re: /\b(footer|colophon)\b/i },
  { id: 'pricing', re: /\b(pricing|price list|packages)\b/i },
]

function uniq(list) {
  return [...new Set((list || []).filter(Boolean))]
}

export function sectionsMentionedInPrompt(prompt) {
  const text = String(prompt || '')
  const found = []
  for (const row of SECTION_ALIASES) {
    if (row.re.test(text)) found.push(row.id)
  }
  return uniq(found)
}

export function isExplicitSiteWidePrompt(prompt) {
  const lower = String(prompt || '').toLowerCase()
  if (!lower.trim()) return false
  if (/\b(entire website|whole (site|website|page)|all sections|everywhere|across the (site|website)|site[- ]wide)\b/.test(lower)) {
    return true
  }
  if (
    /\b(redesign|reimagine|restyle|rebrand|makeover|transform)\b/.test(lower) &&
    /\b(website|site|page)\b/.test(lower) &&
    !/\b(only|just|the (hero|footer|nav|about|services|products|gallery|contact))\b/.test(lower)
  ) {
    return true
  }
  if (
    /\b(look completely different|make my (salon |restaurant |hotel |boutique )?(website|site|profile) look)\b/.test(lower)
  ) {
    return true
  }
  return false
}

/**
 * Resolve precise edit scope from UI selection + natural language.
 * Prefer an explicit section selection / named section over site-wide heuristics.
 */
export function analyzeEditScope({ prompt, selectedElement, hasSite = true } = {}) {
  const text = String(prompt || '').trim()
  const lower = text.toLowerCase()
  const selected = normalizeSelectedElement(selectedElement)
  const selectedSection = selected.site ? null : selected.sectionId
  const mentioned = sectionsMentionedInPrompt(text)
  const onlyOne = /\b(only|just|solely)\b/.test(lower)
  const siteWide =
    isExplicitSiteWidePrompt(text) ||
    (/\b(everything|overall)\b/.test(lower) && /\b(design|look|style|premium|modern|layout)\b/.test(lower))

  let sections = []
  if (selectedSection && ALL_SECTIONS.includes(selectedSection)) {
    sections = [selectedSection]
    // If prompt names a different single section, prefer the prompt.
    if (mentioned.length === 1 && mentioned[0] !== selectedSection && !siteWide) {
      sections = mentioned
    } else if (mentioned.length > 1 && !siteWide) {
      sections = mentioned
    }
  } else if (mentioned.length) {
    sections = mentioned
  } else {
    const resolved = resolveSectionId(text, null)
    if (resolved && ALL_SECTIONS.includes(resolved)) sections = [resolved]
  }

  // "hero + cards" style prompts touch card sections too, but still not the whole site.
  if (
    !siteWide &&
    /\bcards?\b/.test(lower) &&
    sections.length &&
    !sections.some((id) => ['services', 'products', 'offers', 'pricing'].includes(id))
  ) {
    sections = uniq([...sections, 'services', 'products', 'offers'])
  }

  if (siteWide && !onlyOne) {
    sections = []
  }

  const scope =
    !hasSite || siteWide || (!sections.length && !selectedSection)
      ? 'site'
      : sections.length === 1
        ? 'section'
        : 'multi'

  const primary = scope === 'section' ? sections[0] : scope === 'multi' ? sections[0] : null
  const files = uniq([
    ...(scope === 'site'
      ? ['src/App.jsx', 'src/index.css', 'src/components/Hero.jsx']
      : sections.map((id) => SECTION_FILE[id]).filter(Boolean)),
    ...(scope !== 'site' ? ['src/index.css'] : []),
    ...(sections.includes('contact') || /\b(enquir|inquiry|contact form)\b/i.test(text)
      ? ['src/lib/getviaPublic.js', 'src/components/Contact.jsx']
      : []),
  ])

  const preserveDesign =
    scope !== 'site' ||
    onlyOne ||
    /\b(button|heading|text|copy|colour|color|font size|bigger|smaller|padding|margin)\b/.test(lower)

  const touchRootTokens =
    scope === 'site' ||
    (/\b(theme|palette|brand colour|brand color|entire|whole site)\b/.test(lower) && !onlyOne)

  return {
    scope,
    sections,
    primarySection: primary,
    selectedElement:
      scope === 'site' ? { site: true } : primary ? { sectionId: primary } : selected,
    files,
    preserveDesign,
    touchRootTokens,
    siteWide: scope === 'site',
    onlyOne,
    confidence: primary || siteWide ? 'high' : mentioned.length ? 'medium' : 'low',
  }
}

export function filesForSection(sectionId) {
  const file = SECTION_FILE[sectionId]
  return uniq([file, 'src/index.css'].filter(Boolean))
}

export function buildScopedExecutionBrief(scope) {
  if (!scope || scope.scope === 'site') {
    return [
      'EXECUTION SCOPE: site-wide (user asked for a broad visual change).',
      'Still preserve GetVia data bindings and do not invent business facts.',
      'Prefer updating design tokens + section components over rewriting every file.',
    ].join('\n')
  }

  const labels = scope.sections.join(', ')
  const files = scope.files.join(', ')
  return [
    `EXECUTION SCOPE: ${scope.scope === 'section' ? 'SINGLE SECTION' : 'LIMITED SECTIONS'} only.`,
    `Target section(s): ${labels}.`,
    `Allowed files to write: ${files}. You may also read other files for context.`,
    'Do NOT rewrite App.jsx section order, unrelated components, business.json facts, or other sections.',
    'Business features (enquiry, WhatsApp, phone) must use GetVia public APIs / existing bindings. Never edit GetVia server, admin, or marketplace code.',
    'Contact forms POST to POST /api/business/{publicId}/enquiries via src/lib/getviaPublic.js (credentials omit). Extra questions go in the message body.',
    scope.touchRootTokens
      ? 'Token/color changes may update :root in src/index.css, but keep section-specific selectors when possible.'
      : 'Do NOT change global :root theme tokens unless required for this section. Prefer section-local CSS (#id or .section-class).',
    'If the request is text/copy, edit only that text node in the target component.',
    'If unsure, leave unrelated sections untouched.',
  ].join('\n')
}

export function resolveSelectedElementForPrompt({ prompt, selectedElement } = {}) {
  const scope = analyzeEditScope({ prompt, selectedElement, hasSite: true })
  return scope.selectedElement
}
