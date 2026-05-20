import { HomeConnectSection } from '../models/HomeConnectSection.js'
import { HttpError } from '../middleware/errorHandler.js'
import { buildImageVariantUrls } from '../../services/cloudinary.service.js'
import {
  collectHomeConnectPublicIds,
  destroyCloudinaryPublicIds,
  publicIdsToDelete,
} from '../../services/cloudinaryCleanup.service.js'

const SINGLETON_KEY = 'default'

export const DEFAULT_HOME_CONNECT = {
  title: 'We Connect the Business',
  description:
    'Find & Connect with Local Businesses – Absolutely Free!\n\nFind various businesses near you from the free profile listing directory. Top-rated services can be discovered through genuine customer reviews and recommendations from the community. No fees, no fuss; simply unhindered access to the best local businesses around you NectereClub',
  imageUrl: '',
  imagePublicId: '',
}

function countWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

function resolveSectionImageUrl(imageUrl, imagePublicId) {
  const url = String(imageUrl || '').trim()
  const publicId = String(imagePublicId || '').trim()
  if (publicId) {
    const fromId = buildImageVariantUrls(publicId).full
    if (fromId) return fromId
  }
  return url
}

function toPublicSection(doc) {
  const base = doc || DEFAULT_HOME_CONNECT
  const imagePublicId = base.imagePublicId || ''
  const imageUrl = resolveSectionImageUrl(base.imageUrl, imagePublicId)
  return {
    title: base.title || DEFAULT_HOME_CONNECT.title,
    description: base.description || DEFAULT_HOME_CONNECT.description,
    imageUrl,
    imagePublicId,
    updatedAt: doc?.updatedAt || null,
  }
}

function normalizePayload(body) {
  const title = String(body.title || '').trim()
  if (!title) throw new HttpError(400, 'title is required')
  if (countWords(title) > 8) throw new HttpError(400, 'title must be 8 words or fewer')

  const description = String(body.description || '').trim()
  if (!description) throw new HttpError(400, 'description is required')
  if (countWords(description) > 60) {
    throw new HttpError(400, 'description must be 60 words or fewer')
  }

  const imagePublicId = String(body.imagePublicId || '').trim()
  let imageUrl = String(body.imageUrl || '').trim()
  imageUrl = resolveSectionImageUrl(imageUrl, imagePublicId)
  if (!imageUrl) throw new HttpError(400, 'image is required (upload an image)')

  return {
    key: SINGLETON_KEY,
    title,
    description,
    imageUrl,
    imagePublicId,
  }
}

export async function getPublicHomeConnect(req, res, next) {
  try {
    const doc = await HomeConnectSection.findOne({ key: SINGLETON_KEY }).lean()
    res.json({ ok: true, section: toPublicSection(doc) })
  } catch (e) {
    next(e)
  }
}

export async function getAdminHomeConnect(req, res, next) {
  try {
    const doc = await HomeConnectSection.findOne({ key: SINGLETON_KEY }).lean()
    res.json({ ok: true, section: toPublicSection(doc) })
  } catch (e) {
    next(e)
  }
}

export async function upsertAdminHomeConnect(req, res, next) {
  try {
    const payload = normalizePayload(req.body || {})
    const previous = await HomeConnectSection.findOne({ key: SINGLETON_KEY }).lean()
    const doc = await HomeConnectSection.findOneAndUpdate(
      { key: SINGLETON_KEY },
      { $set: payload },
      { upsert: true, new: true, runValidators: true },
    )
    await destroyCloudinaryPublicIds(
      publicIdsToDelete(collectHomeConnectPublicIds(previous), collectHomeConnectPublicIds(doc.toObject())),
    )
    res.json({ ok: true, section: toPublicSection(doc) })
  } catch (e) {
    next(e)
  }
}
