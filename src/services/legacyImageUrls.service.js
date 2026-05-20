import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { uploadImage, isCloudinaryConfigured } from '../../services/cloudinary.service.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const LEGACY_UPLOADS_DIR = path.join(__dirname, '../../uploads')

export function isLegacyLocalUploadUrl(url) {
  if (!url || typeof url !== 'string') return false
  return url.includes('/api/uploads/')
}

export function legacyUploadFilename(url) {
  if (!isLegacyLocalUploadUrl(url)) return ''
  const part = url.split('/api/uploads/').pop() || ''
  return part.split('?')[0].split('#')[0].trim()
}

export function getApiOrigin(req) {
  if (req?.get?.('host')) {
    const proto = req.protocol || 'http'
    return `${proto}://${req.get('host')}`
  }
  const fromEnv = process.env.API_PUBLIC_ORIGIN || process.env.SERVER_PUBLIC_ORIGIN
  if (fromEnv) return String(fromEnv).replace(/\/$/, '')
  return `http://localhost:${process.env.PORT || 5000}`
}

/** Rewrite legacy /api/uploads/ URLs to the current API host. */
export function resolveLegacyImageUrl(url, apiOrigin) {
  if (!url || typeof url !== 'string') return url || ''
  const filename = legacyUploadFilename(url)
  if (!filename) return url
  const origin = String(apiOrigin || getApiOrigin()).replace(/\/$/, '')
  return `${origin}/api/uploads/${filename}`
}

export function resolveImageUrl(url, apiOrigin) {
  if (!url || typeof url !== 'string') return url || ''
  if (isLegacyLocalUploadUrl(url)) return resolveLegacyImageUrl(url, apiOrigin)
  return url
}

function resolveLandingSection(landing, apiOrigin) {
  if (!landing || typeof landing !== 'object') return landing
  return {
    ...landing,
    bannerImageUrl: resolveImageUrl(landing.bannerImageUrl, apiOrigin),
    welcomeImageUrl: resolveImageUrl(landing.welcomeImageUrl, apiOrigin),
  }
}

function resolveCardImages(items, imageKey, apiOrigin) {
  if (!Array.isArray(items)) return items
  return items.map((row) => {
    if (!row || typeof row !== 'object') return row
    const key = imageKey in row ? imageKey : 'image'
    if (!(key in row)) return row
    return { ...row, [key]: resolveImageUrl(row[key], apiOrigin) }
  })
}

export function normalizeBusinessMediaBundle(bundle, apiOrigin) {
  if (!bundle) return bundle
  const business = bundle.business ? { ...bundle.business } : null
  const content = bundle.content ? { ...bundle.content } : null

  if (business?.logo) business.logo = resolveImageUrl(business.logo, apiOrigin)
  if (content) {
    if (Array.isArray(content.gallery)) {
      content.gallery = content.gallery.map((u) => resolveImageUrl(u, apiOrigin)).filter(Boolean)
    }
    if (content.landingSection) {
      content.landingSection = resolveLandingSection(content.landingSection, apiOrigin)
    }
    content.offers = resolveCardImages(content.offers, 'image', apiOrigin)
    content.coreServices = resolveCardImages(content.coreServices, 'imageUrl', apiOrigin)
    content.catalogue = resolveCardImages(content.catalogue, 'image', apiOrigin)
    content.profileFeed = resolveCardImages(content.profileFeed, 'image', apiOrigin)
  }

  return { ...bundle, business, content }
}

async function migrateLegacyUrlToCloudinary(url, folder) {
  const filename = legacyUploadFilename(url)
  if (!filename || !isCloudinaryConfigured()) return null
  const filePath = path.join(LEGACY_UPLOADS_DIR, filename)
  if (!fs.existsSync(filePath)) return null
  const buffer = fs.readFileSync(filePath)
  const uploaded = await uploadImage(buffer, folder)
  return uploaded.secure_url || null
}

/**
 * One-time lazy migration: legacy disk uploads → Cloudinary (persists to DB).
 */
export async function migrateLegacyContentMedia(businessId, content, apiOrigin) {
  if (!content || typeof content !== 'object') return content
  const gallery = Array.isArray(content.gallery) ? content.gallery : []
  const hasLegacyGallery = gallery.some(isLegacyLocalUploadUrl)
  if (!hasLegacyGallery) return content

  const nextGallery = []
  let migratedAny = false
  for (const url of gallery) {
    if (!isLegacyLocalUploadUrl(url)) {
      nextGallery.push(url)
      continue
    }
    const migrated = await migrateLegacyUrlToCloudinary(url, 'gallery')
    if (migrated) {
      nextGallery.push(migrated)
      migratedAny = true
      continue
    }
    nextGallery.push(resolveLegacyImageUrl(url, apiOrigin))
  }

  if (!migratedAny) return { ...content, gallery: nextGallery }

  const { BusinessContent } = await import('../models/BusinessContent.js')
  await BusinessContent.updateOne({ businessId }, { $set: { gallery: nextGallery } })
  return { ...content, gallery: nextGallery }
}

export async function prepareBusinessMediaForResponse(businessId, bundle, apiOrigin) {
  let content = bundle?.content
  if (content) {
    content = await migrateLegacyContentMedia(businessId, content, apiOrigin)
  }
  const withContent = { ...bundle, content }
  return normalizeBusinessMediaBundle(withContent, apiOrigin)
}
