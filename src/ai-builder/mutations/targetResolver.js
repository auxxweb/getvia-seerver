import { AI_SECTION_TYPES } from '../constants.js'
import { hydrateSectionComponents, findSection, listButtons } from './hydrateComponents.js'

const SECTION_ALIASES = [
  { id: 'hero', keys: ['hero', 'banner', 'main banner', 'first section', 'header section', 'top section'] },
  { id: 'about', keys: ['about', 'welcome', 'story'] },
  { id: 'services', keys: ['services', 'service'] },
  { id: 'products', keys: ['products', 'product', 'catalogue', 'catalog', 'new arrivals', 'new arrival', 'shop'] },
  { id: 'offers', keys: ['offers', 'offer', 'featured collections', 'featured collection', 'featured', 'collections'] },
  { id: 'gallery', keys: ['gallery', 'photos'] },
  { id: 'faq', keys: ['faq', 'faqs', 'frequently asked questions'] },
  { id: 'reviews', keys: ['reviews', 'testimonials'] },
  { id: 'cta', keys: ['cta', 'call to action'] },
  { id: 'contact', keys: ['contact', 'get in touch', 'booking', 'book appointment', 'appointment'] },
  { id: 'hours', keys: ['hours', 'opening hours'] },
  { id: 'footer', keys: ['footer'] },
]

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function resolveSectionId(text, state) {
  const n = norm(text)
  if (!n) return null
  for (const row of SECTION_ALIASES) {
    if (row.keys.some((key) => n === key || n.includes(key))) return row.id
  }
  const sections = state?.pages?.[0]?.sections || []
  for (const sec of sections) {
    const title = norm(sec.title || '')
    const aliases = (sec.aliases || []).map(norm)
    if (title && (n.includes(title) || title.includes(n))) return sec.type || sec.id
    if (aliases.some((a) => a && (n.includes(a) || a.includes(n)))) return sec.type || sec.id
  }
  const catalogueTitle = norm(state?.content?.catalogue?.title)
  const offersTitle = norm(state?.content?.offers?.title)
  if (catalogueTitle && n.includes(catalogueTitle)) return 'products'
  if (offersTitle && n.includes(offersTitle)) return 'offers'
  if (AI_SECTION_TYPES.includes(n)) return n
  return null
}

export function resolveTarget({ prompt, selectedElement, state, hint } = {}) {
  const hydrated = hydrateSectionComponents(state || {})
  const selectedSection = selectedElement?.sectionId && selectedElement.sectionId !== 'site' ? selectedElement.sectionId : null
  const fromHint = hint ? resolveSectionId(hint, hydrated) : null
  const fromPrompt = resolveSectionId(prompt, hydrated)
  const promptNorm = norm(prompt)
  const promptNamesSection = Boolean(fromPrompt) && new RegExp(`\\b${fromPrompt}\\b|\\bhero\\b|\\bbanner\\b`).test(promptNorm)
  const sectionId = (promptNamesSection && fromPrompt) || selectedSection || fromHint || fromPrompt || null
  const section = sectionId ? findSection(hydrated, sectionId) : null
  const buttons = listButtons(hydrated, section?.id || sectionId)
  const adding = /\b(add|include|insert|put a|put an)\b/.test(promptNorm)
  let component = null
  if (selectedElement?.componentId) {
    component = (section?.components || []).find((row) => row.id === selectedElement.componentId) || null
  }
  if (!component && /button/.test(promptNorm) && !adding) {
    const quoted = String(prompt || '').match(/['"]([^'"]+)['"]/)
    const needle = norm(quoted?.[1] || '')
    if (needle) {
      component = buttons.find((b) => norm(b.props?.text) === needle || norm(b.props?.text).includes(needle)) || null
    }
    if (!component && /shop now/.test(promptNorm)) {
      component = buttons.find((b) => /shop now/i.test(b.props?.text || '')) || null
    }
    if (!component) component = buttons[buttons.length - 1] || buttons[0] || null
  }
  if (!component && /heading|headline|title/.test(promptNorm) && section) {
    component = (section.components || []).find((row) => row.type === 'heading') || null
  }
  const confidence = section ? (fromHint || fromPrompt ? 'high' : selectedSection ? 'medium' : 'low') : 'none'
  return {
    pageId: 'home',
    sectionId: section?.id || sectionId,
    sectionType: section?.type || sectionId,
    componentId: component?.id || null,
    componentType: component?.type || null,
    htmlId: (section?.aliases || [])[0] || section?.id || sectionId,
    confidence,
    section,
    component,
  }
}

export function sectionExists(state, sectionId) {
  const vis = state?.sectionVisibility || {}
  if (vis[sectionId] === false) return false
  return (state?.sectionOrder || []).includes(sectionId) || Boolean(findSection(state, sectionId))
}
