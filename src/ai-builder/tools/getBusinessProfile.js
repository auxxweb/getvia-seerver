import { Business } from '../../models/Business.js'
import { Review } from '../../models/Review.js'
import { getBusinessDetailBundle } from '../../services/businessProfileMutations.js'
import { getPlanUsageSummary } from '../../services/planEntitlements.service.js'
import { HttpError } from '../../middleware/errorHandler.js'
import { PUBLIC_PROFILE_PATH, getPublicSiteOrigin } from '../constants.js'

function str(v) {
  return String(v ?? '').trim()
}

function missingFrom(business, content) {
  const b = business || {}
  const c = content || {}
  const landing = c.landingSection || {}
  const social = b.socialLinks || {}
  const missing = []
  if (!str(b.logo)) missing.push('logo')
  if (!str(b.name)) missing.push('name')
  if (!str(b.phone)) missing.push('phone')
  if (!str(b.contactEmail)) missing.push('email')
  if (!str(b.whatsappHref) && !str(social.whatsapp)) missing.push('whatsapp')
  if (!str(b.description)) missing.push('description')
  if (!str(landing.bannerTitle)) missing.push('landingBannerTitle')
  if (!str(landing.bannerImageUrl)) missing.push('landingBannerImage')
  if (!(c.coreServices || []).some((row) => str(row.title))) missing.push('coreServices')
  if (!(c.catalogue || []).some((row) => str(row.name || row.title))) missing.push('catalogue')
  if (!(c.offers || []).some((row) => str(row.title))) missing.push('offers')
  if (!(c.gallery || []).filter(Boolean).length) missing.push('gallery')
  const hours = Array.isArray(b.openingHours) ? b.openingHours : []
  if (!hours.some((h) => h && !h.closed)) missing.push('openingHours')
  return missing
}

function compactItems(list, fields) {
  return (Array.isArray(list) ? list : []).map((row) => {
    const out = { id: row._id ? String(row._id) : undefined }
    for (const f of fields) out[f] = row[f] || ''
    return out
  })
}

/**
 * Controlled Business Profile tool. Never returns other tenants.
 */
export async function getBusinessProfile({ businessId, ownerId }) {
  if (!businessId) throw new HttpError(400, 'businessId is required')
  const business = await Business.findById(businessId).lean()
  if (!business) throw new HttpError(404, 'Business not found')
  if (ownerId && business.ownerId.toString() !== String(ownerId)) {
    throw new HttpError(403, 'Not your business')
  }
  const bundle = await getBusinessDetailBundle(businessId)
  const b = bundle.business || business
  const content = bundle.content || {}
  const [plan, reviews] = await Promise.all([
    getPlanUsageSummary(businessId),
    Review.find({ businessId }).sort({ createdAt: -1 }).limit(5).select('rating comment createdAt').lean(),
  ])

  const origin = getPublicSiteOrigin()
  const publicUrl = b.publicId ? `${origin}${PUBLIC_PROFILE_PATH(b.publicId)}` : ''

  return {
    businessId: String(b._id),
    publicId: b.publicId,
    publicUrl,
    identity: {
      name: str(b.name),
      category: str(b.category),
      subcategory: str(b.subcategory),
      description: str(b.description),
      logo: str(b.logo),
      logoPublicId: str(b.logoPublicId),
    },
    location: {
      address: str(b.address),
      formattedAddress: str(b.formattedAddress),
      city: str(b.city),
      state: str(b.state),
      country: str(b.country),
      mapLink: str(b.googleMapLink) || str(b.mapLocation?.googleMapLink),
      coordinates: b.mapLocation?.coordinates || null,
    },
    contact: {
      phone: str(b.phone),
      email: str(b.contactEmail),
      contactName: str(b.contactName),
      whatsappHref: str(b.whatsappHref),
      socialLinks: b.socialLinks || {},
    },
    openingHours: b.openingHours || [],
    theme: {
      template: null,
      primaryColor: '',
      secondaryColor: '',
      themeColorPresets: {},
    },
    plan: {
      planName: plan.planName,
      allowedTemplateIds: plan.allowedTemplateIds,
      galleryLimit: plan.usage?.galleryLimit,
      galleryCount: plan.usage?.galleryCount,
      aiRemaining: plan.usage?.aiPromptsRemaining,
      aiLimit: plan.usage?.aiPromptsLimit,
    },
    content: {
      landing: content.landingSection || {},
      offersTitle: content.offersPageTitle || '',
      offersDescription: content.offersPageDescription || '',
      offers: compactItems(content.offers, [
        'title',
        'description',
        'image',
        'imagePublicId',
        'priceActual',
        'priceOffer',
        'link',
        'linkLabel',
      ]),
      corePageTitle: content.corePageTitle || '',
      corePageDescription: content.corePageDescription || '',
      coreServices: compactItems(content.coreServices, [
        'title',
        'description',
        'imageUrl',
        'imagePublicId',
        'links',
        'linkLabel',
      ]),
      productsPageTitle: content.productsPageTitle || '',
      productsPageDescription: content.productsPageDescription || '',
      catalogue: compactItems(content.catalogue, [
        'name',
        'description',
        'image',
        'imagePublicId',
        'price',
        'link',
        'linkLabel',
      ]),
      gallery: (content.gallery || []).filter(Boolean),
      feed: compactItems(content.profileFeed, ['title', 'description', 'image', 'imagePublicId', 'link']),
    },
    reviews: {
      ratingAvg: b.ratingAvg || 0,
      reviewCount: b.reviewCount || 0,
      recent: reviews.map((r) => ({ rating: r.rating, comment: str(r.comment).slice(0, 240) })),
    },
    assets: {
      logo: { url: str(b.logo), publicId: str(b.logoPublicId) },
      images: [
        str(content.landingSection?.bannerImageUrl),
        str(content.landingSection?.welcomeImageUrl),
        ...compactItems(content.coreServices, ['imageUrl']).map((x) => x.imageUrl),
        ...compactItems(content.catalogue, ['image']).map((x) => x.image),
        ...compactItems(content.offers, ['image']).map((x) => x.image),
        ...(content.gallery || []),
      ].filter(Boolean),
    },
    missing: missingFrom(b, content),
    raw: { business: b, content },
  }
}
