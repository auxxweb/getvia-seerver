import { Business } from '../models/Business.js'
import { BusinessContent } from '../models/BusinessContent.js'
import { User } from '../models/User.js'
import { HttpError } from '../middleware/errorHandler.js'
import { sanitizeBusinessGeoFields } from './businessGeoSanitize.js'
import {
  collectBusinessContentPublicIds,
  collectBusinessPublicIds,
  destroyCloudinaryPublicIds,
  publicIdsToDelete,
} from '../../services/cloudinaryCleanup.service.js'

export function normalizePointLocation(raw) {
  if (!raw || typeof raw !== 'object') return undefined
  if (raw.type !== 'Point') return undefined
  const c = raw.coordinates
  if (!Array.isArray(c) || c.length !== 2) return undefined
  const lng = Number(c[0])
  const lat = Number(c[1])
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return undefined
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return undefined
  return { type: 'Point', coordinates: [lng, lat] }
}

export function normalizeMapLocation(raw) {
  if (!raw || typeof raw !== 'object') return undefined
  const lat = Number(raw?.coordinates?.lat)
  const lng = Number(raw?.coordinates?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return undefined

  const formattedAddress = String(raw.formattedAddress || '').trim()
  const placeId = String(raw.placeId || '').trim()
  const googleMapLink = String(raw.googleMapLink || '').trim()

  return {
    formattedAddress,
    placeId,
    googleMapLink: googleMapLink || `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`,
    coordinates: { lat, lng },
    geoPoint: { type: 'Point', coordinates: [lng, lat] },
  }
}

function countWords(text) {
  const t = String(text || '').trim()
  if (!t) return 0
  return t.split(/\s+/).length
}

const LANDING_WORD_LIMITS = {
  bannerTitle: 8,
  bannerDescription: 50,
  welcomeTitle: 8,
  welcomeDescription: 50,
}

function validateLandingSectionPatch(patch) {
  if (!patch || typeof patch !== 'object') return
  for (const [key, max] of Object.entries(LANDING_WORD_LIMITS)) {
    if (patch[key] === undefined) continue
    const val = String(patch[key] || '').trim()
    if (!val) continue
    if (countWords(val) > max) {
      throw new HttpError(400, `${key} must be ${max} words or fewer`)
    }
  }
}

const OFFERS_PAGE_WORD_LIMITS = {
  offersPageTitle: 8,
  offersPageDescription: 50,
}

function validateOffersContentPatch(patch) {
  if (!patch || typeof patch !== 'object') return
  for (const [key, max] of Object.entries(OFFERS_PAGE_WORD_LIMITS)) {
    if (patch[key] === undefined) continue
    const val = String(patch[key] || '').trim()
    if (!val) continue
    if (countWords(val) > max) {
      throw new HttpError(400, `${key} must be ${max} words or fewer`)
    }
  }
  if (!Array.isArray(patch.offers)) return
  for (const offer of patch.offers) {
    if (!offer || typeof offer !== 'object') continue
    if (offer.title !== undefined) {
      const val = String(offer.title || '').trim()
      if (val && countWords(val) > 8) {
        throw new HttpError(400, 'offer title must be 8 words or fewer')
      }
    }
    if (offer.description !== undefined) {
      const val = String(offer.description || '').trim()
      if (val && countWords(val) > 50) {
        throw new HttpError(400, 'offer description must be 50 words or fewer')
      }
    }
  }
}

const CORE_PAGE_WORD_LIMITS = {
  corePageTitle: 8,
  corePageDescription: 50,
}

function validateCoreContentPatch(patch) {
  if (!patch || typeof patch !== 'object') return
  for (const [key, max] of Object.entries(CORE_PAGE_WORD_LIMITS)) {
    if (patch[key] === undefined) continue
    const val = String(patch[key] || '').trim()
    if (!val) continue
    if (countWords(val) > max) {
      throw new HttpError(400, `${key} must be ${max} words or fewer`)
    }
  }
  if (!Array.isArray(patch.coreServices)) return
  for (const service of patch.coreServices) {
    if (!service || typeof service !== 'object') continue
    if (service.title !== undefined) {
      const val = String(service.title || '').trim()
      if (val && countWords(val) > 8) {
        throw new HttpError(400, 'core service title must be 8 words or fewer')
      }
    }
    if (service.description !== undefined) {
      const val = String(service.description || '').trim()
      if (val && countWords(val) > 50) {
        throw new HttpError(400, 'core service description must be 50 words or fewer')
      }
    }
  }
}

const PRODUCTS_PAGE_WORD_LIMITS = {
  productsPageTitle: 8,
  productsPageDescription: 50,
}

function validateProductsContentPatch(patch) {
  if (!patch || typeof patch !== 'object') return
  for (const [key, max] of Object.entries(PRODUCTS_PAGE_WORD_LIMITS)) {
    if (patch[key] === undefined) continue
    const val = String(patch[key] || '').trim()
    if (!val) continue
    if (countWords(val) > max) {
      throw new HttpError(400, `${key} must be ${max} words or fewer`)
    }
  }
  if (!Array.isArray(patch.catalogue)) return
  for (const item of patch.catalogue) {
    if (!item || typeof item !== 'object') continue
    if (item.name !== undefined) {
      const val = String(item.name || '').trim()
      if (val && countWords(val) > 8) {
        throw new HttpError(400, 'catalogue item title must be 8 words or fewer')
      }
    }
    if (item.description !== undefined) {
      const val = String(item.description || '').trim()
      if (val && countWords(val) > 50) {
        throw new HttpError(400, 'catalogue item description must be 50 words or fewer')
      }
    }
  }
}

const BUSINESS_UPDATE_KEYS = [
  'name',
  'logo',
  'logoPublicId',
  'category',
  'subcategory',
  'categoryId',
  'address',
  'formattedAddress',
  'city',
  'state',
  'country',
  'postalCode',
  'landmark',
  'placeId',
  'googleMapLink',
  'location',
  'mapLocation',
  'openingHours',
  'description',
  'socialLinks',
  'phone',
  'contactName',
  'contactEmail',
  'whatsappHref',
  'themeSettings',
]

export async function applyBusinessUpdate(business, body) {
  if (body.description !== undefined) {
    const description = String(body.description || '').trim()
    if (description && countWords(description) > 50) {
      throw new HttpError(400, 'description must be 50 words or fewer')
    }
  }

  const prevLogoId = business.logoPublicId
  for (const k of BUSINESS_UPDATE_KEYS) {
    if (body[k] === undefined) continue
    if (k === 'location') {
      if (body.location === null || body.location === undefined) {
        business.location = undefined
      } else {
        const loc = normalizePointLocation(body.location)
        business.location = loc || undefined
      }
      continue
    }
    if (k === 'mapLocation') {
      if (body.mapLocation === null || body.mapLocation === undefined) {
        business.mapLocation = undefined
      } else {
        const ml = normalizeMapLocation(body.mapLocation)
        business.mapLocation = ml || undefined
      }
      continue
    }
    if (k === 'themeSettings') {
      const patch = body.themeSettings
      if (patch && typeof patch === 'object') {
        const cur =
          business.themeSettings && typeof business.themeSettings === 'object'
            ? typeof business.themeSettings.toObject === 'function'
              ? business.themeSettings.toObject()
              : { ...business.themeSettings }
            : {}
        business.set('themeSettings', { ...cur, ...patch })
        business.markModified('themeSettings')
      }
      continue
    }
    business[k] = body[k]
  }
  sanitizeBusinessGeoFields(business)
  await business.save()
  if (body.logoPublicId !== undefined) {
    await destroyCloudinaryPublicIds(
      publicIdsToDelete(collectBusinessPublicIds({ logoPublicId: prevLogoId }), collectBusinessPublicIds(business)),
    )
  }
  return business
}

export async function createBusinessForOwner(ownerId, body = {}) {
  const ownerUser = await User.findById(ownerId)
  if (ownerUser?.ownedBusinessId) {
    throw new HttpError(409, 'This account already has a business listing.')
  }

  const publicId =
    body.publicId || `biz-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`.toLowerCase()
  const exists = await Business.findOne({ publicId })
  if (exists) throw new HttpError(409, 'publicId already taken')

  const business = await Business.create({
    ownerId,
    publicId,
    name: body.name || 'New business',
    logo: body.logo || '',
    category: body.category || '',
    subcategory: body.subcategory || '',
    categoryId: body.categoryId || null,
    address: body.address || '',
    formattedAddress: body.formattedAddress || '',
    city: body.city || '',
    state: body.state || '',
    country: body.country || '',
    postalCode: body.postalCode || '',
    landmark: body.landmark || '',
    placeId: body.placeId || '',
    googleMapLink: body.googleMapLink || '',
    openingHours: body.openingHours || [],
    description: body.description || '',
    socialLinks: body.socialLinks || {},
    phone: body.phone || '',
    contactName: body.contactName || '',
    contactEmail: body.contactEmail || '',
    whatsappHref: body.whatsappHref || '',
    themeSettings: body.themeSettings || {},
    approvalStatus: 'PENDING',
  })

  await BusinessContent.create({
    businessId: business._id,
    landingSection: body.landingSection || {},
    welcomeSection: body.welcomeSection || {},
    corePageTitle: body.corePageTitle || '',
    corePageDescription: body.corePageDescription || '',
    productsPageTitle: body.productsPageTitle || '',
    productsPageDescription: body.productsPageDescription || '',
    offers: body.offers || [],
    coreServices: body.coreServices || [],
    catalogue: body.catalogue || [],
    profileFeed: body.profileFeed || [],
    feedPageTitle: body.feedPageTitle || '',
    feedPageDescription: body.feedPageDescription || '',
    gallery: body.gallery || [],
  })

  const loc = normalizePointLocation(body.location)
  const ml = normalizeMapLocation(body.mapLocation)
  if (loc) business.location = loc
  if (ml) business.mapLocation = ml
  sanitizeBusinessGeoFields(business)
  if (business.isModified()) await business.save()

  await User.findByIdAndUpdate(ownerId, { ownedBusinessId: business._id })
  return business
}

export async function getBusinessDetailBundle(businessId, options = {}) {
  const business = await Business.findById(businessId).populate('planId').lean()
  if (!business) throw new HttpError(404, 'Business not found')
  const content = await BusinessContent.findOne({ businessId }).lean()
  const { prepareBusinessMediaForResponse } = await import('./legacyImageUrls.service.js')
  return prepareBusinessMediaForResponse(
    businessId,
    { business, content: content || null },
    options.apiOrigin,
  )
}

export async function applyBusinessContentUpdate(businessId, patch) {
  let content = await BusinessContent.findOne({ businessId })
  if (!content) {
    content = await BusinessContent.create({ businessId })
  }
  const beforeIds = collectBusinessContentPublicIds(
    typeof content.toObject === 'function' ? content.toObject() : content,
  )
  const mergeObj = (key) => {
    if (patch[key] === undefined) return
    const cur = content.get(key)
    const plain = cur && typeof cur.toObject === 'function' ? cur.toObject() : cur || {}
    content.set(key, { ...plain, ...patch[key] })
  }
  if (patch.landingSection !== undefined) {
    validateLandingSectionPatch(patch.landingSection)
  }
  validateOffersContentPatch(patch)
  validateCoreContentPatch(patch)
  validateProductsContentPatch(patch)
  mergeObj('landingSection')
  mergeObj('welcomeSection')
  if (patch.offers !== undefined) content.offers = patch.offers
  if (patch.coreServices !== undefined) content.coreServices = patch.coreServices
  if (patch.catalogue !== undefined) content.catalogue = patch.catalogue
  if (patch.gallery !== undefined) content.gallery = patch.gallery
  if (patch.corePageTitle !== undefined) content.corePageTitle = patch.corePageTitle
  if (patch.corePageDescription !== undefined) content.corePageDescription = patch.corePageDescription
  if (patch.productsPageTitle !== undefined) content.productsPageTitle = patch.productsPageTitle
  if (patch.productsPageDescription !== undefined) {
    content.productsPageDescription = patch.productsPageDescription
  }
  if (patch.offersPageTitle !== undefined) content.offersPageTitle = patch.offersPageTitle
  if (patch.offersPageDescription !== undefined) {
    content.offersPageDescription = patch.offersPageDescription
  }
  if (patch.profileFeed !== undefined) content.profileFeed = patch.profileFeed
  if (patch.feedPageTitle !== undefined) content.feedPageTitle = patch.feedPageTitle
  if (patch.feedPageDescription !== undefined) {
    content.feedPageDescription = patch.feedPageDescription
  }
  await content.save()
  const afterIds = collectBusinessContentPublicIds(content.toObject())
  await destroyCloudinaryPublicIds(publicIdsToDelete(beforeIds, afterIds))
  return content
}

export async function completeBusinessOnboarding(business) {
  business.onboardingCompletedAt = new Date()
  if (business.approvalStatus !== 'REJECTED') {
    business.approvalStatus = 'APPROVED'
  }
  sanitizeBusinessGeoFields(business)
  await business.save()
  return business
}
