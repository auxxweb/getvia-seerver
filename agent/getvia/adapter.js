import { getBusinessProfile as fetchGetviaBusiness } from '../../src/ai-builder/tools/getBusinessProfile.js'
import { normalizeBusinessProfile, emptyBusinessProfile } from './profile.js'

const CACHE_TTL_MS = 30_000
const cache = new Map()

function cacheKey(businessId, ownerId) {
  return `${String(businessId || '')}:${String(ownerId || '')}`
}

export function clearBusinessProfileCache() {
  cache.clear()
}

function str(v) {
  return String(v ?? '').trim()
}

/**
 * Map the GetVia tool payload onto BusinessProfile.
 * Never forwards Mongo `raw`, plan internals, or secret-looking keys.
 */
export function fromGetviaToolResult(payloadIn = {}) {
  const payload = { ...payloadIn }
  delete payload.raw
  const identity = payload.identity || {}
  const location = payload.location || {}
  const contact = payload.contact || {}
  const content = payload.content || {}
  const assets = payload.assets || {}
  const reviews = payload.reviews || {}
  return normalizeBusinessProfile({
    name: identity.name,
    description: identity.description || str(content.landing?.welcomeDescription) || str(content.landing?.bannerDescription),
    logo: identity.logo || assets.logo?.url,
    images: assets.images?.length ? assets.images : content.gallery,
    address: location.formattedAddress || location.address,
    location,
    phone: contact.phone,
    whatsapp: contact.whatsappHref || contact.socialLinks?.whatsapp,
    email: contact.email,
    hours: payload.openingHours,
    socialLinks: contact.socialLinks,
    categories: [identity.category, identity.subcategory],
    services: content.coreServices,
    products: content.catalogue,
    offers: content.offers,
    reviews: reviews.recent,
  })
}

export async function loadBusinessProfile({
  businessId,
  ownerId,
  profile,
  fetchProfile = fetchGetviaBusiness,
  now = Date.now(),
} = {}) {
  if (profile && typeof profile === 'object') {
    const looksNormalized = profile.name !== undefined && Array.isArray(profile.missing) && !profile.identity && !profile.raw
    const normalized = looksNormalized ? normalizeBusinessProfile(profile) : fromGetviaToolResult(profile)
    return { ok: true, profile: normalized, cached: false, source: 'injected' }
  }
  if (!businessId) {
    return {
      ok: false,
      errorType: 'VALIDATION_ERROR',
      message: 'businessId is required.',
      profile: emptyBusinessProfile(),
    }
  }
  if (!ownerId) {
    return {
      ok: false,
      errorType: 'UNAUTHORIZED',
      message: 'Sign in required.',
      profile: emptyBusinessProfile(),
    }
  }
  const key = cacheKey(businessId, ownerId)
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_TTL_MS) {
    return { ok: true, profile: hit.profile, cached: true, source: 'cache' }
  }
  try {
    const payload = await fetchProfile({ businessId, ownerId })
    const normalized = fromGetviaToolResult(payload || {})
    cache.set(key, { at: now, profile: normalized })
    return { ok: true, profile: normalized, cached: false, source: 'getvia' }
  } catch (err) {
    const status = Number(err?.status || err?.statusCode || 0)
    const errorType =
      status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'API_FAILURE'
    return {
      ok: false,
      errorType,
      message: String(err?.message || err || 'Failed to load GetVia business profile.'),
      profile: emptyBusinessProfile(),
    }
  }
}

export { CACHE_TTL_MS }
