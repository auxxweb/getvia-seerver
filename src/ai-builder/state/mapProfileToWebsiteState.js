import { emptyWebsiteState } from './websiteState.schema.js'
import { AI_SECTION_TYPES, PUBLIC_PROFILE_PATH, getPublicSiteOrigin } from '../constants.js'
import { DEFAULT_AI_THEME_COLORS } from '../theme/aiTheme.js'
import { structuredDataTypeForCategory } from '../templates/categoryPatterns.js'
import { hydrateSectionComponents } from '../mutations/hydrateComponents.js'

function str(v) {
  return String(v ?? '').trim()
}

function mapItems(list, mapFn) {
  return (Array.isArray(list) ? list : []).map(mapFn)
}

/**
 * Copy business facts into an AI website draft.
 * Listing templates and template palettes are never applied.
 */
export function mapProfileToWebsiteState({ business, content, siteId }) {
  const state = emptyWebsiteState()
  const b = business || {}
  const c = content || {}
  const landing = c.landingSection || {}
  state.engine = 'ai'
  state.layout = 'one-page'
  state.templateId = null
  state.siteId = siteId ? String(siteId) : ''
  state.businessId = b._id ? String(b._id) : ''
  state.theme.colors = { ...DEFAULT_AI_THEME_COLORS }

  const hasOffers = (c.offers || []).length > 0
  const hasServices = (c.coreServices || []).length > 0
  const hasCatalogue = (c.catalogue || []).length > 0
  const hasGallery = (c.gallery || []).filter(Boolean).length > 0
  const hasHours = Array.isArray(b.openingHours) && b.openingHours.some((h) => h && !h.closed)

  const hasFeed = (c.profileFeed || []).length > 0
  const hasSocial = Object.values(b.socialLinks || {}).some((v) => str(v))
  const hasMap = Boolean(str(b.googleMapLink) || b.mapLocation?.coordinates?.lat || b.location?.coordinates)

  state.sectionVisibility = {
    hero: true,
    about: Boolean(str(landing.welcomeTitle) || str(landing.welcomeDescription) || str(b.description)),
    offers: hasOffers,
    services: hasServices,
    products: hasCatalogue,
    feed: hasFeed,
    gallery: hasGallery,
    faq: false,
    testimonials: false,
    reviews: (b.reviewCount || 0) > 0,
    cta: true,
    contact: true,
    location: hasMap || Boolean(str(b.address)),
    hours: hasHours,
    social: hasSocial || Boolean(str(b.whatsappHref)),
    footer: true,
  }
  state.sectionOrder = AI_SECTION_TYPES.filter((id) => state.sectionVisibility[id] !== false)
  state.pages[0].sections = state.sectionOrder.map((type) => ({
    id: type,
    type,
    variant: 'stacked',
    visible: true,
  }))

  state.content.description = str(b.description)
  state.content.landing = {
    bannerTitle: str(landing.bannerTitle) || str(b.name),
    bannerDescription: str(landing.bannerDescription) || str(b.description),
    bannerImageUrl: str(landing.bannerImageUrl),
    bannerImagePublicId: str(landing.bannerImagePublicId),
    bannerCtaLabel: str(landing.bannerCtaLabel) || 'Get in touch',
    bannerCtaLink: str(landing.bannerCtaLink) || '#contact',
    welcomeTitle: str(landing.welcomeTitle) || (b.name ? `About ${b.name}` : ''),
    welcomeDescription: str(landing.welcomeDescription) || str(b.description),
    welcomeImageUrl: str(landing.welcomeImageUrl),
    welcomeImagePublicId: str(landing.welcomeImagePublicId),
    welcomeCtaLabel: str(landing.welcomeCtaLabel),
    welcomeCtaLink: str(landing.welcomeCtaLink),
  }
  state.content.offers = {
    title: str(c.offersPageTitle) || 'Offers',
    description: str(c.offersPageDescription),
    items: mapItems(c.offers, (row, i) => ({
      id: row._id ? String(row._id) : `offer-${i}`,
      title: str(row.title),
      description: str(row.description),
      image: str(row.image),
      imagePublicId: str(row.imagePublicId),
      link: str(row.link),
      linkLabel: str(row.linkLabel),
      priceActual: str(row.priceActual),
      priceOffer: str(row.priceOffer),
    })),
  }
  state.content.coreServices = {
    title: str(c.corePageTitle) || 'Services',
    description: str(c.corePageDescription),
    items: mapItems(c.coreServices, (row, i) => ({
      id: row._id ? String(row._id) : `svc-${i}`,
      title: str(row.title),
      description: str(row.description),
      imageUrl: str(row.imageUrl),
      imagePublicId: str(row.imagePublicId),
      links: str(row.links),
      linkLabel: str(row.linkLabel),
    })),
  }
  state.content.catalogue = {
    title: str(c.productsPageTitle) || 'Products',
    description: str(c.productsPageDescription),
    items: mapItems(c.catalogue, (row, i) => ({
      id: row._id ? String(row._id) : `cat-${i}`,
      name: str(row.name || row.title),
      description: str(row.description),
      image: str(row.image),
      imagePublicId: str(row.imagePublicId),
      price: str(row.price),
      link: str(row.link),
      linkLabel: str(row.linkLabel),
    })),
  }
  state.content.gallery = (c.gallery || []).filter(Boolean).map((url) => str(url))
  state.content.faq = { title: 'Frequently asked questions', items: [] }
  state.content.reviews = { title: 'Reviews', items: [] }
  state.content.feed = {
    title: str(c.feedPageTitle),
    description: str(c.feedPageDescription),
    items: mapItems(c.profileFeed, (row, i) => ({
      id: row._id ? String(row._id) : `feed-${i}`,
      title: str(row.title),
      description: str(row.description),
      image: str(row.image),
      imagePublicId: str(row.imagePublicId),
      link: str(row.link),
    })),
  }

  state.settings.serviceOrder = state.content.coreServices.items.map((item) => item.id)
  state.settings.businessName = str(b.name)
  state.settings.logo = str(b.logo)
  state.settings.phone = str(b.phone)
  state.settings.email = str(b.contactEmail)
  state.settings.address = str(b.address)
  state.settings.city = str(b.city)
  state.settings.whatsapp = str(b.whatsappHref) || str(b.socialLinks?.whatsapp)
  state.settings.hours = Array.isArray(b.openingHours) ? b.openingHours : []
  state.settings.mapLink = str(b.googleMapLink)

  const phone = str(b.phone)
  const wa = str(b.whatsappHref) || str(b.socialLinks?.whatsapp)
  state.functionality = {
    call: Boolean(phone),
    whatsapp: Boolean(wa),
    enquiry: true,
    email: Boolean(str(b.contactEmail)),
    directions: hasMap,
    social: hasSocial,
  }

  const origin = getPublicSiteOrigin()
  const canonical = b.publicId ? `${origin}${PUBLIC_PROFILE_PATH(b.publicId)}` : ''
  const city = str(b.city)
  const category = str(b.category)
  const name = str(b.name)
  const seoTitle = [name, category && city ? `${category} in ${city}` : category].filter(Boolean).join(' | ')
  const seoDesc = str(b.description).slice(0, 160)
  state.seo = {
    title: seoTitle,
    description: seoDesc,
    canonical,
    robots: 'index,follow',
    ogTitle: seoTitle,
    ogDescription: seoDesc,
    ogImage: str(landing.bannerImageUrl) || str(b.logo),
    structuredDataType: structuredDataTypeForCategory(category),
  }

  const assets = []
  if (str(b.logo)) assets.push({ role: 'logo', url: str(b.logo), publicId: str(b.logoPublicId) })
  if (str(landing.bannerImageUrl)) {
    assets.push({ role: 'hero', url: str(landing.bannerImageUrl), publicId: str(landing.bannerImagePublicId) })
  }
  for (const url of state.content.gallery) assets.push({ role: 'gallery', url })
  state.assetRefs = assets
  return hydrateSectionComponents(state)
}

/** Listing facts without a designed one-page. Used for first open and after memory delete. */
export function freshAiCanvasFromProfile(args) {
  const facts = mapProfileToWebsiteState(args)
  const blank = emptyWebsiteState()
  facts.theme = blank.theme
  facts.sectionOrder = []
  facts.sectionVisibility = Object.fromEntries(AI_SECTION_TYPES.map((id) => [id, false]))
  facts.pages = [{ id: 'home', slug: '/', name: 'Home', sections: [] }]
  facts.content = {
    ...facts.content,
    landing: {},
    cta: { title: '', description: '', buttonLabel: '' },
  }
  facts.settings = { ...facts.settings, hasAiDesign: false, alignment: 'left', fromListingTemplate: false }
  return facts
}

export function isDesignedAiDraft(websiteState) {
  return Boolean(
    websiteState?.settings?.hasAiDesign === true ||
      websiteState?.theme?.preset ||
      websiteState?.theme?.look,
  )
}
