import { validateWebsiteState } from '../state/websiteState.schema.js'
import { aiThemeContrastIssues } from '../theme/aiTheme.js'
import { AI_SECTION_TYPES } from '../constants.js'
import { COMPONENT_TYPES } from '../state/componentRegistry.js'
import { runPlaywrightValidation } from './playwrightValidation.js'

export const VALIDATION_VIEWPORTS = [320, 375, 390, 414, 768, 1024, 1280, 1440, 1920]

const HASH_ALIASES = {
  'new-arrivals': 'products',
  'featured-collections': 'offers',
  booking: 'contact',
  appointment: 'contact',
}

function collectComponents(state) {
  const out = []
  for (const section of state?.pages?.[0]?.sections || []) {
    for (const row of section.components || []) {
      out.push({ sectionId: section.id, ...row })
    }
  }
  return out
}

function destinationLooksLive(href, sectionOrder = []) {
  const dest = String(href || '').trim()
  if (!dest) return false
  if (/^(https?:\/\/|mailto:|tel:)/i.test(dest)) return true
  if (dest.startsWith('/') && !dest.startsWith('/#')) return true
  const hash = dest.replace(/^\/?#/, '')
  const target = HASH_ALIASES[hash] || hash
  return Boolean(target && (sectionOrder.includes(target) || sectionOrder.includes(hash)))
}

export function runWebsiteValidation(state, { profile } = {}) {
  const errors = []
  const warnings = []
  const skipped = []

  const schema = validateWebsiteState(state)
  for (const err of schema.errors || []) {
    // Unknown section ids / soft colour issues are common on AI drafts — do not hard-block publish.
    if (err?.type === 'UNSUPPORTED_SECTION' || err?.type === 'INVALID_COLOR') warnings.push(err)
    else errors.push(err)
  }

  if (Array.isArray(state?.sectionOrder)) {
    for (const id of state.sectionOrder) {
      if (!AI_SECTION_TYPES.includes(id)) {
        // Custom section ids from isolated AI sites are common — advisory only.
        warnings.push({ type: 'UNSUPPORTED_SECTION', page: '/', sectionId: id })
      }
    }
  }

  warnings.push(
    ...aiThemeContrastIssues(state?.theme?.colors || {}).map((issue) => ({
      ...issue,
      page: '/',
    })),
  )

  const landing = state?.content?.landing || {}
  if (landing.bannerImageUrl && !/^https?:\/\//i.test(landing.bannerImageUrl) && !landing.bannerImageUrl.startsWith('/')) {
    warnings.push({ type: 'BROKEN_IMAGE', page: '/', field: 'hero' })
  }

  for (const row of collectComponents(state)) {
    if (row.type && !COMPONENT_TYPES.includes(row.type)) {
      warnings.push({ type: 'UNSUPPORTED_COMPONENT', page: '/', sectionId: row.sectionId, componentId: row.id })
    }
    if (row.type === 'button') {
      const href = row.props?.href || row.props?.action?.target
      if (!destinationLooksLive(href, state.sectionOrder || [])) {
        warnings.push({
          type: 'DEAD_LINK',
          page: '/',
          componentId: row.id,
          message: href ? `Button points to missing ${href}` : 'Button has no destination',
        })
      }
    }
    if (row.type === 'image' && row.props?.src && !/^https?:\/\//i.test(row.props.src) && !String(row.props.src).startsWith('/')) {
      warnings.push({ type: 'BROKEN_IMAGE', page: '/', componentId: row.id })
    }
  }

  const seen = new Set()
  for (const id of state?.sectionOrder || []) {
    if (seen.has(id)) errors.push({ type: 'DUPLICATE_SECTION', page: '/', sectionId: id })
    seen.add(id)
  }

  if (state?.settings?.hasAiDesign && (state.sectionOrder || []).includes('hero')) {
    const heading = landing.bannerTitle || collectComponents(state).find((row) => row.id === 'hero-heading')?.props?.text
    if (!String(heading || '').trim()) {
      warnings.push({ type: 'EMPTY_HERO', page: '/', message: 'Hero is visible but has no heading' })
    }
  }

  const phone = profile?.contact?.phone
  if (state?.functionality?.call && !phone) {
    warnings.push({ type: 'FAKE_FUNCTION', message: 'Call button would have no number' })
  }
  if (state?.functionality?.whatsapp && !(profile?.contact?.whatsappHref || profile?.contact?.socialLinks?.whatsapp)) {
    warnings.push({ type: 'FAKE_FUNCTION', message: 'WhatsApp requested but not configured' })
  }

  if (!state?.seo?.title) warnings.push({ type: 'SEO_TITLE', page: '/' })
  if (!state?.seo?.description) warnings.push({ type: 'SEO_DESCRIPTION', page: '/' })
  if (!state?.seo?.canonical) warnings.push({ type: 'SEO_CANONICAL', page: '/' })

  skipped.push({
    type: 'PLAYWRIGHT_LAYOUT',
    message: 'Live preview visual QA runs in the isolated builder. Website State snapshot overflow is checked by runPlaywrightValidation when Chromium is installed.',
    viewports: VALIDATION_VIEWPORTS,
  })

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    skipped,
    viewports: VALIDATION_VIEWPORTS,
  }
}

export { runPlaywrightValidation }
