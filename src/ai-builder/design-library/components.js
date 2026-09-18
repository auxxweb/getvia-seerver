/**
 * Component structure variants — 100+ layouts the agent may compose.
 * IDs are stable tokens for Design DNA / coding briefs.
 */

function rows(section, variants) {
  return variants.map((v) => ({ section, ...v }))
}

export const COMPONENT_VARIANTS = Object.freeze([
  ...rows('hero', [
    { id: 'hero-full-bleed', label: 'Full-bleed media hero', structure: 'edge-to-edge image/video plane + overlay type + CTA' },
    { id: 'hero-split', label: 'Split hero', structure: 'two columns: copy | media' },
    { id: 'hero-soft-split', label: 'Soft split', structure: 'rounded media panel + warm typography' },
    { id: 'hero-editorial', label: 'Editorial hero', structure: 'large display type, ruled deck, print-like crop' },
    { id: 'hero-typography-first', label: 'Typography-first', structure: 'oversized headline, minimal media' },
    { id: 'hero-centered-void', label: 'Centered void', structure: 'centered brand + one line + one CTA, vast whitespace' },
    { id: 'hero-asymmetric', label: 'Asymmetric hero', structure: 'offset columns, broken baseline' },
    { id: 'hero-card-overlay', label: 'Card overlay', structure: 'media background with floating content card' },
    { id: 'hero-bento', label: 'Bento hero', structure: 'multi-cell opening grid with brand + CTAs + teaser media' },
    { id: 'hero-one-line', label: 'One-line hero', structure: 'single statement + text link CTA' },
    { id: 'hero-immersive-stage', label: 'Immersive stage', structure: 'viewport-height stage, sparse chrome' },
    { id: 'hero-magazine', label: 'Magazine cover', structure: 'masthead + cover story + kicker' },
    { id: 'hero-portrait-editorial', label: 'Portrait editorial', structure: 'tall portrait crop + serif headline' },
    { id: 'hero-clinical', label: 'Clinical hero', structure: 'calm split, trust strip, clear services CTA' },
    { id: 'hero-trust-band', label: 'Trust-band hero', structure: 'headline + proof row (hours/location/reviews)' },
    { id: 'hero-industrial', label: 'Industrial hero', structure: 'hard type, high contrast, photo of craft/trade' },
    { id: 'hero-product-ui', label: 'Product UI hero', structure: 'product frame + value prop + primary action' },
    { id: 'hero-lookbook', label: 'Lookbook hero', structure: 'fashion crop + collection CTA' },
    { id: 'hero-split-menu', label: 'Split menu hero', structure: 'dish photo + short menu teaser' },
  ]),
  ...rows('nav', [
    { id: 'nav-minimal', label: 'Minimal nav', structure: 'wordmark + few links + one CTA' },
    { id: 'nav-sticky-transparent', label: 'Sticky transparent', structure: 'over hero, solidifies on scroll' },
    { id: 'nav-centered', label: 'Centered nav', structure: 'logo center, links split' },
    { id: 'nav-utility', label: 'Utility nav', structure: 'call/WhatsApp always visible' },
    { id: 'nav-pill', label: 'Pill header', structure: 'floating rounded bar' },
    { id: 'nav-left-rail', label: 'Left rail', structure: 'desktop side navigation' },
  ]),
  ...rows('about', [
    { id: 'about-split', label: 'About split', structure: 'story + image' },
    { id: 'about-asymmetric', label: 'About asymmetric', structure: 'offset text block + media' },
    { id: 'about-centered', label: 'About centered', structure: 'narrow measure, centered' },
    { id: 'about-editorial', label: 'About editorial', structure: 'drop cap / pull quote energy' },
    { id: 'about-timeline', label: 'About timeline', structure: 'milestones vertical' },
    { id: 'about-stats-band', label: 'About + stats', structure: 'short story + metric strip (only if real data)' },
    { id: 'about-image-bleed', label: 'About image bleed', structure: 'full-width media then copy' },
    { id: 'about-quote-led', label: 'Quote-led about', structure: 'owner quote then supporting copy' },
  ]),
  ...rows('services', [
    { id: 'services-grid-3', label: '3-up cards', structure: 'responsive card grid' },
    { id: 'services-list', label: 'Service list', structure: 'stacked rows with name + detail' },
    { id: 'services-editorial', label: 'Editorial services', structure: 'long-form blocks, not identical cards' },
    { id: 'services-bento', label: 'Bento services', structure: 'uneven cells' },
    { id: 'services-minimal-rows', label: 'Minimal rows', structure: 'hairline list' },
    { id: 'services-soft-cards', label: 'Soft cards', structure: 'rounded elevated cards' },
    { id: 'services-numbered', label: 'Numbered services', structure: '01 02 03 sequence' },
    { id: 'services-icon-rail', label: 'Icon rail', structure: 'icon + title + short line' },
    { id: 'services-list-luxury', label: 'Luxury list', structure: 'serif titles, quiet dividers' },
    { id: 'services-lookbook-grid', label: 'Lookbook grid', structure: 'image-led service tiles' },
    { id: 'services-menu-cards', label: 'Menu cards', structure: 'dish/item cards with price if provided' },
    { id: 'services-featured-plates', label: 'Featured plates', structure: 'large featured + supporting list' },
    { id: 'services-amenity-grid', label: 'Amenity grid', structure: 'hotel/travel amenity tiles' },
    { id: 'services-feature-grid', label: 'Feature grid', structure: 'product/feature tiles' },
    { id: 'services-property-cards', label: 'Property cards', structure: 'listing-style cards' },
  ]),
  ...rows('products', [
    { id: 'products-grid', label: 'Product grid', structure: 'catalogue grid' },
    { id: 'products-editorial', label: 'Editorial products', structure: 'featured + rail' },
    { id: 'products-minimal', label: 'Minimal products', structure: 'name + image rows' },
    { id: 'products-masonry', label: 'Masonry products', structure: 'uneven image mosaic' },
    { id: 'products-carousel', label: 'Product strip', structure: 'horizontal scroll on mobile' },
  ]),
  ...rows('offers', [
    { id: 'offers-featured', label: 'Featured offer', structure: 'one large promo + support' },
    { id: 'offers-grid', label: 'Offers grid', structure: 'equal promo cards' },
    { id: 'offers-banner', label: 'Offer banner', structure: 'full-width promo band' },
    { id: 'offers-ticket', label: 'Ticket style', structure: 'coupon-like modules' },
  ]),
  ...rows('gallery', [
    { id: 'gallery-grid', label: 'Uniform grid', structure: 'equal tiles' },
    { id: 'gallery-masonry', label: 'Masonry', structure: 'varied heights' },
    { id: 'gallery-editorial', label: 'Editorial gallery', structure: 'captioned plates' },
    { id: 'gallery-featured', label: 'Featured + thumbs', structure: 'hero image + strip' },
    { id: 'gallery-slider', label: 'Slider', structure: 'swipeable frames' },
    { id: 'gallery-immersive', label: 'Immersive gallery', structure: 'full-bleed frames' },
    { id: 'gallery-runway', label: 'Runway', structure: 'tall fashion crops' },
    { id: 'gallery-food-grid', label: 'Food grid', structure: 'appetite-focused crops' },
    { id: 'gallery-full-bleed-strip', label: 'Bleed strip', structure: 'edge-to-edge horizontal band' },
    { id: 'gallery-simple-grid', label: 'Simple grid', structure: 'clean 2–3 column' },
    { id: 'gallery-bento', label: 'Bento gallery', structure: 'mixed cell sizes' },
    { id: 'gallery-before-after', label: 'Before/after', structure: 'paired comparisons when data supports' },
  ]),
  ...rows('testimonials', [
    { id: 'testimonials-quotes', label: 'Large quotes', structure: 'serif pull quotes' },
    { id: 'testimonials-cards', label: 'Testimonial cards', structure: 'avatar optional, no inventing' },
    { id: 'testimonials-ticker', label: 'Ticker', structure: 'horizontal quote strip' },
    { id: 'testimonials-single', label: 'Single featured', structure: 'one strong review' },
  ]),
  ...rows('reviews', [
    { id: 'reviews-list', label: 'Reviews list', structure: 'stacked reviews from GetVia' },
    { id: 'reviews-grid', label: 'Reviews grid', structure: 'card grid' },
    { id: 'reviews-rating-band', label: 'Rating band', structure: 'summary + samples' },
  ]),
  ...rows('feed', [
    { id: 'feed-cards', label: 'Feed cards', structure: 'profile updates as cards' },
    { id: 'feed-timeline', label: 'Feed timeline', structure: 'vertical timeline' },
    { id: 'feed-compact', label: 'Compact feed', structure: 'dense list' },
  ]),
  ...rows('contact', [
    { id: 'contact-split-form', label: 'Split form', structure: 'form + details' },
    { id: 'contact-centered', label: 'Centered contact', structure: 'form focused' },
    { id: 'contact-actions-first', label: 'Actions first', structure: 'WhatsApp/call dominant + form secondary' },
    { id: 'contact-map-adjacent', label: 'Map adjacent', structure: 'form beside map block' },
  ]),
  ...rows('location', [
    { id: 'location-map-card', label: 'Map card', structure: 'map + address + directions' },
    { id: 'location-split', label: 'Location split', structure: 'details | map' },
    { id: 'location-minimal', label: 'Minimal location', structure: 'address + link only' },
  ]),
  ...rows('hours', [
    { id: 'hours-table', label: 'Hours table', structure: 'day rows' },
    { id: 'hours-compact', label: 'Compact hours', structure: 'inline summary' },
    { id: 'hours-band', label: 'Hours band', structure: 'full-width info band' },
  ]),
  ...rows('cta', [
    { id: 'cta-end-band', label: 'End band', structure: 'full-width closing CTA' },
    { id: 'cta-split', label: 'CTA split', structure: 'message + actions' },
    { id: 'cta-minimal-link', label: 'Minimal CTA', structure: 'text links only' },
  ]),
  ...rows('footer', [
    { id: 'footer-colophon', label: 'Colophon', structure: 'editorial footer' },
    { id: 'footer-columns', label: 'Multi-column', structure: 'links + contact' },
    { id: 'footer-minimal', label: 'Minimal footer', structure: 'one line' },
    { id: 'footer-dark-band', label: 'Dark band', structure: 'high-contrast endcap' },
    { id: 'footer-warm-band', label: 'Warm band', structure: 'soft luxury endcap' },
  ]),
  ...rows('faq', [
    { id: 'faq-accordion', label: 'Accordion FAQ', structure: 'expandable items' },
    { id: 'faq-two-column', label: 'Two-column FAQ', structure: 'desktop split list' },
    { id: 'faq-stacked', label: 'Stacked FAQ', structure: 'simple Q/A blocks' },
  ]),
  ...rows('social', [
    { id: 'social-icon-row', label: 'Social icon row', structure: 'icon links from GetVia socials' },
    { id: 'social-card', label: 'Social card', structure: 'handles in a quiet card' },
  ]),
])

export const COMPONENT_VARIANT_COUNT = COMPONENT_VARIANTS.length

export function variantsForSection(sectionId) {
  return COMPONENT_VARIANTS.filter((v) => v.section === sectionId)
}

export function variantById(id) {
  return COMPONENT_VARIANTS.find((v) => v.id === id) || null
}

export function formatComponentPlan(components = {}) {
  const lines = Object.entries(components)
    .map(([section, id]) => {
      const row = variantById(id)
      return row ? `- ${section}: ${row.id} (${row.label}) — ${row.structure}` : null
    })
    .filter(Boolean)
  if (!lines.length) return ''
  return ['COMPONENT STRUCTURE PLAN:', ...lines].join('\n')
}
