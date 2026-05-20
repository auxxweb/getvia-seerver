import { HomeFeaturedEventItem, HOME_FEATURED_EVENT_SECTIONS } from '../models/HomeFeaturedEventItem.js'
import { HttpError } from '../middleware/errorHandler.js'
import {
  collectHomeFeaturedEventPublicIds,
  destroyCloudinaryPublicIds,
  publicIdsToDelete,
} from '../../services/cloudinaryCleanup.service.js'

function mapItem(x) {
  return {
    id: x._id.toString(),
    section: x.section,
    title: x.title || '',
    description: x.description || '',
    eventTimeLabel: x.eventTimeLabel || '',
    imageUrl: x.imageUrl || '',
    imagePublicId: x.imagePublicId || '',
    linkUrl: x.linkUrl || '',
    sortOrder: Number(x.sortOrder) || 0,
    isActive: x.isActive !== false,
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
  }
}

function normalizeSection(raw) {
  const s = String(raw || '').trim()
  if (!HOME_FEATURED_EVENT_SECTIONS.includes(s)) {
    throw new HttpError(400, `section must be one of: ${HOME_FEATURED_EVENT_SECTIONS.join(', ')}`)
  }
  return s
}

function normalizePayload(body, { isCreate }) {
  const section = normalizeSection(body.section)
  const imageUrl = String(body.imageUrl || '').trim()
  if (!imageUrl) throw new HttpError(400, 'image is required')

  const title = String(body.title || '').trim()
  const description = String(body.description || '').trim()
  const eventTimeLabel = String(body.eventTimeLabel || '').trim()
  const linkUrl = String(body.linkUrl || '').trim()

  if (section === 'marquee' && !title) {
    throw new HttpError(400, 'title is required for scrolling event cards')
  }

  return {
    section,
    title,
    description,
    eventTimeLabel,
    imageUrl,
    imagePublicId: String(body.imagePublicId || '').trim(),
    linkUrl,
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
  }
}

function groupItems(items) {
  const grouped = {
    marquee: [],
    carouselLeft: [],
    carouselRightTop: [],
    carouselRightBottom: [],
  }
  for (const row of items) {
    const item = mapItem(row)
    if (item.section === 'marquee') grouped.marquee.push(item)
    else if (item.section === 'carousel_left') grouped.carouselLeft.push(item)
    else if (item.section === 'carousel_right_top') grouped.carouselRightTop.push(item)
    else if (item.section === 'carousel_right_bottom') grouped.carouselRightBottom.push(item)
  }
  return grouped
}

export async function listAdminHomeFeaturedEvents(req, res, next) {
  try {
    const { section } = req.query
    const filter = {}
    if (section) filter.section = normalizeSection(section)
    const items = await HomeFeaturedEventItem.find(filter)
      .sort({ section: 1, sortOrder: 1, createdAt: -1 })
      .lean()
    res.json({ ok: true, items: items.map(mapItem) })
  } catch (e) {
    next(e)
  }
}

export async function createAdminHomeFeaturedEvent(req, res, next) {
  try {
    const payload = normalizePayload(req.body || {}, { isCreate: true })
    const created = await HomeFeaturedEventItem.create(payload)
    res.status(201).json({ ok: true, item: mapItem(created) })
  } catch (e) {
    next(e)
  }
}

export async function updateAdminHomeFeaturedEvent(req, res, next) {
  try {
    const existing = await HomeFeaturedEventItem.findById(req.params.id)
    if (!existing) throw new HttpError(404, 'Featured event item not found')
    const beforeIds = collectHomeFeaturedEventPublicIds(existing.toObject())

    const payload = normalizePayload({ ...existing.toObject(), ...req.body }, { isCreate: false })
    existing.set(payload)
    await existing.save()
    await destroyCloudinaryPublicIds(
      publicIdsToDelete(beforeIds, collectHomeFeaturedEventPublicIds(existing.toObject())),
    )
    res.json({ ok: true, item: mapItem(existing) })
  } catch (e) {
    next(e)
  }
}

export async function deleteAdminHomeFeaturedEvent(req, res, next) {
  try {
    const d = await HomeFeaturedEventItem.findById(req.params.id).lean()
    if (!d) throw new HttpError(404, 'Featured event item not found')
    await HomeFeaturedEventItem.deleteOne({ _id: req.params.id })
    await destroyCloudinaryPublicIds(collectHomeFeaturedEventPublicIds(d))
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
}

export async function getPublicHomeFeaturedEvents(req, res, next) {
  try {
    const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true'
    const filter = includeInactive ? {} : { isActive: true }
    const items = await HomeFeaturedEventItem.find(filter)
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean()
    res.json({ ok: true, ...groupItems(items) })
  } catch (e) {
    next(e)
  }
}
