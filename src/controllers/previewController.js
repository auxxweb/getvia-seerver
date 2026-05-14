import { Business } from '../models/Business.js'
import { BusinessContent } from '../models/BusinessContent.js'
import { Review } from '../models/Review.js'
import { User } from '../models/User.js'
import { HttpError } from '../middleware/errorHandler.js'
import { signAccessToken, verifyAccessToken } from '../utils/tokens.js'

function jwtSecret() {
  return process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET
}

export async function createBusinessPreviewToken(req, res, next) {
  try {
    const { id } = req.params
    const business = await Business.findById(id).select('_id ownerId').lean()
    if (!business) throw new HttpError(404, 'Business not found')
    if (business.ownerId.toString() !== req.user._id.toString()) {
      throw new HttpError(403, 'Not your business')
    }
    const secret = jwtSecret()
    if (!secret) throw new HttpError(500, 'JWT_SECRET is not configured')
    const token = signAccessToken(
      { sub: req.user._id.toString(), biz: business._id.toString(), typ: 'biz-preview' },
      secret,
      '10m',
    )
    res.json({ ok: true, token })
  } catch (e) {
    next(e)
  }
}

function serializeReview(r) {
  return {
    id: r._id.toString(),
    rating: r.rating,
    comment: r.comment,
    userName: r.userId?.name || 'User',
    createdAt: r.createdAt,
  }
}

export async function getBusinessPreviewByToken(req, res, next) {
  try {
    const { token } = req.params
    const secret = jwtSecret()
    if (!secret) throw new HttpError(500, 'JWT_SECRET is not configured')
    let decoded
    try {
      decoded = verifyAccessToken(token, secret)
    } catch {
      throw new HttpError(401, 'Invalid or expired preview token')
    }
    if (decoded?.typ !== 'biz-preview' || !decoded?.biz || !decoded?.sub) {
      throw new HttpError(401, 'Invalid preview token')
    }

    const business = await Business.findById(decoded.biz).lean()
    if (!business) throw new HttpError(404, 'Business not found')
    if (business.ownerId.toString() !== String(decoded.sub)) {
      throw new HttpError(403, 'Preview token does not match business owner')
    }

    const [content, reviews] = await Promise.all([
      BusinessContent.findOne({ businessId: business._id }).lean(),
      Review.find({ businessId: business._id })
        .populate('userId', 'name')
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
    ])

    // mimic public detail payload shape used by frontend templates
    res.json({
      ok: true,
      business: {
        profileId: business.publicId,
        id: business._id.toString(),
        name: business.name,
        category: business.category,
        subcategory: business.subcategory,
        logo: business.logo,
        address: business.address,
        isVerified: business.isVerified,
        isFeatured: business.isFeatured,
        plan: business.plan,
        ratingAvg: business.ratingAvg,
        reviewCount: business.reviewCount,
        location: business.location,
        phone: business.phone,
        whatsappHref: business.whatsappHref,
        description: business.description,
        openingHours: business.openingHours,
        socialLinks: business.socialLinks,
        themeSettings: business.themeSettings,
        contactName: business.contactName,
        contactEmail: business.contactEmail,
        onboardingCompletedAt: business.onboardingCompletedAt,
        content: content || null,
        reviews: (reviews || []).map(serializeReview),
      },
    })
  } catch (e) {
    next(e)
  }
}

