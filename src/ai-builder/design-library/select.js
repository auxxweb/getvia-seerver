import { DIRECTION_IDS, DIRECTIONS, specFromDirection } from '../../../agent/visual/design-explorer/catalog.js'
import { INDUSTRY_IDS, resolveIndustry } from './industries.js'
import { DESIGN_PRINCIPLES, principlesForIds, formatPrinciplesBrief } from './principles.js'
import {
  COMPONENT_VARIANTS,
  COMPONENT_VARIANT_COUNT,
  formatComponentPlan,
  variantById,
  variantsForSection,
} from './components.js'

function hashSeed(value) {
  let h = 2166136261
  for (const ch of String(value || 'getvia')) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pick(list, seed) {
  const rows = Array.isArray(list) && list.length ? list : []
  if (!rows.length) return null
  return rows[hashSeed(seed) % rows.length]
}

function pickDirection(pool, seed, avoid = []) {
  const blocked = new Set(avoid.filter(Boolean))
  let candidates = (pool || []).filter((id) => DIRECTIONS[id] && !blocked.has(id))
  if (!candidates.length) candidates = (pool || []).filter((id) => DIRECTIONS[id])
  if (!candidates.length) candidates = [...DIRECTION_IDS]
  return pick(candidates, seed)
}

/**
 * Select a full design composition for a business.
 * Different businesses / prompts hash to different directions + component variants.
 */
export function selectDesignComposition({
  category = '',
  subcategory = '',
  prompt = '',
  businessName = '',
  seed = '',
  avoidDirections = [],
  novelty = 3,
  sections = [],
} = {}) {
  const industry = resolveIndustry(category, subcategory, prompt)
  const salt = `${seed}:${businessName}:${category}:${String(prompt || '').slice(0, 80)}:${novelty}`
  const directionId = pickDirection(industry.directions, `${salt}:direction`, avoidDirections)
  const spec = specFromDirection(directionId)

  const pickVariant = (section, preferredIds, fallbackSection) => {
    const preferred = (preferredIds || []).filter((id) => variantById(id))
    if (preferred.length) return pick(preferred, `${salt}:${section}`)
    const pool = variantsForSection(fallbackSection || section).map((v) => v.id)
    return pick(pool, `${salt}:${section}`) || null
  }

  const components = {
    nav: pickVariant('nav', null, 'nav'),
    hero: pickVariant('hero', industry.heroes, 'hero'),
    about: pickVariant('about', null, 'about'),
    services: pickVariant('services', industry.services, 'services'),
    products: pickVariant('products', null, 'products'),
    offers: pickVariant('offers', null, 'offers'),
    gallery: pickVariant('gallery', industry.gallery, 'gallery'),
    testimonials: pickVariant('testimonials', null, 'testimonials'),
    reviews: pickVariant('reviews', null, 'reviews'),
    feed: pickVariant('feed', null, 'feed'),
    contact: pickVariant('contact', null, 'contact'),
    location: pickVariant('location', null, 'location'),
    hours: pickVariant('hours', null, 'hours'),
    cta: pickVariant('cta', null, 'cta'),
    footer: pickVariant('footer', null, 'footer'),
  }

  // Only keep sections that exist (or core always-useful ones for the brief)
  const activeSections = new Set(
    (sections || []).length
      ? sections
      : ['nav', 'hero', 'about', 'services', 'gallery', 'contact', 'footer'],
  )
  const filteredComponents = Object.fromEntries(
    Object.entries(components).filter(([key]) => activeSections.has(key) || ['nav', 'hero', 'footer'].includes(key)),
  )

  const principles = principlesForIds(industry.principles)
  const patternId = `${industry.id}__${directionId}__${filteredComponents.hero || 'hero'}`

  return {
    patternId,
    industry: { id: industry.id, label: industry.label, ctas: industry.ctas },
    directionId,
    directionLabel: spec.label,
    spec,
    components: filteredComponents,
    principles,
    novelty,
    libraryStats: {
      directions: DIRECTION_IDS.length,
      componentVariants: COMPONENT_VARIANT_COUNT,
      principles: DESIGN_PRINCIPLES.length,
      industries: INDUSTRY_IDS.length,
    },
  }
}

export function formatDesignLibraryBrief(composition) {
  if (!composition) return ''
  return [
    'UNIVERSAL DESIGN LIBRARY SELECTION:',
    `Industry: ${composition.industry?.label || 'Local Business'} (${composition.industry?.id}).`,
    `Pattern: ${composition.patternId}.`,
    `Visual direction: ${composition.directionId} — ${composition.directionLabel}.`,
    `Library size: ${composition.libraryStats?.directions || 0} directions, ${composition.libraryStats?.componentVariants || 0} component structures, ${composition.libraryStats?.principles || 0} principles.`,
    'Do NOT default to a previous business look. Follow this composition.',
    `Preferred CTAs (only if GetVia data supports): ${(composition.industry?.ctas || []).join(', ')}.`,
    formatPrinciplesBrief(composition.principles || []),
    formatComponentPlan(composition.components || {}),
    'Avoid repeating the same card layout in consecutive sections. Vary proportion, alignment, and density.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function designLibraryCatalogSummary() {
  return {
    directions: DIRECTION_IDS.length,
    componentVariants: COMPONENT_VARIANT_COUNT,
    principles: DESIGN_PRINCIPLES.length,
    directionIds: [...DIRECTION_IDS],
    componentSections: [...new Set(COMPONENT_VARIANTS.map((v) => v.section))],
  }
}
