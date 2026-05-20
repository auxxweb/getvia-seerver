import { deleteImage, isCloudinaryConfigured } from './cloudinary.service.js'

/** Public IDs present in `previous` but not in `next` (e.g. removed items or replaced images). */
export function publicIdsToDelete(previous, next) {
  const keep = new Set((next || []).filter(Boolean))
  return [...new Set((previous || []).filter((id) => id && !keep.has(id)))]
}

/** Best-effort delete; failures are ignored so DB operations are not blocked. */
export async function destroyCloudinaryPublicIds(ids) {
  const unique = [...new Set((ids || []).filter((id) => typeof id === 'string' && id.trim()))]
  if (!unique.length || !isCloudinaryConfigured()) return
  await Promise.all(unique.map((id) => deleteImage(id.trim()).catch(() => {})))
}

export function collectCategoryPublicIds(doc) {
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

export function collectEventPublicIds(doc) {
  if (!doc?.bannerPublicId) return []
  return [doc.bannerPublicId]
}

export function collectOfferAdPublicIds(doc) {
  if (!doc) return []
  return [...new Set([doc.imagePublicId, doc.homeImagePublicId].filter(Boolean))]
}

export function collectHomeFeaturedEventPublicIds(doc) {
  if (!doc?.imagePublicId) return []
  return [doc.imagePublicId]
}

export function collectHomeHeroPublicIds(doc) {
  if (!doc?.imagePublicId) return []
  return [doc.imagePublicId]
}

export function collectHomeConnectPublicIds(doc) {
  if (!doc?.imagePublicId) return []
  return [doc.imagePublicId]
}

export function collectBusinessPublicIds(business) {
  if (!business?.logoPublicId) return []
  return [business.logoPublicId]
}

/** Extract Cloudinary public_id from a delivery URL (gallery stores URLs only). */
export function publicIdFromCloudinaryUrl(url) {
  if (typeof url !== 'string' || !url.includes('res.cloudinary.com')) return ''
  const path = url.split('?')[0]
  const marker = '/upload/'
  const idx = path.indexOf(marker)
  if (idx === -1) return ''
  const segments = path.slice(idx + marker.length).split('/')
  while (segments.length) {
    const seg = segments[0]
    if (/^v\d+$/.test(seg)) {
      segments.shift()
      break
    }
    if (seg.includes(',') || seg.includes('_')) {
      segments.shift()
      continue
    }
    break
  }
  const publicId = segments.join('/').replace(/\.[a-z0-9]+$/i, '')
  return publicId || ''
}

export function collectBusinessContentPublicIds(content) {
  if (!content) return []
  const ids = []
  const ls = content.landingSection || {}
  if (ls.bannerImagePublicId) ids.push(ls.bannerImagePublicId)
  if (ls.welcomeImagePublicId) ids.push(ls.welcomeImagePublicId)
  for (const key of ['offers', 'coreServices', 'catalogue', 'profileFeed']) {
    for (const item of content[key] || []) {
      if (item?.imagePublicId) ids.push(item.imagePublicId)
    }
  }
  for (const url of content.gallery || []) {
    const pid = publicIdFromCloudinaryUrl(url)
    if (pid) ids.push(pid)
  }
  return [...new Set(ids.filter(Boolean))]
}
