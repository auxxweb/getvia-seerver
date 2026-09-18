import { cloneState } from '../state/websiteState.schema.js'
import { AI_SECTION_TYPES } from '../constants.js'

function landing(state) {
  return state.content?.landing || {}
}

export function defaultComponentsFor(sectionType, state) {
  const L = landing(state)
  if (sectionType === 'hero') {
    const comps = [
      { id: 'hero-heading', type: 'heading', props: { text: L.bannerTitle || '' } },
      { id: 'hero-description', type: 'paragraph', props: { text: L.bannerDescription || '' } },
    ]
    if (L.bannerImageUrl) {
      comps.push({ id: 'hero-image', type: 'image', props: { src: L.bannerImageUrl, publicId: L.bannerImagePublicId || '' } })
    }
    comps.push({
      id: 'hero-button-primary',
      type: 'button',
      props: {
        text: L.bannerCtaLabel || 'Get in touch',
        href: L.bannerCtaLink || '#contact',
        variant: 'primary',
        action: { type: 'SCROLL_TO_SECTION', target: String(L.bannerCtaLink || '#contact').replace(/^#/, '') || 'contact' },
      },
    })
    for (const extra of L.extraButtons || []) {
      comps.push({
        id: extra.id || `hero-button-${comps.length}`,
        type: 'button',
        props: { ...extra },
      })
    }
    return comps
  }
  if (sectionType === 'about') {
    return [
      { id: 'about-heading', type: 'heading', props: { text: L.welcomeTitle || '' } },
      { id: 'about-description', type: 'paragraph', props: { text: L.welcomeDescription || '' } },
    ]
  }
  if (sectionType === 'products') {
    return [
      { id: 'products-heading', type: 'heading', props: { text: state.content?.catalogue?.title || 'Products' } },
      { id: 'products-description', type: 'paragraph', props: { text: state.content?.catalogue?.description || '' } },
    ]
  }
  if (sectionType === 'offers') {
    return [
      { id: 'offers-heading', type: 'heading', props: { text: state.content?.offers?.title || 'Offers' } },
      { id: 'offers-description', type: 'paragraph', props: { text: state.content?.offers?.description || '' } },
    ]
  }
  if (sectionType === 'cta') {
    return [
      { id: 'cta-heading', type: 'heading', props: { text: state.content?.cta?.title || 'Ready to talk?' } },
      { id: 'cta-description', type: 'paragraph', props: { text: state.content?.cta?.description || '' } },
      {
        id: 'cta-button',
        type: 'button',
        props: { text: state.content?.cta?.buttonLabel || 'Contact', href: '#contact', variant: 'primary' },
      },
    ]
  }
  if (sectionType === 'reviews') {
    const items = state.content?.reviews?.items || []
    return [
      { id: 'reviews-heading', type: 'heading', props: { text: state.content?.reviews?.title || 'Reviews' } },
      ...items.slice(0, 4).map((row, i) => ({
        id: `reviews-quote-${i}`,
        type: 'paragraph',
        props: { text: row.quote || row.comment || row.text || '' },
      })),
    ]
  }
  if (sectionType === 'faq') {
    const items = state.content?.faq?.items || []
    return [
      { id: 'faq-heading', type: 'heading', props: { text: state.content?.faq?.title || 'Frequently asked questions' } },
      ...items.slice(0, 6).map((row, i) => ({
        id: `faq-item-${i}`,
        type: 'paragraph',
        props: { text: [row.question, row.answer].filter(Boolean).join(' — ') },
      })),
    ]
  }
  return []
}

export function sectionAliases(type) {
  if (type === 'products') return ['new-arrivals', 'new arrivals']
  if (type === 'offers') return ['featured-collections', 'featured collections']
  if (type === 'hero') return ['banner']
  if (type === 'faq') return ['faqs', 'frequently asked questions']
  if (type === 'reviews') return ['testimonials']
  return []
}

export function hydrateSectionComponents(state) {
  const next = cloneState(state || {})
  if (!Array.isArray(next.pages) || !next.pages.length) {
    next.pages = [{ id: 'home', slug: '/', name: 'Home', sections: [] }]
  }
  const page = next.pages[0]
  if (!page.sections) page.sections = []
  const order = Array.isArray(next.sectionOrder) ? next.sectionOrder : [...AI_SECTION_TYPES]
  const existing = new Map((page.sections || []).map((row) => [row.id || row.type, row]))
  page.sections = order.map((type) => {
    const prev = existing.get(type) || existing.get(type)
    const row = {
      id: type,
      type,
      variant: prev?.variant || 'stacked',
      visible: prev?.visible !== false && next.sectionVisibility?.[type] !== false,
      style: { ...(prev?.style || {}) },
      responsive: { ...(prev?.responsive || {}) },
      aliases: prev?.aliases?.length ? prev.aliases : sectionAliases(type),
      components: Array.isArray(prev?.components) && prev.components.length ? prev.components : defaultComponentsFor(type, next),
    }
    return row
  })
  return next
}

export function findPage(state, pageId = 'home') {
  return (state?.pages || []).find((p) => p.id === pageId) || state?.pages?.[0] || null
}

export function findSection(state, sectionId, pageId = 'home') {
  const page = findPage(state, pageId)
  if (!page) return null
  return (
    (page.sections || []).find(
      (s) => s.id === sectionId || s.type === sectionId || (s.aliases || []).includes(sectionId),
    ) || null
  )
}

export function findComponent(state, { pageId = 'home', sectionId, componentId }) {
  const section = findSection(state, sectionId, pageId)
  if (!section) return { page: findPage(state, pageId), section: null, component: null }
  const component = (section.components || []).find((row) => row.id === componentId) || null
  return { page: findPage(state, pageId), section, component }
}

export function listButtons(state, sectionId) {
  const section = findSection(state, sectionId || 'hero')
  return (section?.components || []).filter((row) => row.type === 'button')
}

export function listAllButtons(state) {
  const out = []
  for (const section of state?.pages?.[0]?.sections || []) {
    for (const row of section.components || []) {
      if (row.type === 'button') out.push({ ...row, sectionId: section.id })
    }
  }
  return out
}

export function syncLegacyContent(state) {
  const hero = findSection(state, 'hero')
  if (hero) {
    const heading = (hero.components || []).find((c) => c.type === 'heading')
    const para = (hero.components || []).find((c) => c.type === 'paragraph')
    const buttons = (hero.components || []).filter((c) => c.type === 'button')
    const image = (hero.components || []).find((c) => c.type === 'image')
    state.content.landing = state.content.landing || {}
    if (heading?.props?.text != null) state.content.landing.bannerTitle = heading.props.text
    if (para?.props?.text != null) state.content.landing.bannerDescription = para.props.text
    if (buttons[0]) {
      state.content.landing.bannerCtaLabel = buttons[0].props?.text || state.content.landing.bannerCtaLabel
      state.content.landing.bannerCtaLink = buttons[0].props?.href || state.content.landing.bannerCtaLink
    }
    if (image?.props?.src) state.content.landing.bannerImageUrl = image.props.src
    state.content.landing.extraButtons = buttons.slice(1).map((b) => ({
      id: b.id,
      text: b.props?.text,
      href: b.props?.href,
      variant: b.props?.variant,
      action: b.props?.action,
      background: b.props?.background,
    }))
  }
  const products = findSection(state, 'products')
  const productsHeading = (products?.components || []).find((c) => c.type === 'heading')
  if (productsHeading?.props?.text) {
    state.content.catalogue = { ...(state.content.catalogue || {}), title: productsHeading.props.text }
  }
  const offers = findSection(state, 'offers')
  const offersHeading = (offers?.components || []).find((c) => c.type === 'heading')
  if (offersHeading?.props?.text) {
    state.content.offers = { ...(state.content.offers || {}), title: offersHeading.props.text }
  }
  return state
}

export function syncComponentsFromLegacy(state) {
  const L = state.content?.landing || {}
  const hero = findSection(state, 'hero')
  if (hero) {
    for (const c of hero.components || []) {
      if (c.id === 'hero-heading' && L.bannerTitle != null) c.props = { ...c.props, text: L.bannerTitle }
      if (c.id === 'hero-description' && L.bannerDescription != null) c.props = { ...c.props, text: L.bannerDescription }
      if (c.id === 'hero-button-primary') {
        c.props = {
          ...c.props,
          text: L.bannerCtaLabel || c.props?.text,
          href: L.bannerCtaLink || c.props?.href,
        }
      }
    }
  }
  const products = findSection(state, 'products')
  const pTitle = state.content?.catalogue?.title
  if (products && pTitle) {
    const heading = (products.components || []).find((c) => c.type === 'heading')
    if (heading) heading.props = { ...heading.props, text: pTitle }
  }
  const offers = findSection(state, 'offers')
  const oTitle = state.content?.offers?.title
  if (offers && oTitle) {
    const heading = (offers.components || []).find((c) => c.type === 'heading')
    if (heading) heading.props = { ...heading.props, text: oTitle }
  }
  return state
}
