import { Category } from '../models/Category.js'
import { Event } from '../models/Event.js'
import { Business } from '../models/Business.js'
import { BusinessContent } from '../models/BusinessContent.js'
import { User } from '../models/User.js'
import { Analytics } from '../models/Analytics.js'
import { PaymentHistory } from '../models/PaymentHistory.js'
import { HttpError } from '../middleware/errorHandler.js'
import { deleteImage, isCloudinaryConfigured } from '../../services/cloudinary.service.js'

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
        logoUrl: s.logoUrl || '',
        coverImageUrl: s.coverImageUrl || '',
        logoPublicId: s.logoPublicId || '',
        coverImagePublicId: s.coverImagePublicId || '',
      }
    })
    .filter(Boolean)
}

function collectCategoryPublicIds(doc) {
  if (!doc) return []
  const ids = []
  if (doc.iconPublicId) ids.push(doc.iconPublicId)
  if (doc.logoPublicId) ids.push(doc.logoPublicId)
  if (doc.coverImagePublicId) ids.push(doc.coverImagePublicId)
  for (const s of doc.subcategories || []) {
    if (s && typeof s === 'object') {
      if (s.logoPublicId) ids.push(s.logoPublicId)
      if (s.coverImagePublicId) ids.push(s.coverImagePublicId)
    }
  }
  return [...new Set(ids.filter(Boolean))]
}

async function destroyCloudinaryIds(ids) {
  if (!isCloudinaryConfigured() || !ids.length) return
  await Promise.all(ids.map((id) => deleteImage(id).catch(() => {})))
}

function normalizeCategoryPayload(body) {
  return {
    name: String(body.name || '').trim(),
    description: body.description || '',
    icon: body.icon || '',
    iconPublicId: body.iconPublicId || '',
    logoUrl: body.logoUrl || '',
    logoPublicId: body.logoPublicId || '',
    coverImageUrl: body.coverImageUrl || '',
    coverImagePublicId: body.coverImagePublicId || '',
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
    const items = await Category.find().sort({ name: 1 }).lean()
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
    res.status(201).json({ ok: true, category: c })
  } catch (e) {
    next(e)
  }
}

export async function updateCategory(req, res, next) {
  try {
    const existing = await Category.findById(req.params.id)
    if (!existing) throw new HttpError(404, 'Category not found')
    const merged = {
      name: req.body.name !== undefined ? String(req.body.name).trim() : existing.name,
      description: req.body.description !== undefined ? req.body.description : existing.description,
      icon: req.body.icon !== undefined ? req.body.icon : existing.icon,
      iconPublicId:
        req.body.iconPublicId !== undefined ? req.body.iconPublicId : existing.iconPublicId,
      logoUrl: req.body.logoUrl !== undefined ? req.body.logoUrl : existing.logoUrl,
      logoPublicId:
        req.body.logoPublicId !== undefined ? req.body.logoPublicId : existing.logoPublicId,
      coverImageUrl:
        req.body.coverImageUrl !== undefined ? req.body.coverImageUrl : existing.coverImageUrl,
      coverImagePublicId:
        req.body.coverImagePublicId !== undefined
          ? req.body.coverImagePublicId
          : existing.coverImagePublicId,
      subcategories:
        req.body.subcategories !== undefined
          ? normalizeSubcategoriesInput(req.body.subcategories)
          : existing.subcategories,
    }
    if (!merged.name) throw new HttpError(400, 'Category name is required')
    existing.set(merged)
    await existing.save()
    res.json({ ok: true, category: existing })
  } catch (e) {
    next(e)
  }
}

export async function deleteCategory(req, res, next) {
  try {
    const c = await Category.findByIdAndDelete(req.params.id)
    if (!c) throw new HttpError(404, 'Category not found')
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
    const ev = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (!ev) throw new HttpError(404, 'Event not found')
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
    if (ev.bannerPublicId) await destroyCloudinaryIds([ev.bannerPublicId])
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
      .sort({ onboardingCompletedAt: -1 })
      .lean()
    res.json({ ok: true, items })
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
    let content = await BusinessContent.findOne({ businessId: b._id })
    if (!content) {
      content = await BusinessContent.create({ businessId: b._id })
    }
    const patch = req.body || {}
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
