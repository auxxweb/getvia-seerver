import { HomeHeroBanner } from '../models/HomeHeroBanner.js'
import { HttpError } from '../middleware/errorHandler.js'
import { buildImageVariantUrls } from '../../services/cloudinary.service.js'
import {
  collectHomeHeroPublicIds,
  destroyCloudinaryPublicIds,
  publicIdsToDelete,
} from '../../services/cloudinaryCleanup.service.js'

const SINGLETON_KEY = 'default'

export const DEFAULT_HOME_HERO = {
  title: 'Grow your brand with Getvia',
  description:
    'Friendly, professional tools designed to accelerate your reach. Harness the power of organic editorial growthtoday.',
  imageUrl: '',
  imagePublicId: '',
}

function resolveBannerImageUrl(imageUrl, imagePublicId) {
  const url = String(imageUrl || '').trim()
  const publicId = String(imagePublicId || '').trim()
  if (publicId) {
    const fromId = buildImageVariantUrls(publicId).full
    if (fromId) return fromId
  }
  return url
}

function countWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

function toPublicBanner(doc) {
  const base = doc || DEFAULT_HOME_HERO
  const imagePublicId = base.imagePublicId || ''
  const imageUrl = resolveBannerImageUrl(base.imageUrl, imagePublicId)
  return {
    title: base.title || DEFAULT_HOME_HERO.title,
    description: base.description || DEFAULT_HOME_HERO.description,
    imageUrl,
    imagePublicId,
    updatedAt: doc?.updatedAt || null,
  }
}

function normalizePayload(body) {
  const title = String(body.title || '').trim()
  if (!title) throw new HttpError(400, 'title is required')
  if (countWords(title) > 5) throw new HttpError(400, 'title must be 5 words or fewer')

  const description = String(body.description || '').trim()
  if (!description) throw new HttpError(400, 'description is required')
  if (countWords(description) > 30) {
    throw new HttpError(400, 'description must be 30 words or fewer')
  }

  const imagePublicId = String(body.imagePublicId || '').trim()
  let imageUrl = String(body.imageUrl || '').trim()
  imageUrl = resolveBannerImageUrl(imageUrl, imagePublicId)
  if (!imageUrl) throw new HttpError(400, 'image is required (upload a square image)')

  return {
    key: SINGLETON_KEY,
    title,
    description,
    imageUrl,
    imagePublicId,
  }
}

export async function getPublicHomeHero(req, res, next) {
  try {
    const doc = await HomeHeroBanner.findOne({ key: SINGLETON_KEY }).lean()
    res.json({ ok: true, banner: toPublicBanner(doc) })
  } catch (e) {
    next(e)
  }
}

export async function getAdminHomeHero(req, res, next) {
  try {
    const doc = await HomeHeroBanner.findOne({ key: SINGLETON_KEY }).lean()
    res.json({ ok: true, banner: toPublicBanner(doc) })
  } catch (e) {
    next(e)
  }
}

export async function upsertAdminHomeHero(req, res, next) {
  try {
    const payload = normalizePayload(req.body || {})
    const previous = await HomeHeroBanner.findOne({ key: SINGLETON_KEY }).lean()
    const doc = await HomeHeroBanner.findOneAndUpdate(
      { key: SINGLETON_KEY },
      { $set: payload },
      { upsert: true, new: true, runValidators: true },
    )
    await destroyCloudinaryPublicIds(
      publicIdsToDelete(collectHomeHeroPublicIds(previous), collectHomeHeroPublicIds(doc.toObject())),
    )
    res.json({ ok: true, banner: toPublicBanner(doc) })
  } catch (e) {
    next(e)
  }
}
