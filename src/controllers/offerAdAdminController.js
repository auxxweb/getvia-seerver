import { OfferAdBanner } from '../models/OfferAdBanner.js'
import { Category } from '../models/Category.js'
import { HttpError } from '../middleware/errorHandler.js'
import {
  collectOfferAdPublicIds,
  destroyCloudinaryPublicIds,
  publicIdsToDelete,
} from '../../services/cloudinaryCleanup.service.js'

function isLikelyMongoObjectId(id) {
  return typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id)
}

function slugifyParam(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Slugs for category subcategories (matches public browse + admin offer form). */
function subSlugOptionsFromCategory(cat) {
  const subs = cat?.subcategories || []
  const seen = new Set()
  const out = []
  for (const raw of subs) {
    const title =
      typeof raw === 'string' ? raw : String(raw?.title || raw?.name || '').trim()
    if (!title) continue
    let slug = slugifyParam(title)
    let n = 0
    while (seen.has(slug)) {
      n += 1
      slug = `${slugifyParam(title)}-${n}`
    }
    seen.add(slug)
    out.push(slug)
  }
  return out
}

function assertSubSlugForCategory(cat, subSlug) {
  const trimmed = String(subSlug || '').trim()
  const allowed = subSlugOptionsFromCategory(cat)
  if (!allowed.length) {
    throw new HttpError(400, 'Selected category has no subcategories; add subcategories first')
  }
  if (!trimmed) throw new HttpError(400, 'subSlug is required')
  if (!allowed.includes(trimmed)) {
    throw new HttpError(400, 'subSlug must match a subcategory on the selected category')
  }
  return trimmed
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

  const imageUrl = String(body.imageUrl || '').trim()
  if (!imageUrl) throw new HttpError(400, 'category banner image is required')

  const showOnHome = Boolean(body.showOnHome)
  const homeImageUrl = String(body.homeImageUrl || '').trim()
  const homeImagePublicId = String(body.homeImagePublicId || '').trim()
  if (showOnHome && !homeImageUrl) {
    throw new HttpError(400, 'landscape home banner image is required when "Show on home" is enabled')
  }

  const offerPercentageRaw = body.offerPercentage
  const offerPercentage =
    offerPercentageRaw === null || offerPercentageRaw === undefined || offerPercentageRaw === ''
      ? null
      : Number(offerPercentageRaw)
  if (offerPercentage !== null && (!Number.isFinite(offerPercentage) || offerPercentage < 0 || offerPercentage > 100)) {
    throw new HttpError(400, 'offerPercentage must be between 0 and 100')
  }

  const priceOffer = String(body.priceOffer || '').trim()
  const priceActual = String(body.priceActual || '').trim()

  const hasPercent = offerPercentage !== null
  const hasAmount = Boolean(priceOffer)
  if (!hasPercent && !hasAmount) {
    throw new HttpError(400, 'set either an offer percentage or an offer amount')
  }
  if (hasPercent && hasAmount) {
    throw new HttpError(400, 'use either percentage or amount, not both')
  }
  if (hasAmount && !priceActual) {
    throw new HttpError(400, 'original price is required when using an offer amount')
  }

  const currencySymbol = String(body.currencySymbol || '').trim()
  if (hasAmount) {
    if (!currencySymbol) throw new HttpError(400, 'currency symbol is required for amount offers')
    if (currencySymbol.length > 8) throw new HttpError(400, 'currency symbol must be 8 characters or fewer')
  }

  return {
    categoryId: String(body.categoryId || '').trim(),
    subSlug: String(body.subSlug || '').trim(),
    title,
    description: String(body.description || '').trim(),
    offerPercentage: hasPercent ? offerPercentage : null,
    currencySymbol: hasAmount ? currencySymbol : '',
    priceActual: hasAmount ? priceActual : '',
    priceOffer: hasAmount ? priceOffer : '',
    imageUrl,
    imagePublicId: String(body.imagePublicId || '').trim(),
    homeImageUrl: showOnHome ? homeImageUrl : '',
    homeImagePublicId: showOnHome ? homeImagePublicId : '',
    showOnHome,
    startDate,
    endDate,
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
  }
}

function mapOfferAdItem(x) {
  const category = x.categoryId && typeof x.categoryId === 'object' ? x.categoryId : null
  return {
    _id: x._id?.toString?.() ?? String(x._id),
    categoryId: category?._id?.toString?.() ?? x.categoryId?.toString?.() ?? String(x.categoryId),
    categoryName: category?.name || '',
    subSlug: x.subSlug || '',
    title: x.title,
    description: x.description || '',
    offerPercentage: x.offerPercentage ?? null,
    currencySymbol: x.currencySymbol || '',
    priceActual: x.priceActual || '',
    priceOffer: x.priceOffer || '',
    imageUrl: x.imageUrl || '',
    imagePublicId: x.imagePublicId || '',
    homeImageUrl: x.homeImageUrl || '',
    homeImagePublicId: x.homeImagePublicId || '',
    showOnHome: Boolean(x.showOnHome),
    startDate: x.startDate,
    endDate: x.endDate,
    isActive: x.isActive !== false,
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
  }
}

export async function listOfferAds(req, res, next) {
  try {
    const { categoryId, subSlug } = req.query
    const filter = {}
    if (categoryId && isLikelyMongoObjectId(String(categoryId))) filter.categoryId = String(categoryId)
    if (typeof subSlug === 'string' && subSlug.trim()) filter.subSlug = subSlug.trim()

    const items = await OfferAdBanner.find(filter)
      .populate('categoryId', 'name')
      .sort({ startDate: -1, createdAt: -1 })
      .lean()

    res.json({ ok: true, items: items.map(mapOfferAdItem) })
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
    payload.subSlug = assertSubSlugForCategory(cat, payload.subSlug)
    const created = await OfferAdBanner.create(payload)
    const populated = await OfferAdBanner.findById(created._id).populate('categoryId', 'name').lean()
    res.status(201).json({ ok: true, item: mapOfferAdItem(populated) })
  } catch (e) {
    next(e)
  }
}

export async function updateOfferAd(req, res, next) {
  try {
    const existing = await OfferAdBanner.findById(req.params.id)
    if (!existing) throw new HttpError(404, 'Offer ad not found')
    const beforeIds = collectOfferAdPublicIds(existing.toObject())

    const merged = normalizePayload({
      ...existing.toObject(),
      ...req.body,
      categoryId: existing.categoryId?.toString(),
    })

    if (req.body?.categoryId !== undefined) {
      if (!isLikelyMongoObjectId(String(req.body.categoryId))) throw new HttpError(400, 'categoryId must be a Mongo id')
      const cat = await Category.findById(String(req.body.categoryId)).lean()
      if (!cat) throw new HttpError(404, 'Category not found')
      merged.categoryId = String(req.body.categoryId)
    } else {
      merged.categoryId = existing.categoryId
    }

    const cat = await Category.findById(merged.categoryId).lean()
    if (!cat) throw new HttpError(404, 'Category not found')
    merged.subSlug = assertSubSlugForCategory(cat, merged.subSlug)

    existing.set(merged)
    await existing.save()
    await destroyCloudinaryPublicIds(
      publicIdsToDelete(beforeIds, collectOfferAdPublicIds(existing.toObject())),
    )
    const populated = await OfferAdBanner.findById(existing._id).populate('categoryId', 'name').lean()
    res.json({ ok: true, item: mapOfferAdItem(populated) })
  } catch (e) {
    next(e)
  }
}

export async function deleteOfferAd(req, res, next) {
  try {
    const d = await OfferAdBanner.findById(req.params.id).lean()
    if (!d) throw new HttpError(404, 'Offer ad not found')
    await OfferAdBanner.deleteOne({ _id: req.params.id })
    await destroyCloudinaryPublicIds(collectOfferAdPublicIds(d))
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
}
