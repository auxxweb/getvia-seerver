import { Business } from '../models/Business.js'
import { BusinessContent } from '../models/BusinessContent.js'
import { Analytics } from '../models/Analytics.js'
import { User } from '../models/User.js'
import { BadgeRequest } from '../models/BadgeRequest.js'
import { HttpError } from '../middleware/errorHandler.js'
import { ensureAnalytics } from '../services/analytics.service.js'
import {
  isCloudinaryConfigured,
  uploadImage,
  buildImageVariantUrls,
} from '../../services/cloudinary.service.js'

function normalizePointLocation(raw) {
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

function normalizeMapLocation(raw) {
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

export async function uploadMediaDataUrl(req, res, next) {
  try {
    if (!isCloudinaryConfigured()) {
      throw new HttpError(503, 'Cloudinary is not configured; image upload is unavailable.')
    }
    const dataUrl = req.body?.dataUrl
    if (!dataUrl || typeof dataUrl !== 'string') {
      throw new HttpError(400, 'Missing dataUrl')
    }
    const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i.exec(dataUrl.trim())
    if (!m) {
      throw new HttpError(400, 'Expected a base64 data:image/png|jpeg|jpg|webp URL')
    }
    const buf = Buffer.from(m[2], 'base64')
    if (buf.length > 8 * 1024 * 1024) throw new HttpError(400, 'Image too large (max 8MB)')

    const uploaded = await uploadImage(buf, 'businesses')
    const urls = buildImageVariantUrls(uploaded.public_id)
    res.status(201).json({
      ok: true,
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
      urls,
    })
  } catch (e) {
    next(e)
  }
}

export async function createBusiness(req, res, next) {
  try {
    const ownerUser = await User.findById(req.user._id)
    if (ownerUser?.ownedBusinessId) {
      throw new HttpError(409, 'You already have a business listing. Use update instead.')
    }

    const ownerId = req.user._id
    const body = req.body
    const publicId =
      body.publicId ||
      `biz-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`.toLowerCase()

    const exists = await Business.findOne({ publicId })
    if (exists) throw new HttpError(409, 'publicId already taken')

    const business = await Business.create({
      ownerId,
      publicId,
      name: body.name,
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
      location: normalizePointLocation(body.location),
      mapLocation: normalizeMapLocation(body.mapLocation),
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

    await UserAttachOwned(req.user._id, business._id)

    res.status(201).json({ ok: true, business: business.toObject() })
  } catch (e) {
    next(e)
  }
}

async function UserAttachOwned(userId, businessId) {
  await User.findByIdAndUpdate(userId, { ownedBusinessId: businessId })
}

export async function updateBusiness(req, res, next) {
  try {
    const { id } = req.params
    const business = await Business.findById(id)
    if (!business) throw new HttpError(404, 'Business not found')
    if (business.ownerId.toString() !== req.user._id.toString()) {
      throw new HttpError(403, 'Not your business')
    }
    const allowed = [
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
    for (const k of allowed) {
      if (req.body[k] === undefined) continue
      if (k === 'location') {
        if (req.body.location === null) {
          business.location = undefined
        } else {
          const loc = normalizePointLocation(req.body.location)
          if (!loc) throw new HttpError(400, 'Invalid location; expected { type:"Point", coordinates:[lng,lat] }')
          business.location = loc
        }
        continue
      }
      if (k === 'mapLocation') {
        if (req.body.mapLocation === null) {
          business.mapLocation = undefined
        } else {
          const ml = normalizeMapLocation(req.body.mapLocation)
          if (!ml) throw new HttpError(400, 'Invalid mapLocation; expected coordinates { lat,lng }')
          business.mapLocation = ml
        }
        continue
      }
      if (k === 'themeSettings') {
        const patch = req.body.themeSettings
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
      business[k] = req.body[k]
    }
    await business.save()
    res.json({ ok: true, business })
  } catch (e) {
    next(e)
  }
}

export async function myBusinesses(req, res, next) {
  try {
    const list = await Business.find({ ownerId: req.user._id }).lean()
    res.json({ ok: true, items: list })
  } catch (e) {
    next(e)
  }
}

export async function getOwnerBusinessDetail(req, res, next) {
  try {
    const { id } = req.params
    const business = await Business.findById(id).populate('planId').lean()
    if (!business) throw new HttpError(404, 'Business not found')
    if (business.ownerId.toString() !== req.user._id.toString()) {
      throw new HttpError(403, 'Not your business')
    }
    const content = await BusinessContent.findOne({ businessId: id }).lean()
    res.json({ ok: true, business, content: content || null })
  } catch (e) {
    next(e)
  }
}

export async function completeOnboarding(req, res, next) {
  try {
    const { id } = req.params
    const business = await Business.findById(id)
    if (!business) throw new HttpError(404, 'Business not found')
    if (business.ownerId.toString() !== req.user._id.toString()) {
      throw new HttpError(403, 'Not your business')
    }
    business.onboardingCompletedAt = new Date()
    // Make the listing publicly discoverable (home, search, profile) after the wizard is complete.
    if (business.approvalStatus !== 'REJECTED') {
      business.approvalStatus = 'APPROVED'
    }
    await business.save()
    res.json({ ok: true, business })
  } catch (e) {
    next(e)
  }
}

export async function updateBusinessContent(req, res, next) {
  try {
    const { id } = req.params
    const business = await Business.findById(id)
    if (!business) throw new HttpError(404, 'Business not found')
    if (business.ownerId.toString() !== req.user._id.toString()) {
      throw new HttpError(403, 'Not your business')
    }
    let content = await BusinessContent.findOne({ businessId: id })
    if (!content) {
      content = await BusinessContent.create({ businessId: id })
    }
    const patch = req.body
    const mergeObj = (key) => {
      if (patch[key] === undefined) return
      const cur = content.get(key)
      const plain = cur && typeof cur.toObject === 'function' ? cur.toObject() : cur || {}
      content.set(key, { ...plain, ...patch[key] })
    }
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
    res.json({ ok: true, content })
  } catch (e) {
    next(e)
  }
}

export async function listMyBadgeRequests(req, res, next) {
  try {
    const { id } = req.params
    const business = await Business.findById(id)
    if (!business) throw new HttpError(404, 'Business not found')
    if (business.ownerId.toString() !== req.user._id.toString()) {
      throw new HttpError(403, 'Not your business')
    }
    const items = await BadgeRequest.find({ businessId: business._id }).sort({ createdAt: -1 }).lean()
    res.json({
      ok: true,
      items: items.map((r) => ({
        id: r._id.toString(),
        badgeType: r.badgeType,
        ownerNotes: r.ownerNotes || '',
        status: r.status,
        adminNotes: r.adminNotes || '',
        createdAt: r.createdAt,
        fulfilledAt: r.fulfilledAt,
      })),
    })
  } catch (e) {
    next(e)
  }
}

export async function createBadgeRequest(req, res, next) {
  try {
    const { id } = req.params
    const badgeType = String(req.body?.badgeType || '').toUpperCase().trim()
    if (!['FEATURED', 'VERIFIED'].includes(badgeType)) {
      throw new HttpError(400, 'badgeType must be FEATURED or VERIFIED')
    }

    const business = await Business.findById(id)
    if (!business) throw new HttpError(404, 'Business not found')
    if (business.ownerId.toString() !== req.user._id.toString()) {
      throw new HttpError(403, 'Not your business')
    }

    if (badgeType === 'FEATURED' && business.isFeatured) {
      throw new HttpError(409, 'Your listing already has the Featured badge.')
    }
    if (badgeType === 'VERIFIED' && business.isVerified) {
      throw new HttpError(409, 'Your listing already has the Verified badge.')
    }

    const dup = await BadgeRequest.findOne({
      businessId: business._id,
      badgeType,
      status: 'PENDING',
    })
    if (dup) {
      throw new HttpError(409, 'You already have a pending request for this badge.')
    }

    const ownerNotes = String(req.body?.ownerNotes || '').trim()
    const created = await BadgeRequest.create({
      businessId: business._id,
      requestedBy: req.user._id,
      badgeType,
      ownerNotes,
      status: 'PENDING',
    })

    res.status(201).json({
      ok: true,
      item: {
        id: created._id.toString(),
        badgeType: created.badgeType,
        ownerNotes: created.ownerNotes,
        status: created.status,
        createdAt: created.createdAt,
      },
    })
  } catch (e) {
    next(e)
  }
}

export async function businessAnalytics(req, res, next) {
  try {
    const { id } = req.params
    const business = await Business.findById(id)
    if (!business) throw new HttpError(404, 'Business not found')
    if (business.ownerId.toString() !== req.user._id.toString()) {
      throw new HttpError(403, 'Not your business')
    }
    const doc = await ensureAnalytics(business._id)
    res.json({ ok: true, analytics: doc })
  } catch (e) {
    next(e)
  }
}
