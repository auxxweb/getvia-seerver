/**
 * Product contract: GetVia owns data + structure + functionality.
 * AI owns design + presentation + customization.
 */

import { AI_SECTION_TYPES, GETVIA_SECTION_IDS } from '../constants.js'
import { categoryPatternFor } from '../templates/categoryPatterns.js'
import { masterIntelligenceBrief } from './masterAgentPrompt.js'
import { industryDirectionPool, selectDesignComposition } from '../design-library/index.js'

export const PRODUCT_RULE = Object.freeze({
  getvia: 'DATA + STRUCTURE + FUNCTIONALITY',
  ai: 'DESIGN + PRESENTATION + CUSTOMIZATION',
  user: 'CREATIVE DIRECTION',
})

/** Isolated workspace section ids that mirror GetVia profile capabilities. */
export const GETVIA_WORKSPACE_SECTIONS = Object.freeze([
  'hero',
  'about',
  'offers',
  'products',
  'services',
  'feed',
  'gallery',
  'testimonials',
  'reviews',
  'contact',
  'location',
  'hours',
  'social',
  'cta',
  'footer',
])

/** Map GetVia listing section ids → AI / workspace section ids. */
export const GETVIA_TO_WORKSPACE = Object.freeze({
  top: 'hero',
  welcome: 'about',
  offers: 'offers',
  'core-services': 'services',
  catalogue: 'products',
  gallery: 'gallery',
  testimonials: 'testimonials',
  map: 'location',
  contact: 'contact',
  hours: 'hours',
  social: 'social',
  feed: 'feed',
  footer: 'footer',
})

export function str(v) {
  return String(v ?? '').trim()
}

function hasItems(list) {
  return Array.isArray(list) && list.some((row) => row && (str(row.name) || str(row.title) || str(row.quote) || str(row.comment)))
}

function hasImages(list) {
  return Array.isArray(list) && list.some((row) => (typeof row === 'string' ? str(row) : str(row?.url || row?.src || row?.image)))
}

function hoursPresent(profile) {
  const hours = profile?.openingHours
  if (Array.isArray(hours) && hours.some((h) => h && !h.closed && (str(h.open) || str(h.close) || str(h.day)))) return true
  return Boolean(str(profile?.hoursText) || str(profile?.identity?.hours))
}

/**
 * Decide which GetVia capabilities to surface. Never invent empty marketing sections.
 * Hero / contact / footer stay available so the site remains a working profile shell.
 */
export function sectionsFromGetviaProfile({ profile, websiteState, plan, prompt } = {}) {
  const content = profile?.content || {}
  const contact = profile?.contact || {}
  const location = profile?.location || {}
  const identity = profile?.identity || {}
  const reviews = profile?.reviews || {}
  const lower = String(prompt || '').toLowerCase()

  const fromPlan = (plan?.sections || []).map((s) => s.type || s.id).filter(Boolean)
  const fromState = Array.isArray(websiteState?.sectionOrder) ? websiteState.sectionOrder.filter(Boolean) : []
  const vis = websiteState?.sectionVisibility || {}

  const available = new Set(['hero', 'footer', 'contact'])
  if (str(identity.description) || str(content.landing?.welcomeDescription) || str(content.landing?.welcomeTitle)) {
    available.add('about')
  }
  if (hasItems(content.offers)) available.add('offers')
  if (hasItems(content.coreServices)) available.add('services')
  if (hasItems(content.catalogue)) available.add('products')
  if (hasItems(content.feed) || hasItems(content.profileFeed)) available.add('feed')
  if (hasImages(content.gallery)) available.add('gallery')
  if (hasItems(content.testimonials)) available.add('testimonials')
  if ((reviews.reviewCount || 0) > 0 || hasItems(reviews.recent) || hasItems(content.reviews)) available.add('reviews')
  if (str(location.mapLink) || location.coordinates || str(location.address) || str(location.formattedAddress)) {
    available.add('location')
  }
  if (hoursPresent(profile)) available.add('hours')
  const social = contact.socialLinks || {}
  if (Object.values(social).some((v) => str(v)) || str(contact.whatsappHref) || str(social.whatsapp)) {
    available.add('social')
  }
  available.add('cta')

  let order = []
  if (fromState.length) {
    order = fromState.filter((id) => available.has(id) || vis[id] !== false)
  } else if (fromPlan.length) {
    order = fromPlan.filter((id) => available.has(id))
  } else {
    order = GETVIA_WORKSPACE_SECTIONS.filter((id) => available.has(id))
  }

  for (const id of ['hero', 'contact', 'footer']) {
    if (!order.includes(id)) {
      if (id === 'hero') order.unshift('hero')
      else if (id === 'footer') order.push('footer')
      else {
        const at = order.indexOf('footer')
        order.splice(at >= 0 ? at : order.length, 0, 'contact')
      }
    }
  }

  if (/move services above about/i.test(lower) && order.includes('services')) {
    order = order.filter((id) => id !== 'services')
    const aboutAt = order.indexOf('about')
    order.splice(aboutAt >= 0 ? aboutAt : 1, 0, 'services')
  }
  if (/\b(pricing|price list|packages)\b/.test(lower) && !order.includes('pricing') && hasItems(content.offers)) {
    const contactAt = order.indexOf('contact')
    order.splice(contactAt >= 0 ? contactAt : order.length, 0, 'pricing')
  }

  return order.filter((id, i, all) => all.indexOf(id) === i)
}

export function functionalityFromProfile(profile = {}) {
  const contact = profile.contact || {}
  const location = profile.location || {}
  const social = contact.socialLinks || {}
  const phone = str(contact.phone)
  const email = str(contact.email)
  const whatsapp = str(contact.whatsappHref) || str(social.whatsapp)
  return {
    call: Boolean(phone),
    whatsapp: Boolean(whatsapp),
    email: Boolean(email),
    enquiry: true,
    directions: Boolean(str(location.mapLink) || location.coordinates),
    social: Object.values(social).some((v) => str(v)),
    products: hasItems(profile.content?.catalogue),
    services: hasItems(profile.content?.coreServices),
    offers: hasItems(profile.content?.offers),
    gallery: hasImages(profile.content?.gallery),
    feed: hasItems(profile.content?.feed) || hasItems(profile.content?.profileFeed),
    reviews: (profile.reviews?.reviewCount || 0) > 0 || hasItems(profile.reviews?.recent),
  }
}

/** Prefer GetVia facts; never invent when a real field is empty. */
export function pickFact(...candidates) {
  for (const c of candidates) {
    const v = str(c)
    if (v) return v
  }
  return ''
}

export function formatHoursText(openingHours, hoursText) {
  if (str(hoursText)) return str(hoursText)
  const rows = Array.isArray(openingHours) ? openingHours : []
  if (!rows.length) return ''
  return rows
    .map((h) => {
      if (!h) return ''
      if (h.closed) return `${str(h.day)}: Closed`
      return `${str(h.day)}: ${str(h.open)}–${str(h.close)}`
    })
    .filter(Boolean)
    .join('\n')
}

function hashPick(list, seed) {
  const rows = Array.isArray(list) && list.length ? list : ['neo-minimal']
  let h = 2166136261
  for (const ch of String(seed || 'getvia')) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return rows[(h >>> 0) % rows.length]
}

/**
 * Pick a visual direction from the industry pool (not a single fixed mapping).
 * Pass seed (business name / project id) for stable variety across tenants.
 */
export function designDirectionForCategory(category = '', subcategory = '', prompt = '', seed = '') {
  const pool = industryDirectionPool(category, subcategory, prompt)
  return hashPick(pool, `${seed}:${category}:${subcategory}:${String(prompt || '').slice(0, 60)}`)
}

export function designCompositionForBusiness(opts = {}) {
  return selectDesignComposition(opts)
}

export function productBriefLines({ mode, novelty, designDna, functionality, scoped = false, libraryBrief = '' } = {}) {
  return [
    masterIntelligenceBrief({ mode, scoped, designDna }),
    libraryBrief,
    'PRODUCT CONTRACT:',
    `GetVia = ${PRODUCT_RULE.getvia}. AI = ${PRODUCT_RULE.ai}. User = ${PRODUCT_RULE.user}.`,
    'This is a design transformation of an existing GetVia profile — not a generic website generator.',
    'Never invent business name, phone, email, WhatsApp, products, services, offers, gallery, or reviews when GetVia data exists (or when those fields are intentionally empty).',
    'STRUCTURE (GetVia): sections, data bindings, enquiry, WhatsApp, phone, products, services, offers, gallery, feed, reviews, location, hours, social.',
    'DESIGN (AI): colors, type, spacing, hero composition, card language, nav, image treatment, animation, visual personality.',
    mode ? `Design mode: ${mode}${novelty != null ? ` (novelty ${novelty}/5)` : ''}.` : '',
    designDna?.visualDirection ? `Design DNA direction: ${designDna.visualDirection}.` : '',
    functionality
      ? `Keep GetVia actions working: ${Object.entries(functionality)
          .filter(([, on]) => on)
          .map(([k]) => k)
          .join(', ') || 'enquiry'}.`
      : '',
    `Baseline listing sections: ${GETVIA_SECTION_IDS.join(', ')}. Workspace sections: ${GETVIA_WORKSPACE_SECTIONS.join(', ')}.`,
    `Website State section types remain: ${AI_SECTION_TYPES.join(', ')}.`,
  ].filter(Boolean)
}
