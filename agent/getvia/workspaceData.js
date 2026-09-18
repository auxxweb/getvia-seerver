import { hasFact } from './profile.js'

export function sectionsFromProfile(profile) {
  const sections = ['hero']
  if (hasFact(profile, 'description')) sections.push('about')
  if (hasFact(profile, 'services')) sections.push('services')
  if (hasFact(profile, 'products')) sections.push('products')
  if (hasFact(profile, 'offers')) sections.push('offers')
  if ((profile.images || []).length > 0) sections.push('gallery')
  if (hasFact(profile, 'reviews')) sections.push('reviews')
  if (hasFact(profile, 'hours')) sections.push('hours')
  if (hasFact(profile, 'phone') || hasFact(profile, 'email') || hasFact(profile, 'address') || hasFact(profile, 'whatsapp')) {
    sections.push('contact')
  }
  sections.push('footer')
  return sections
}

export function businessJsonFromProfile(profile) {
  const heroTitle = profile.name || ''
  const cta = hasFact(profile, 'phone') || hasFact(profile, 'whatsapp') || hasFact(profile, 'email')
    ? { label: 'Get in touch', href: hasFact(profile, 'whatsapp') ? profile.whatsapp : '#contact' }
    : null
  const json = {
    name: profile.name,
    description: profile.description || undefined,
    logo: profile.logo || undefined,
    gallery: profile.images || [],
    address: profile.address || undefined,
    location: profile.location,
    phone: profile.phone || undefined,
    whatsapp: profile.whatsapp || undefined,
    email: profile.email || undefined,
    hours: profile.hours || undefined,
    socialLinks: Object.keys(profile.socialLinks || {}).length ? profile.socialLinks : undefined,
    category: profile.categories?.[0] || undefined,
    categories: profile.categories?.length ? profile.categories : undefined,
    services: profile.services?.length ? profile.services : undefined,
    products: profile.products?.length ? profile.products : undefined,
    offers: profile.offers?.length ? profile.offers : undefined,
    reviews: profile.reviews?.length
      ? profile.reviews.map((row) => ({
          name: row.name || undefined,
          quote: row.quote,
          description: row.quote,
          rating: row.rating,
        }))
      : undefined,
    about: profile.description ? { title: profile.name ? `About ${profile.name}` : 'About', body: profile.description } : undefined,
    hero: {
      title: heroTitle,
      subtitle: profile.description || undefined,
      image: profile.images?.[0] || profile.logo || undefined,
      primaryCta: cta || undefined,
    },
    sections: sectionsFromProfile(profile),
    placeholders: profile.placeholders,
  }
  return JSON.parse(JSON.stringify(json))
}

export function assertNoFabrication(profile, json) {
  const issues = []
  if (!profile.phone && json.phone) issues.push('phone')
  if (!profile.whatsapp && json.whatsapp) issues.push('whatsapp')
  if (!profile.address && json.address) issues.push('address')
  if (!profile.hours && json.hours) issues.push('hours')
  if (!profile.reviews?.length && json.reviews?.length) issues.push('reviews')
  if (!profile.products?.length && json.products?.length) issues.push('products')
  if (!profile.offers?.length && json.offers?.length) issues.push('offers')
  return { ok: issues.length === 0, issues }
}
