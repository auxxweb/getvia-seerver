import { Business } from '../models/Business.js'
import { BadgeRequest } from '../models/BadgeRequest.js'
import { HttpError } from '../middleware/errorHandler.js'
import { ensureAnalytics } from '../services/analytics.service.js'
import {
  isCloudinaryConfigured,
  uploadImage,
  deleteImage,
  buildImageVariantUrls,
} from '../../services/cloudinary.service.js'
import {
  applyBusinessContentUpdate,
  applyBusinessUpdate,
  completeBusinessOnboarding,
  createBusinessForOwner,
  getBusinessDetailBundle,
} from '../services/businessProfileMutations.js'
import {
  assertGalleryWithinPlan,
  assertAndConsumeOfferPosts,
  assertTemplateAllowed,
} from '../services/planEntitlements.service.js'
import { getApiOrigin } from '../services/legacyImageUrls.service.js'

export async function uploadMediaDataUrl(req, res, next) {
  try {
    if (!isCloudinaryConfigured()) {
      throw new HttpError(503, 'Cloudinary is not configured; image upload is unavailable.')
    }
    const dataUrl = req.body?.dataUrl
    if (!dataUrl || typeof dataUrl !== 'string') {
      throw new HttpError(400, 'Missing dataUrl')
    }
    const m = /^data:image\/[\w.+-]+;base64,(.+)$/i.exec(dataUrl.trim())
    if (!m) {
      throw new HttpError(400, 'Expected a base64 data:image/… URL')
    }
    const base64Payload = m[1]
    const buf = Buffer.from(base64Payload, 'base64')
    if (buf.length > 8 * 1024 * 1024) throw new HttpError(400, 'Image too large (max 8MB)')

    const replacePublicId =
      typeof req.body?.replacePublicId === 'string' ? req.body.replacePublicId.trim() : ''

    const uploaded = await uploadImage(buf, 'businesses')
    if (replacePublicId && replacePublicId !== uploaded.public_id) {
      try {
        await deleteImage(replacePublicId)
      } catch {
        /* best-effort cleanup */
      }
    }
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
    const business = await createBusinessForOwner(req.user._id, req.body)
    res.status(201).json({ ok: true, business: business.toObject() })
  } catch (e) {
    next(e)
  }
}

export async function updateBusiness(req, res, next) {
  try {
    const { id } = req.params
    const business = await Business.findById(id)
    if (!business) throw new HttpError(404, 'Business not found')
    if (business.ownerId.toString() !== req.user._id.toString()) {
      throw new HttpError(403, 'Not your business')
    }
    const nextTemplate = req.body?.themeSettings?.template
    if (nextTemplate) {
      await assertTemplateAllowed(id, nextTemplate)
    }
    await applyBusinessUpdate(business, req.body)
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
    const bundle = await getBusinessDetailBundle(id, { apiOrigin: getApiOrigin(req) })
    if (bundle.business.ownerId.toString() !== req.user._id.toString()) {
      throw new HttpError(403, 'Not your business')
    }
    res.json({ ok: true, ...bundle })
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
    await completeBusinessOnboarding(business)
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

    const { BusinessContent } = await import('../models/BusinessContent.js')
    const existing = await BusinessContent.findOne({ businessId: id }).lean()
    const prevOfferCount = (existing?.offers || []).length

    if (req.body?.gallery !== undefined) {
      await assertGalleryWithinPlan(id, req.body.gallery)
    }
    if (req.body?.offers !== undefined) {
      await assertAndConsumeOfferPosts(id, prevOfferCount, (req.body.offers || []).length)
    }

    const content = await applyBusinessContentUpdate(id, req.body)
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
