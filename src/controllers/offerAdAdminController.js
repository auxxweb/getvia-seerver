import { OfferAdBanner } from '../models/OfferAdBanner.js'
import { Category } from '../models/Category.js'
import { HttpError } from '../middleware/errorHandler.js'

function isLikelyMongoObjectId(id) {
  return typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id)
}

function parseDateOrThrow(raw, label) {
  const d = new Date(String(raw || ''))
  if (!Number.isFinite(d.getTime())) throw new HttpError(400, `${label} must be a valid date`)
  return d
}

function normalizePayload(body) {
  const title = String(body.title || '').trim()
  if (!title) throw new HttpError(400, 'title is required')

  const startDate = parseDateOrThrow(body.startDate, 'startDate')
  const endDate = parseDateOrThrow(body.endDate, 'endDate')
  if (endDate.getTime() < startDate.getTime()) {
    throw new HttpError(400, 'endDate must be on/after startDate')
  }

  const offerPercentageRaw = body.offerPercentage
  const offerPercentage =
    offerPercentageRaw === null || offerPercentageRaw === undefined || offerPercentageRaw === ''
      ? null
      : Number(offerPercentageRaw)
  if (offerPercentage !== null && (!Number.isFinite(offerPercentage) || offerPercentage < 0 || offerPercentage > 100)) {
    throw new HttpError(400, 'offerPercentage must be between 0 and 100')
  }

  return {
    categoryId: String(body.categoryId || '').trim(),
    subSlug: String(body.subSlug || '').trim(),
    title,
    description: String(body.description || '').trim(),
    offerPercentage,
    priceActual: String(body.priceActual || '').trim(),
    priceOffer: String(body.priceOffer || '').trim(),
    imageUrl: String(body.imageUrl || '').trim(),
    imagePublicId: String(body.imagePublicId || '').trim(),
    showOnHome: Boolean(body.showOnHome),
    startDate,
    endDate,
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
  }
}

export async function listOfferAds(req, res, next) {
  try {
    const { categoryId, subSlug } = req.query
    const filter = {}
    if (categoryId && isLikelyMongoObjectId(String(categoryId))) filter.categoryId = String(categoryId)
    if (typeof subSlug === 'string' && subSlug.trim()) filter.subSlug = subSlug.trim()

    const items = await OfferAdBanner.find(filter).sort({ startDate: -1, createdAt: -1 }).lean()
    res.json({ ok: true, items })
  } catch (e) {
    next(e)
  }
}

export async function createOfferAd(req, res, next) {
  try {
    const payload = normalizePayload(req.body || {})
    if (!isLikelyMongoObjectId(payload.categoryId)) throw new HttpError(400, 'categoryId is required')
    const cat = await Category.findById(payload.categoryId).lean()
    if (!cat) throw new HttpError(404, 'Category not found')
    const created = await OfferAdBanner.create(payload)
    res.status(201).json({ ok: true, item: created })
  } catch (e) {
    next(e)
  }
}

export async function updateOfferAd(req, res, next) {
  try {
    const existing = await OfferAdBanner.findById(req.params.id)
    if (!existing) throw new HttpError(404, 'Offer ad not found')

    const merged = normalizePayload({ ...existing.toObject(), ...req.body, categoryId: existing.categoryId?.toString() })

    // If caller passed categoryId explicitly, validate it.
    if (req.body?.categoryId !== undefined) {
      if (!isLikelyMongoObjectId(String(req.body.categoryId))) throw new HttpError(400, 'categoryId must be a Mongo id')
      const cat = await Category.findById(String(req.body.categoryId)).lean()
      if (!cat) throw new HttpError(404, 'Category not found')
      merged.categoryId = String(req.body.categoryId)
    } else {
      merged.categoryId = existing.categoryId
    }

    existing.set(merged)
    await existing.save()
    res.json({ ok: true, item: existing })
  } catch (e) {
    next(e)
  }
}

export async function deleteOfferAd(req, res, next) {
  try {
    const d = await OfferAdBanner.findByIdAndDelete(req.params.id)
    if (!d) throw new HttpError(404, 'Offer ad not found')
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
}

