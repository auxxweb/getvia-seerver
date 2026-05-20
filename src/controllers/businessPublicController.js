import mongoose from 'mongoose'
import { Business } from '../models/Business.js'
import { BusinessContent } from '../models/BusinessContent.js'
import { Category } from '../models/Category.js'
import { Review } from '../models/Review.js'
import { User } from '../models/User.js'
import { OfferAdBanner } from '../models/OfferAdBanner.js'
import { HttpError } from '../middleware/errorHandler.js'
import { trackEvent } from '../services/analytics.service.js'

function parseFiniteNumber(value) {
  const n = typeof value === 'number' ? value : Number(String(value))
  return Number.isFinite(n) ? n : null
}

function clampNumber(n, min, max) {
  return Math.min(Math.max(n, min), max)
}

async function publicMatch() {
  const blockedOwnerIds = await User.find({ isBlocked: true, role: 'BUSINESS_OWNER' }).distinct('_id')
  return {
    approvalStatus: 'APPROVED',
    ownerId: { $nin: blockedOwnerIds },
  }
}

function isLikelyMongoObjectId(id) {
  return typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id)
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeSubcategory(s) {
  if (typeof s === 'string') {
    return {
      title: s,
      description: '',
      logoUrl: '',
      coverImageUrl: '',
      logoPublicId: '',
      coverImagePublicId: '',
    }
  }
  if (!s || typeof s !== 'object') {
    return {
      title: '',
      description: '',
      logoUrl: '',
      coverImageUrl: '',
      logoPublicId: '',
      coverImagePublicId: '',
    }
  }
  return {
    title: s.title || s.name || '',
    description: s.description || '',
    logoUrl: s.logoUrl || '',
    coverImageUrl: s.coverImageUrl || '',
    logoPublicId: s.logoPublicId || '',
    coverImagePublicId: s.coverImagePublicId || '',
  }
}

export async function listPublicCategories(req, res, next) {
  try {
    const base = await publicMatch()
    const items = await Category.find().sort({ name: 1 }).lean()

    const itemsOut = await Promise.all(
      items.map(async (c) => {
        const nameEsc = escapeRegex(c.name || '')
        const parentOr = {
          $or: [{ categoryId: c._id }, { category: new RegExp(nameEsc, 'i') }],
        }

        const listingCount = await Business.countDocuments({ ...base, ...parentOr })

        const subcategories = await Promise.all(
          (c.subcategories || []).map(async (raw) => {
            const s = normalizeSubcategory(raw)
            const st = (s.title || '').trim()
            let subListingCount = 0
            if (st) {
              subListingCount = await Business.countDocuments({
                ...base,
                $and: [parentOr, { subcategory: new RegExp(escapeRegex(st), 'i') }],
              })
            }
            return { ...s, listingCount: subListingCount }
          }),
        )

        return {
          id: c._id.toString(),
          name: c.name,
          description: c.description || '',
          logoUrl: c.logoUrl || '',
          coverImageUrl: c.coverImageUrl || '',
          icon: c.icon || '',
          iconPublicId: c.iconPublicId || '',
          logoPublicId: c.logoPublicId || '',
          coverImagePublicId: c.coverImagePublicId || '',
          showInDailyNeeds: Boolean(c.showInDailyNeeds),
          listingCount,
          subcategories,
        }
      }),
    )

    res.json({
      ok: true,
      items: itemsOut,
    })
  } catch (e) {
    next(e)
  }
}

export async function searchBusinesses(req, res, next) {
  try {
    const { q, category, categoryId, subcategory, limit = 24, skip = 0 } = req.query

    const base = await publicMatch()
    const extraClauses = []
    if (categoryId && isLikelyMongoObjectId(String(categoryId))) {
      const cat = await Category.findById(String(categoryId)).lean()
      if (cat?.name) {
        const esc = escapeRegex(cat.name)
        extraClauses.push({
          $or: [
            { categoryId: new mongoose.Types.ObjectId(String(categoryId)) },
            { category: new RegExp(esc, 'i') },
          ],
        })
      }
    } else if (category) {
      extraClauses.push({ category: new RegExp(String(category), 'i') })
    }
    if (subcategory) {
      extraClauses.push({
        subcategory: new RegExp(escapeRegex(String(subcategory)), 'i'),
      })
    }

    const qStr = q ? String(q).trim() : ''
    const lim = Math.min(Math.max(Number(limit) || 24, 1), 100)
    const sk = Math.max(Number(skip) || 0, 0)

    const filter = { ...base }
    if (qStr) {
      const and = [{ $text: { $search: qStr } }, ...extraClauses]
      if (and.length === 1) Object.assign(filter, and[0])
      else filter.$and = and
    } else if (extraClauses.length === 1) {
      Object.assign(filter, extraClauses[0])
    } else if (extraClauses.length > 1) {
      filter.$and = extraClauses
    }

    const items = await Business.find(filter)
      .sort({ isFeatured: -1, isTrending: -1, createdAt: -1 })
      .limit(lim)
      .skip(sk)
      .lean()
    res.json({ ok: true, items: items.map((b) => serializeListItem(b)) })
  } catch (e) {
    next(e)
  }
}

export async function getBusinessById(req, res, next) {
  try {
    const { id } = req.params
    const filter = await publicMatch()
    let b =
      (isLikelyMongoObjectId(id) ? await Business.findOne({ _id: id, ...filter }).lean() : null) ||
      (await Business.findOne({ publicId: id, ...filter }).lean())

    // Logged-in owner can open their listing before approval (PENDING), but not if rejected.
    if (!b && req.user) {
      const loose =
        (isLikelyMongoObjectId(id) ? await Business.findById(id).lean() : null) ||
        (await Business.findOne({ publicId: id }).lean())
      if (
        loose &&
        loose.approvalStatus !== 'REJECTED' &&
        loose.ownerId.toString() === req.user._id.toString()
      ) {
        const blockedOwnerIds = await User.find({ isBlocked: true, role: 'BUSINESS_OWNER' }).distinct(
          '_id',
        )
        const ownerBlocked = blockedOwnerIds.some((oid) => oid.toString() === req.user._id.toString())
        if (!ownerBlocked) b = loose
      }
    }

    if (!b) throw new HttpError(404, 'Business not found')

    const content = await BusinessContent.findOne({ businessId: b._id }).lean()
    const reviews = await Review.find({ businessId: b._id })
      .populate('userId', 'name')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()

    await trackEvent(b._id, 'view')

    if (req.user?.role === 'USER') {
      const ownerStr = b.ownerId?.toString?.() ?? ''
      const userStr = req.user._id.toString()
      if (ownerStr !== userStr) {
        await pushRecentlyViewed(req.user._id, b._id)
      }
    }

    res.json({
      ok: true,
      business: serializeDetail(b, content, reviews),
    })
  } catch (e) {
    next(e)
  }
}

export async function trending(req, res, next) {
  try {
    const filter = await publicMatch()
    const items = await Business.find({
      ...filter,
      $or: [{ isTrending: true }, { isFeatured: true }],
    })
      .sort({ isFeatured: -1, isTrending: -1 })
      .limit(12)
      .lean()
    res.json({ ok: true, items: items.map(serializeListItem) })
  } catch (e) {
    next(e)
  }
}

/**
 * Home “Verified partners” strip: approved listings that finished onboarding first,
 * then featured/trending approved listings to fill the grid (keeps seeded demos visible).
 */
export async function verifiedPartners(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 48, 1), 100)
    const filter = await publicMatch()

    const onboarded = await Business.find({
      ...filter,
      onboardingCompletedAt: { $ne: null },
    })
      .sort({ isFeatured: -1, isTrending: -1, onboardingCompletedAt: -1 })
      .limit(limit)
      .lean()

    let items = onboarded
    if (items.length < limit) {
      const excludeIds = items.map((b) => b._id)
      const need = limit - items.length
      const more = await Business.find({
        ...filter,
        _id: { $nin: excludeIds },
        $or: [{ isTrending: true }, { isFeatured: true }],
      })
        .sort({ isFeatured: -1, isTrending: -1, createdAt: -1 })
        .limit(need)
        .lean()
      items = [...items, ...more]
    }

    res.json({
      ok: true,
      items: items.map((b) => {
        const row = serializeListItem(b)
        const tpl = b.themeSettings && typeof b.themeSettings === 'object' ? b.themeSettings.template : null
        return {
          ...row,
          template: tpl && String(tpl).trim() ? String(tpl).trim() : 'template-one',
        }
      }),
    })
  } catch (e) {
    next(e)
  }
}

export async function offersFeed(req, res, next) {
  try {
    const match = await publicMatch()
    const contents = await BusinessContent.find({
      'offers.0': { $exists: true },
    })
      .populate({
        path: 'businessId',
        match,
      })
      .lean()

    const offers = []
    for (const c of contents) {
      if (!c.businessId) continue
      const b = c.businessId
      for (const o of c.offers || []) {
        offers.push({
          id: `${b._id}_${o._id}`,
          title: o.title,
          description: o.description,
          image: o.image,
          priceActual: o.priceActual || '',
          priceOffer: o.priceOffer || '',
          link: o.link || `/profile/${b.publicId}`,
          businessId: b.publicId,
          businessName: b.name,
        })
      }
    }
    res.json({ ok: true, offers: offers.slice(0, 50) })
  } catch (e) {
    next(e)
  }
}

function parseFiniteDate(raw) {
  if (!raw) return null
  const d = new Date(String(raw))
  return Number.isFinite(d.getTime()) ? d : null
}

/**
 * Public offer ad banners created by SUPER_ADMIN.
 * GET /public/offer-ads?categoryId=<mongoId>&subSlug=<slug>&home=1&includeExpired=1&includeInactive=1
 */
export async function offerAds(req, res, next) {
  try {
    const { categoryId, subSlug, home, includeInactive, includeExpired } = req.query
    const filter = {}
    if (categoryId && isLikelyMongoObjectId(String(categoryId))) filter.categoryId = String(categoryId)
    const subSlugTrimmed = typeof subSlug === 'string' ? subSlug.trim() : ''
    if (subSlugTrimmed) {
      // Subcategory page: ads for this sub + category-wide ads (empty subSlug).
      filter.$or = [{ subSlug: subSlugTrimmed }, { subSlug: '' }, { subSlug: null }]
    } else if (categoryId && isLikelyMongoObjectId(String(categoryId))) {
      // Category page (no sub): only category-wide ads, not sub-specific ones.
      filter.$or = [{ subSlug: '' }, { subSlug: null }]
    }
    if (home === '1' || home === 'true') filter.showOnHome = true
    if (!(includeInactive === '1' || includeInactive === 'true')) filter.isActive = true

    const now = new Date()
    const at = parseFiniteDate(req.query.at) || now
    if (!(includeExpired === '1' || includeExpired === 'true')) {
      filter.startDate = { $lte: at }
      filter.endDate = { $gte: at }
    }

    const items = await OfferAdBanner.find(filter).sort({ startDate: -1, createdAt: -1 }).lean()

    res.json({
      ok: true,
      items: items.map((x) => ({
        id: x._id.toString(),
        categoryId: x.categoryId?.toString?.() ?? String(x.categoryId),
        subSlug: x.subSlug || '',
        title: x.title,
        description: x.description || '',
        offerPercentage: x.offerPercentage ?? null,
        currencySymbol: x.currencySymbol || '',
        priceActual: x.priceActual || '',
        priceOffer: x.priceOffer || '',
        imageUrl: x.imageUrl || '',
        homeImageUrl: x.homeImageUrl || '',
        showOnHome: Boolean(x.showOnHome),
        startDate: x.startDate,
        endDate: x.endDate,
      })),
    })
  } catch (e) {
    next(e)
  }
}

/**
 * Nearby businesses discovery: geospatial query sorted nearest first.
 * GET /public/business/nearby?lat=..&lng=..&radius=10000&limit=24
 */
export async function nearbyBusinesses(req, res, next) {
  try {
    const lat0 = parseFiniteNumber(req.query.lat)
    const lng0 = parseFiniteNumber(req.query.lng)
    if (lat0 === null || lng0 === null) throw new HttpError(400, 'lat and lng are required')
    if (lat0 < -90 || lat0 > 90 || lng0 < -180 || lng0 > 180) throw new HttpError(400, 'lat/lng out of range')

    const radiusRaw = parseFiniteNumber(req.query.radius)
    const radius = clampNumber(radiusRaw ?? 10000, 200, 50000) // 200m..50km (quota + perf safety)

    const limitRaw = parseFiniteNumber(req.query.limit)
    const limit = Math.trunc(clampNumber(limitRaw ?? 24, 1, 60))

    const match = await publicMatch()

    const items = await Business.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng0, lat0] },
          key: 'location',
          distanceField: 'distanceMeters',
          spherical: true,
          maxDistance: radius,
          query: {
            ...match,
            'location.type': 'Point',
            'location.coordinates.0': { $type: 'number' },
            'location.coordinates.1': { $type: 'number' },
          },
        },
      },
      { $limit: limit },
    ])

    res.json({
      ok: true,
      center: { lat: lat0, lng: lng0 },
      radius,
      items: items.map((b) => {
        const row = serializeListItem(b)
        const m = Number(b.distanceMeters)
        const km = Number.isFinite(m) ? m / 1000 : null
        return {
          ...row,
          distanceMeters: Number.isFinite(m) ? Math.round(m) : null,
          distanceKm: km !== null ? Math.round(km * 10) / 10 : null,
        }
      }),
    })
  } catch (e) {
    next(e)
  }
}

export const MAX_RECENT_VISITS = 40

export async function pushRecentlyViewed(userId, businessId) {
  const u = await User.findById(userId).select('recentlyViewed')
  if (!u) return
  const idStr = businessId.toString()
  const rest = (u.recentlyViewed || []).filter((x) => x.toString() !== idStr)
  u.recentlyViewed = [businessId, ...rest].slice(0, MAX_RECENT_VISITS)
  await u.save()
}

/** Public: resolve profile ids to listing rows (guest recent page, order preserved). */
export async function listBusinessesByPublicIds(req, res, next) {
  try {
    const raw = req.body?.profileIds
    const profileIds = Array.isArray(raw)
      ? [...new Set(raw.map((x) => String(x || '').trim()).filter(Boolean))].slice(0, MAX_RECENT_VISITS)
      : []
    if (!profileIds.length) {
      return res.json({ ok: true, items: [] })
    }
    const filter = await publicMatch()
    const rows = await Business.find({ publicId: { $in: profileIds }, ...filter }).lean()
    const byPublicId = new Map(rows.map((b) => [b.publicId, b]))
    const items = profileIds
      .map((pid) => byPublicId.get(pid))
      .filter(Boolean)
      .map((b) => serializeListItem(b))
    res.json({ ok: true, items })
  } catch (e) {
    next(e)
  }
}

export function serializeListItem(b) {
  return {
    profileId: b.publicId,
    id: b._id.toString(),
    name: b.name,
    category: b.category,
    subcategory: b.subcategory,
    logo: b.logo,
    address: b.address,
    formattedAddress: b.formattedAddress,
    city: b.city,
    state: b.state,
    country: b.country,
    postalCode: b.postalCode,
    isVerified: b.isVerified,
    isFeatured: b.isFeatured,
    plan: b.plan,
    ratingAvg: b.ratingAvg,
    reviewCount: b.reviewCount,
    location: b.location,
    placeId: b.placeId || '',
    googleMapLink: b.googleMapLink || '',
    mapLocation: b.mapLocation || null,
    phone: b.phone,
    whatsappHref: b.whatsappHref,
  }
}

function serializeDetail(b, content, reviews) {
  return {
    ...serializeListItem(b),
    description: b.description,
    openingHours: b.openingHours,
    socialLinks: b.socialLinks,
    themeSettings: b.themeSettings,
    contactName: b.contactName,
    contactEmail: b.contactEmail,
    onboardingCompletedAt: b.onboardingCompletedAt,
    content: content || null,
    reviews: reviews.map((r) => ({
      id: r._id.toString(),
      rating: r.rating,
      comment: r.comment,
      userName: r.userId?.name || 'User',
      createdAt: r.createdAt,
    })),
  }
}
