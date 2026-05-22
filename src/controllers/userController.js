import { Review } from '../models/Review.js'
import { User } from '../models/User.js'
import { Business } from '../models/Business.js'
import { HttpError } from '../middleware/errorHandler.js'
import { trackEvent } from '../services/analytics.service.js'
import {
  pushRecentlyViewed,
  serializeListItem,
} from './businessPublicController.js'

const MAX_REVIEW_COMMENT = 2000

function is24HexObjectId(s) {
  return typeof s === 'string' && /^[a-f0-9]{24}$/i.test(s)
}

async function resolveBusinessByIdOrPublicId(businessId) {
  if (businessId == null || businessId === '') return null
  const raw = String(businessId).trim()
  if (is24HexObjectId(raw)) {
    return Business.findById(raw)
  }
  return Business.findOne({ publicId: raw })
}

export async function me(req, res, next) {
  try {
    const u = await User.findById(req.user._id).populate('savedBusinesses', 'publicId')
    if (!u) throw new HttpError(404, 'User not found')
    const safe = u.toSafeObject()
    safe.savedBusinessProfileIds = (u.savedBusinesses || [])
      .map((b) => (b && typeof b === 'object' ? b.publicId : null))
      .filter(Boolean)
    safe.savedBusinesses = safe.savedBusinessProfileIds
    res.json({ ok: true, user: safe })
  } catch (e) {
    next(e)
  }
}

export async function listSavedBusinesses(req, res, next) {
  try {
    const u = await User.findById(req.user._id).populate('savedBusinesses')
    if (!u) throw new HttpError(404, 'User not found')
    const items = (u.savedBusinesses || [])
      .filter((b) => b && typeof b === 'object')
      .map((b) => serializeListItem(b))
    res.json({ ok: true, items })
  } catch (e) {
    next(e)
  }
}

export async function listRecentBusinesses(req, res, next) {
  try {
    const u = await User.findById(req.user._id).populate('recentlyViewed')
    if (!u) throw new HttpError(404, 'User not found')
    const items = (u.recentlyViewed || [])
      .filter((b) => b && typeof b === 'object')
      .map((b) => serializeListItem(b))
    res.json({ ok: true, items })
  } catch (e) {
    next(e)
  }
}

/** Merge device-local recent profile ids after sign-in (guest QR scans before login). */
export async function mergeRecentVisits(req, res, next) {
  try {
    if (req.user.role !== 'USER') {
      return res.json({ ok: true, merged: 0 })
    }
    const raw = req.body?.profileIds
    const profileIds = Array.isArray(raw)
      ? [...new Set(raw.map((x) => String(x || '').trim()).filter(Boolean))]
      : []
    let merged = 0
    for (const pid of [...profileIds].reverse()) {
      const b = await resolveBusinessByIdOrPublicId(pid)
      if (!b) continue
      if (b.ownerId?.toString() === req.user._id.toString()) continue
      await pushRecentlyViewed(req.user._id, b._id)
      merged += 1
    }
    res.json({ ok: true, merged })
  } catch (e) {
    next(e)
  }
}

export async function reviewStatus(req, res, next) {
  try {
    const b = await resolveBusinessByIdOrPublicId(req.query.businessId)
    if (!b) throw new HttpError(404, 'Business not found')
    const ownerStr = b.ownerId?.toString?.() ?? String(b.ownerId)
    const isOwner = ownerStr === req.user._id.toString()
    const existing = await Review.findOne({ userId: req.user._id, businessId: b._id }).select('_id').lean()
    res.json({
      ok: true,
      hasReviewed: Boolean(existing),
      isOwner,
    })
  } catch (e) {
    next(e)
  }
}

export async function createReview(req, res, next) {
  try {
    const { businessId, rating: ratingRaw, comment: commentRaw } = req.body
    const b = await resolveBusinessByIdOrPublicId(businessId)
    if (!b) throw new HttpError(404, 'Business not found')
    if (b.ownerId.toString() === req.user._id.toString()) {
      throw new HttpError(403, 'You cannot review your own business')
    }
    const rating = Number(ratingRaw)
    if (!Number.isFinite(rating) || rating < 1 || rating > 5 || Math.round(rating) !== rating) {
      throw new HttpError(400, 'Rating must be a whole number from 1 to 5')
    }
    const comment = String(commentRaw ?? '').trim()
    if (!comment.length) {
      throw new HttpError(400, 'Review note is required')
    }
    if (comment.length > MAX_REVIEW_COMMENT) {
      throw new HttpError(400, `Review note must be at most ${MAX_REVIEW_COMMENT} characters`)
    }
    let r
    try {
      r = await Review.create({
        userId: req.user._id,
        businessId: b._id,
        rating,
        comment,
      })
    } catch (e) {
      if (e && e.code === 11000) {
        return next(new HttpError(409, 'You have already reviewed this business'))
      }
      throw e
    }
    const stats = await Review.aggregate([
      { $match: { businessId: b._id } },
      { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
    ])
    b.ratingAvg = Math.round((stats[0]?.avg || 0) * 10) / 10
    b.reviewCount = stats[0]?.n || 0
    await b.save()
    await trackEvent(b._id, 'enquiry')
    const populated = await Review.findById(r._id).populate('userId', 'name photoURL').lean()
    const u = populated?.userId
    const userName =
      u && typeof u === 'object' && u.name ? u.name : (await User.findById(req.user._id).select('name').lean())?.name || 'User'
    const userPhotoURL = u && typeof u === 'object' && u.photoURL ? u.photoURL : req.user.photoURL || ''
    res.status(201).json({
      ok: true,
      review: {
        id: populated._id.toString(),
        rating: populated.rating,
        comment: populated.comment,
        userName,
        userPhotoURL,
        createdAt: populated.createdAt,
      },
      ratingAvg: b.ratingAvg,
      reviewCount: b.reviewCount,
    })
  } catch (e) {
    next(e)
  }
}

export async function saveBusiness(req, res, next) {
  try {
    const { businessId } = req.body
    if (businessId == null || String(businessId).trim() === '') {
      throw new HttpError(400, 'businessId is required')
    }
    const b = await resolveBusinessByIdOrPublicId(businessId)
    if (!b) throw new HttpError(404, 'Business not found')
    if (b.ownerId?.toString() === req.user._id.toString()) {
      throw new HttpError(400, 'You cannot save your own business')
    }
    const u = await User.findById(req.user._id)
    if (!u) throw new HttpError(404, 'User not found')
    const idStr = b._id.toString()
    const has = u.savedBusinesses.some((x) => x.toString() === idStr)
    if (has) {
      u.savedBusinesses = u.savedBusinesses.filter((x) => x.toString() !== idStr)
    } else {
      u.savedBusinesses.push(b._id)
      await trackEvent(b._id, 'save')
    }
    await u.save()
    res.json({ ok: true, saved: !has, profileId: b.publicId })
  } catch (e) {
    next(e)
  }
}

export async function trackAnalytics(req, res, next) {
  try {
    const { businessId, type } = req.body
    const b = await resolveBusinessByIdOrPublicId(businessId)
    if (!b) throw new HttpError(404, 'Business not found')
    if (!['view', 'click', 'enquiry'].includes(type)) {
      throw new HttpError(400, 'Invalid type')
    }
    await trackEvent(b._id, type)
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
}
