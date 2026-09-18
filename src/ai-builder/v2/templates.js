export const TEMPLATE_CATEGORIES = [
  'salon',
  'restaurant',
  'cafe',
  'resort',
  'homestay',
  'boutique',
  'real-estate',
  'portfolio',
  'corporate',
  'SaaS',
  'service-business',
]

const TEMPLATES = {
  salon: ['hero', 'about', 'services', 'offers', 'gallery', 'reviews', 'contact', 'footer'],
  restaurant: ['hero', 'about', 'offers', 'gallery', 'reviews', 'contact', 'hours', 'footer'],
  cafe: ['hero', 'about', 'offers', 'gallery', 'contact', 'hours', 'footer'],
  resort: ['hero', 'about', 'gallery', 'offers', 'reviews', 'contact', 'footer'],
  homestay: ['hero', 'about', 'gallery', 'contact', 'footer'],
  boutique: ['hero', 'about', 'products', 'gallery', 'contact', 'footer'],
  'real-estate': ['hero', 'about', 'gallery', 'contact', 'footer'],
  portfolio: ['hero', 'about', 'gallery', 'contact', 'footer'],
  corporate: ['hero', 'about', 'services', 'cta', 'contact', 'footer'],
  SaaS: ['hero', 'about', 'services', 'cta', 'contact', 'footer'],
  'service-business': ['hero', 'about', 'services', 'reviews', 'contact', 'footer'],
}

export function inferTemplateCategory(prompt, profile) {
  const text = `${prompt || ''} ${profile?.identity?.category || ''}`.toLowerCase()
  if (/salon|spa|beauty|hair/.test(text)) return 'salon'
  if (/restaurant|dining|kitchen/.test(text)) return 'restaurant'
  if (/\bcafe\b|coffee/.test(text)) return 'cafe'
  if (/resort|hotel/.test(text)) return 'resort'
  if (/homestay|bnb|guesthouse/.test(text)) return 'homestay'
  if (/boutique|fashion|apparel/.test(text)) return 'boutique'
  if (/real.?estate|property/.test(text)) return 'real-estate'
  if (/portfolio|photographer/.test(text)) return 'portfolio'
  if (/saas|software/.test(text)) return 'SaaS'
  if (/corporate|agency|consult/.test(text)) return 'corporate'
  return 'service-business'
}

export function sectionsForTemplate(category) {
  return [...(TEMPLATES[category] || TEMPLATES['service-business'])]
}

export function composeTemplate(category, extra = []) {
  const base = sectionsForTemplate(category)
  for (const id of extra) {
    if (id && !base.includes(id)) {
      const contactAt = base.indexOf('contact')
      base.splice(contactAt >= 0 ? contactAt : base.length, 0, id)
    }
  }
  return base
}
