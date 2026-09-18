const EMPTY_SOCIAL = Object.freeze({
  instagram: '',
  facebook: '',
  youtube: '',
  twitter: '',
  website: '',
  whatsapp: '',
})

export function emptyBusinessProfile() {
  return {
    name: '',
    description: '',
    logo: '',
    images: [],
    address: '',
    location: { city: '', state: '', country: '', mapLink: '', coordinates: null },
    phone: '',
    whatsapp: '',
    email: '',
    hours: '',
    socialLinks: { ...EMPTY_SOCIAL },
    categories: [],
    services: [],
    products: [],
    offers: [],
    reviews: [],
    missing: [],
    placeholders: [],
  }
}

function str(v) {
  return String(v ?? '').trim()
}

function item(row = {}, nameKeys = ['name', 'title']) {
  const name = nameKeys.map((k) => str(row[k])).find(Boolean) || ''
  const description = str(row.description || row.body)
  const image = str(row.image || row.imageUrl || row.src)
  if (!name && !description && !image) return null
  const out = {}
  if (name) out.name = name
  if (description) out.description = description
  if (image) out.image = image
  if (str(row.price || row.priceOffer || row.priceActual)) out.price = str(row.price || row.priceOffer || row.priceActual)
  return out
}

function compactList(list, nameKeys) {
  return (Array.isArray(list) ? list : []).map((row) => item(row, nameKeys)).filter(Boolean)
}

function socialFrom(raw = {}) {
  const out = {}
  for (const key of Object.keys(EMPTY_SOCIAL)) {
    const value = str(raw[key] || raw[`${key}Url`] || raw[`${key}Href`])
    if (value) out[key] = value
  }
  return out
}

function formatHours(hours) {
  if (typeof hours === 'string' && str(hours)) return str(hours)
  const rows = Array.isArray(hours) ? hours : []
  const open = rows.filter((h) => h && !h.closed && (str(h.open) || str(h.opens)))
  if (!open.length) return ''
  return open
    .map((h) => {
      const day = str(h.day || h.label)
      const start = str(h.open || h.opens)
      const end = str(h.close || h.closes)
      if (!day) return start && end ? `${start}–${end}` : ''
      if (start && end) return `${day}: ${start}–${end}`
      return day
    })
    .filter(Boolean)
    .join(' · ')
}

function firstImage(images, logo) {
  const list = (Array.isArray(images) ? images : []).map((x) => (typeof x === 'string' ? str(x) : str(x?.url || x?.src))).filter(Boolean)
  if (str(logo)) list.unshift(str(logo))
  return [...new Set(list)]
}

export function normalizeBusinessProfile(input = {}) {
  const name = str(input.name)
  const description = str(input.description)
  const logo = str(input.logo)
  const images = firstImage(input.images, '')
  const address = str(input.address)
  const loc = input.location && typeof input.location === 'object' ? input.location : {}
  const phone = str(input.phone)
  const whatsapp = str(input.whatsapp || input.whatsappHref)
  const email = str(input.email)
  const hours = formatHours(input.hours || input.openingHours)
  const socialLinks = socialFrom(input.socialLinks)
  if (whatsapp && !socialLinks.whatsapp) socialLinks.whatsapp = whatsapp
  const categories = [...new Set((Array.isArray(input.categories) ? input.categories : [input.category, input.subcategory]).map(str).filter(Boolean))]
  const services = compactList(input.services, ['name', 'title'])
  const products = compactList(input.products, ['name', 'title'])
  const offers = compactList(input.offers, ['name', 'title'])
  const reviews = (Array.isArray(input.reviews) ? input.reviews : [])
    .map((row) => {
      const quote = str(row.quote || row.comment || row.description)
      const rating = Number(row.rating)
      if (!quote && !rating) return null
      const entry = {}
      if (str(row.name)) entry.name = str(row.name)
      if (quote) entry.quote = quote
      if (Number.isFinite(rating) && rating > 0) entry.rating = rating
      return entry
    })
    .filter(Boolean)

  const missing = []
  if (!name) missing.push('name')
  if (!description) missing.push('description')
  if (!logo) missing.push('logo')
  if (!images.length) missing.push('images')
  if (!address) missing.push('address')
  if (!phone) missing.push('phone')
  if (!whatsapp) missing.push('whatsapp')
  if (!email) missing.push('email')
  if (!hours) missing.push('hours')
  if (!Object.keys(socialLinks).length) missing.push('socialLinks')
  if (!str(loc.city) && !str(loc.state) && !str(loc.country) && !loc.coordinates) missing.push('location')
  if (!categories.length) missing.push('categories')
  if (!services.length) missing.push('services')
  if (!products.length) missing.push('products')
  if (!offers.length) missing.push('offers')
  if (!reviews.length) missing.push('reviews')

  const placeholders = missing.map((field) => ({
    field,
    source: 'getvia',
    message: `Add ${field} in your GetVia listing to show it on the website.`,
  }))

  return {
    name,
    description,
    logo,
    images,
    address,
    location: {
      city: str(loc.city),
      state: str(loc.state),
      country: str(loc.country),
      mapLink: str(loc.mapLink || loc.googleMapLink),
      coordinates: loc.coordinates || null,
    },
    phone,
    whatsapp,
    email,
    hours,
    socialLinks,
    categories,
    services,
    products,
    offers,
    reviews,
    missing,
    placeholders,
  }
}

export function hasFact(profile, field) {
  const value = profile?.[field]
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === 'object') return Object.values(value).some((v) => (Array.isArray(v) ? v.length : str(v)))
  return Boolean(str(value))
}
