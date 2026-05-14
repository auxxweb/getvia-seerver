import { Review } from '../models/Review.js'
import { User } from '../models/User.js'
import { Business } from '../models/Business.js'
import { HttpError } from '../middleware/errorHandler.js'
import { trackEvent } from '../services/analytics.service.js'

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
    const u = await User.findById(req.user._id)
    if (!u) throw new HttpError(404, 'User not found')
    res.json({ ok: true, user: u.toSafeObject() })
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
    const populated = await Review.findById(r._id).populate('userId', 'name').lean()
    const u = populated?.userId
    const userName =
      u && typeof u === 'object' && u.name ? u.name : (await User.findById(req.user._id).select('name').lean())?.name || 'User'
    res.status(201).json({
      ok: true,
      review: {
        id: populated._id.toString(),
        rating: populated.rating,
        comment: populated.comment,
        userName,
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
    const b =
      (await Business.findById(businessId)) ||
      (await Business.findOne({ publicId: businessId }))
    if (!b) throw new HttpError(404, 'Business not found')
    const u = await User.findById(req.user._id)
    const idStr = b._id.toString()
    const has = u.savedBusinesses.some((x) => x.toString() === idStr)
    if (has) {
      u.savedBusinesses = u.savedBusinesses.filter((x) => x.toString() !== idStr)
    } else {
      u.savedBusinesses.push(b._id)
      await trackEvent(b._id, 'save')
    }
    await u.save()
    res.json({ ok: true, saved: !has, savedBusinesses: u.savedBusinesses })
  } catch (e) {
    next(e)
  }
}

export async function trackAnalytics(req, res, next) {
  try {
    const { businessId, type } = req.body
    const b =
      (await Business.findById(businessId)) ||
      (await Business.findOne({ publicId: businessId }))
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
