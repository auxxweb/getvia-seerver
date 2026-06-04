import { Category } from '../models/Category.js'
import { Event } from '../models/Event.js'
import { Business } from '../models/Business.js'
import { BusinessContent } from '../models/BusinessContent.js'
import { User } from '../models/User.js'
import { Analytics } from '../models/Analytics.js'
import { PaymentHistory } from '../models/PaymentHistory.js'
import { HttpError } from '../middleware/errorHandler.js'
import {
  buildImageVariantUrls,
  isCloudinaryConfigured,
} from '../../services/cloudinary.service.js'
import {
  collectCategoryPublicIds,
  collectEventPublicIds,
  destroyCloudinaryPublicIds,
  publicIdsToDelete,
} from '../../services/cloudinaryCleanup.service.js'
import { applyBusinessContentUpdate } from '../services/businessProfileMutations.js'

function isHttpImageUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u.trim())
}

/** Prefer stored CDN URL; fall back to Cloudinary delivery URL from public_id. */
function resolveStoredImageUrl(url, publicId) {
  const raw = typeof url === 'string' ? url.trim() : ''
  if (isHttpImageUrl(raw)) return raw
  const pid = typeof publicId === 'string' ? publicId.trim() : ''
  if (pid && isCloudinaryConfigured()) {
    const variants = buildImageVariantUrls(pid)
    return variants.full || variants.medium || ''
  }
  return raw
}

function normalizeSubcategoryForAdmin(raw) {
  if (typeof raw === 'string') {
    const title = raw.trim()
    return {
      title,
      description: '',
      logoUrl: '',
      coverImageUrl: '',
      logoPublicId: '',
      coverImagePublicId: '',
    }
  }
  const s = raw && typeof raw === 'object' ? raw : {}
  return {
    title: String(s.title || s.name || '').trim(),
    description: s.description || '',
    logoUrl: s.logoUrl || s.logo || s.image || '',
    coverImageUrl: s.coverImageUrl || s.cover || s.coverImage || '',
    logoPublicId: s.logoPublicId || '',
    coverImagePublicId: s.coverImagePublicId || '',
  }
}

function enrichCategoryForAdmin(doc) {
  const c = doc && typeof doc.toObject === 'function' ? doc.toObject() : { ...doc }
  const iconResolved = resolveStoredImageUrl(c.icon, c.iconPublicId)
  const icon =
    isHttpImageUrl(iconResolved) || iconResolved.startsWith('//') ? iconResolved : c.icon || ''
  return {
    ...c,
    icon,
    logoUrl: resolveStoredImageUrl(c.logoUrl, c.logoPublicId),
    coverImageUrl: resolveStoredImageUrl(c.coverImageUrl, c.coverImagePublicId),
    subcategories: (c.subcategories || []).map((raw) => {
      const s = normalizeSubcategoryForAdmin(raw)
      return {
        ...s,
        logoUrl: resolveStoredImageUrl(s.logoUrl, s.logoPublicId),
        coverImageUrl: resolveStoredImageUrl(s.coverImageUrl, s.coverImagePublicId),
      }
    }),
  }
}

function normalizeSubcategoriesInput(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((s) => {
      if (typeof s === 'string') {
        const title = s.trim()
        if (!title) return null
        return {
          title,
          description: '',
          logoUrl: '',
          coverImageUrl: '',
          logoPublicId: '',
          coverImagePublicId: '',
        }
      }
      const title = String(s.title || s.name || '').trim()
      if (!title) return null
      return {
        title,
        description: s.description || '',
        logoUrl: '',
        coverImageUrl: s.coverImageUrl || '',
        logoPublicId: '',
        coverImagePublicId: s.coverImagePublicId || '',
      }
    })
    .filter(Boolean)
}

function normalizeCategoryPayload(body) {
  return {
    name: String(body.name || '').trim(),
    description: body.description || '',
    icon: '',
    iconPublicId: '',
    logoUrl: '',
    logoPublicId: '',
    coverImageUrl: body.coverImageUrl || '',
    coverImagePublicId: body.coverImagePublicId || '',
    showInDailyNeeds: Boolean(body.showInDailyNeeds),
    subcategories: normalizeSubcategoriesInput(body.subcategories),
  }
}

export async function platformAnalytics(req, res, next) {
  try {
    const [users, businesses, payments] = await Promise.all([
      User.countDocuments(),
      Business.countDocuments(),
      PaymentHistory.aggregate([
        { $match: { status: 'PAID' } },
        { $group: { _id: null, revenuePaise: { $sum: '$amountPaise' } } },
      ]),
    ])
    const revenuePaise = payments[0]?.revenuePaise || 0
    res.json({
      ok: true,
      totals: {
        users,
        businesses,
        revenuePaise,
        revenueDisplay: (revenuePaise / 100).toFixed(2),
      },
    })
  } catch (e) {
    next(e)
  }
}

export async function listCategories(req, res, next) {
  try {
    const rows = await Category.find().sort({ name: 1 }).lean()
    const items = rows.map(enrichCategoryForAdmin)
    res.json({ ok: true, items })
  } catch (e) {
    next(e)
  }
}

export async function createCategory(req, res, next) {
  try {
    const payload = normalizeCategoryPayload(req.body)
    if (!payload.name) throw new HttpError(400, 'Category name is required')
    const c = await Category.create(payload)
    res.status(201).json({ ok: true, category: enrichCategoryForAdmin(c) })
  } catch (e) {
    next(e)
  }
}

export async function updateCategory(req, res, next) {
  try {
    const existing = await Category.findById(req.params.id)
    if (!existing) throw new HttpError(404, 'Category not found')
    const beforeIds = collectCategoryPublicIds(existing.toObject())
    const payload = normalizeCategoryPayload(req.body)
    if (!payload.name) throw new HttpError(400, 'Category name is required')
    existing.set(payload)
    await existing.save()
    const afterIds = collectCategoryPublicIds(existing.toObject())
    await destroyCloudinaryPublicIds(publicIdsToDelete(beforeIds, afterIds))
    res.json({ ok: true, category: enrichCategoryForAdmin(existing) })
  } catch (e) {
    next(e)
  }
}

export async function deleteCategory(req, res, next) {
  try {
    const c = await Category.findById(req.params.id).lean()
    if (!c) throw new HttpError(404, 'Category not found')
    const imageIds = collectCategoryPublicIds(c)
    await Category.deleteOne({ _id: req.params.id })
    await destroyCloudinaryPublicIds(imageIds)
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
}

export async function listEvents(req, res, next) {
  try {
    const items = await Event.find().sort({ date: -1 }).lean()
    res.json({ ok: true, items })
  } catch (e) {
    next(e)
  }
}

export async function createEvent(req, res, next) {
  try {
    const ev = await Event.create(req.body)
    res.status(201).json({ ok: true, event: ev })
  } catch (e) {
    next(e)
  }
}

export async function updateEvent(req, res, next) {
  try {
    const existing = await Event.findById(req.params.id).lean()
    if (!existing) throw new HttpError(404, 'Event not found')
    const ev = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true })
    await destroyCloudinaryPublicIds(
      publicIdsToDelete(collectEventPublicIds(existing), collectEventPublicIds(ev)),
    )
    res.json({ ok: true, event: ev })
  } catch (e) {
    next(e)
  }
}

export async function deleteEvent(req, res, next) {
  try {
    const ev = await Event.findById(req.params.id).lean()
    if (!ev) throw new HttpError(404, 'Event not found')
    await Event.deleteOne({ _id: req.params.id })
    await destroyCloudinaryPublicIds(collectEventPublicIds(ev))
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
}

export async function listBusinessesAdmin(req, res, next) {
  try {
    const { status } = req.query
    const filter = {}
    if (status) filter.approvalStatus = status
    const items = await Business.find(filter).populate('ownerId', 'name email isBlocked').lean()
    res.json({ ok: true, items })
  } catch (e) {
    next(e)
  }
}

export async function listOnboardedBusinesses(req, res, next) {
  try {
    const items = await Business.find({ onboardingCompletedAt: { $ne: null } })
      .populate('ownerId', 'name email isBlocked')
      .populate('planId', 'name price validity isActive')
      .lean()
    items.sort((a, b) => badgeSortRank(b) - badgeSortRank(a) || byOnboardedDesc(a, b))
    res.json({ ok: true, items })
  } catch (e) {
    next(e)
  }
}

function badgeSortRank(b) {
  const verified = Boolean(b?.isVerified)
  const featured = Boolean(b?.isFeatured)
  if (verified && featured) return 4
  if (verified) return 3
  if (featured) return 2
  return 1
}

function byOnboardedDesc(a, b) {
  const ta = a.onboardingCompletedAt ? new Date(a.onboardingCompletedAt).getTime() : 0
  const tb = b.onboardingCompletedAt ? new Date(b.onboardingCompletedAt).getTime() : 0
  return tb - ta
}

/** GET /admin/users?role=USER — platform consumers (not business owners or super admins). */
export async function listPlatformUsers(req, res, next) {
  try {
    const role = String(req.query.role || 'USER').trim().toUpperCase()
    if (role !== 'USER') {
      throw new HttpError(400, 'Only role=USER is supported')
    }
    const q = String(req.query.q || '').trim()
    const filter = { role: 'USER' }
    if (q) {
      const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(esc, 'i')
      filter.$or = [{ email: re }, { name: re }, { phone: re }]
    }
    const items = await User.find(filter).sort({ createdAt: -1 }).limit(500).lean()
    res.json({
      ok: true,
      items: items.map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone || '',
        photoURL: u.photoURL || '',
        isBlocked: Boolean(u.isBlocked),
        createdAt: u.createdAt,
      })),
    })
  } catch (e) {
    next(e)
  }
}

export async function getBusinessAdminDetail(req, res, next) {
  try {
    const b = await Business.findById(req.params.id)
      .populate('ownerId', 'name email isBlocked')
      .populate('planId', 'name price validity isActive')
      .lean()
    if (!b) throw new HttpError(404, 'Business not found')
    res.json({ ok: true, item: b })
  } catch (e) {
    next(e)
  }
}

/** PATCH /admin/users/:id/block — suspend a consumer (role USER) account. */
export async function setConsumerBlocked(req, res, next) {
  try {
    const { isBlocked } = req.body
    if (typeof isBlocked !== 'boolean') {
      throw new HttpError(400, 'isBlocked must be a boolean')
    }
    const user = await User.findById(req.params.id).select('+refreshTokens')
    if (!user) throw new HttpError(404, 'User not found')
    if (user.role !== 'USER') {
      throw new HttpError(400, 'Only consumer accounts can be blocked from this endpoint')
    }
    user.isBlocked = isBlocked
    if (isBlocked) {
      user.refreshTokens = []
    }
    await user.save()
    res.json({
      ok: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        isBlocked: user.isBlocked,
      },
    })
  } catch (e) {
    next(e)
  }
}

export async function setBusinessOwnerBlocked(req, res, next) {
  try {
    const { isBlocked } = req.body
    if (typeof isBlocked !== 'boolean') {
      throw new HttpError(400, 'isBlocked must be a boolean')
    }
    const b = await Business.findById(req.params.id)
    if (!b) throw new HttpError(404, 'Business not found')
    const owner = await User.findById(b.ownerId)
    if (!owner) throw new HttpError(404, 'Owner not found')
    if (owner.role !== 'BUSINESS_OWNER') {
      throw new HttpError(400, 'This listing is not owned by a business owner account')
    }
    owner.isBlocked = isBlocked
    await owner.save()
    res.json({
      ok: true,
      owner: {
        id: owner._id.toString(),
        email: owner.email,
        isBlocked: owner.isBlocked,
      },
    })
  } catch (e) {
    next(e)
  }
}

export async function setBusinessApproval(req, res, next) {
  try {
    const { approvalStatus } = req.body
    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(approvalStatus)) {
      throw new HttpError(400, 'Invalid status')
    }
    const b = await Business.findByIdAndUpdate(
      req.params.id,
      { approvalStatus },
      { new: true },
    )
    if (!b) throw new HttpError(404, 'Business not found')
    res.json({ ok: true, business: b })
  } catch (e) {
    next(e)
  }
}

export async function setBusinessFlags(req, res, next) {
  try {
    const patch = {}
    if (typeof req.body.isFeatured === 'boolean') patch.isFeatured = req.body.isFeatured
    if (typeof req.body.isTrending === 'boolean') patch.isTrending = req.body.isTrending
    if (typeof req.body.isVerified === 'boolean') patch.isVerified = req.body.isVerified
    const b = await Business.findByIdAndUpdate(req.params.id, patch, { new: true })
    if (!b) throw new HttpError(404, 'Business not found')
    res.json({ ok: true, business: b })
  } catch (e) {
    next(e)
  }
}

export async function getBusinessContentAdmin(req, res, next) {
  try {
    const b = await Business.findById(req.params.id).lean()
    if (!b) throw new HttpError(404, 'Business not found')
    const content = await BusinessContent.findOne({ businessId: b._id }).lean()
    res.json({ ok: true, content: content || null })
  } catch (e) {
    next(e)
  }
}

export async function patchBusinessContentAdmin(req, res, next) {
  try {
    const b = await Business.findById(req.params.id)
    if (!b) throw new HttpError(404, 'Business not found')
    const content = await applyBusinessContentUpdate(b._id, req.body || {})
    res.json({ ok: true, content })
  } catch (e) {
    next(e)
  }
}
