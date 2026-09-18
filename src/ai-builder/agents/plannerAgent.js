import { AI_SECTION_TYPES } from '../constants.js'
import { completeJson } from '../openai/structuredOutput.js'
import { inferTierFromTask } from '../openai/modelRouter.js'
import { inferAiTypography } from '../theme/aiTheme.js'
import { lookLayout, resolveVisualLook } from '../theme/visualLook.js'

function lookFromRequirements(requirements) {
  return (
    (requirements?.changes || []).find((c) => c.property === 'look')?.value ||
    resolveVisualLook(JSON.stringify(requirements || {})) ||
    null
  )
}

function variantFor(type, look) {
  const layout = lookLayout(look || 'original')
  if (type === 'hero') return layout.hero
  if (type === 'about') return layout.about
  if (type === 'gallery') return layout.gallery
  if (type === 'contact') return layout.contact
  if (type === 'footer') return layout.footer
  if (['services', 'products', 'offers'].includes(type)) return layout.cards
  return 'stacked'
}

function defaultSections(profile, requirements) {
  const look = lookFromRequirements(requirements)
  const content = profile?.content || {}
  const sections = [{ id: 'hero', type: 'hero', variant: variantFor('hero', look) }]
  if (profile?.identity?.description || content.landing?.welcomeTitle) {
    sections.push({ id: 'about', type: 'about', variant: variantFor('about', look) })
  }
  if ((content.coreServices || []).length) sections.push({ id: 'services', type: 'services', variant: variantFor('services', look) })
  if ((content.catalogue || []).length) sections.push({ id: 'products', type: 'products', variant: variantFor('products', look) })
  if ((content.offers || []).length) sections.push({ id: 'offers', type: 'offers', variant: variantFor('offers', look) })
  if ((content.gallery || []).length) sections.push({ id: 'gallery', type: 'gallery', variant: variantFor('gallery', look) })
  sections.push({ id: 'cta', type: 'cta', variant: 'stacked' })
  sections.push({ id: 'contact', type: 'contact', variant: variantFor('contact', look) })
  sections.push({ id: 'footer', type: 'footer', variant: variantFor('footer', look) })
  return sections
}

export function planWebsiteHeuristic({ profile, requirements }) {
  const paletteChange = (requirements?.changes || []).find((c) => c.property === 'primaryPalette')
  const look = lookFromRequirements(requirements)
  const style = (requirements?.changes || []).find((c) => c.property === 'style')?.value || paletteChange?.value || look || ''
  const sections = defaultSections(profile, requirements)
  const reorder = (requirements?.changes || []).find((c) => c.target === 'services' && c.property === 'ordering')
  if (reorder && !sections.some((s) => s.type === 'services')) {
    sections.splice(1, 0, { id: 'services', type: 'services', variant: variantFor('services', look) })
  }
  for (const change of requirements?.changes || []) {
    if (change.target === 'sections' && change.property === 'add' && AI_SECTION_TYPES.includes(change.value)) {
      if (!sections.some((s) => s.type === change.value)) {
        const galleryIdx = sections.findIndex((s) => s.type === 'gallery')
        const insertAt =
          change.value === 'faq' && galleryIdx >= 0
            ? galleryIdx + 1
            : Math.max(sections.length - 2, 1)
        sections.splice(insertAt, 0, { id: change.value, type: change.value, variant: variantFor(change.value, look) })
      }
    }
  }

  return {
    engine: 'ai',
    layout: 'one-page',
    templateId: null,
    themePreset: paletteChange?.value || look || 'original',
    typography: inferAiTypography(style),
    pages: [{ type: 'home', sections: sections.map((s) => s.type) }],
    sections,
    tasks: [
      { agent: 'design', action: 'createOriginalTheme' },
      { agent: 'content', action: 'writeOnePageCopy' },
      { agent: 'asset', action: 'selectGalleryImages' },
      { agent: 'functionality', action: 'configureActions' },
      { agent: 'seo', action: 'generateSeo' },
    ],
    complexity: inferTierFromTask({ type: 'WEBSITE_PLANNING', fullSite: true }),
    notes: [
      'Build an original one-page website from the customer brief only.',
      'Do not use GetVia listing templates, template palettes, or template layouts.',
      requirements?.brief ? `Customer requirement: ${String(requirements.brief).slice(0, 500)}` : '',
    ].filter(Boolean),
  }
}

export async function plannerAgent({ profile, requirements, currentState, usageCtx, signal }) {
  const heuristic = planWebsiteHeuristic({ profile, requirements, currentState })
  const llm = await completeJson({
    tier: 'complex',
    schemaName: 'build_plan',
    usageCtx,
    signal,
    soft: true,
    system: `You plan an original one-page marketing website for a GetVia business.
Do not choose or mention listing templates.
Do not copy listing-template layouts (full-bleed overlay heroes, split about, mosaic galleries) unless the user asked for that look.
Default section variants to stacked/standard when the brief does not specify a visual style.
Theme, typography, and layout must come only from the customer brief — never from listing template presets.
Allowed section types: ${AI_SECTION_TYPES.join(', ')}.
Return JSON with sections (id, type, variant), themePreset, typography, notes.`,
    user: JSON.stringify({
      heuristic,
      requirements,
      brief: requirements?.brief || requirements?.userPrompt,
      analysis: requirements?.analysis,
      category: profile?.identity?.category,
      missing: profile?.missing,
    }),
  })
  if (!llm.ok || !llm.data) return heuristic
  const look = lookFromRequirements(requirements)
  const sections = Array.isArray(llm.data.sections)
    ? llm.data.sections
        .map((row, i) => {
          const type = AI_SECTION_TYPES.includes(row.type) ? row.type : AI_SECTION_TYPES.includes(row.id) ? row.id : 'about'
          const listingLike = /full-bleed|overlay|mosaic/.test(String(row.variant || ''))
          return {
            id: AI_SECTION_TYPES.includes(row.id) ? row.id : type,
            type,
            variant: !look && listingLike ? variantFor(type, null) : row.variant || variantFor(type, look),
            heading: row.heading,
            body: row.body,
            index: i,
          }
        })
        .filter((row) => AI_SECTION_TYPES.includes(row.type))
    : heuristic.sections
  return {
    ...heuristic,
    ...llm.data,
    engine: 'ai',
    layout: 'one-page',
    templateId: null,
    themePreset: look || llm.data.themePreset || heuristic.themePreset || 'original',
    sections: sections.length ? sections : heuristic.sections,
    typography: llm.data.typography || heuristic.typography,
  }
}
