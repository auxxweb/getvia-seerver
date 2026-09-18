import { buildImageVariantUrls } from '../../../services/cloudinary.service.js'

export function assetAgent({ profile }) {
  const operations = []
  const landing = profile?.content?.landing || {}
  const images = profile?.assets?.images || []
  const gallery = profile?.content?.gallery || []
  const hero = landing.bannerImageUrl || images[0] || profile?.assets?.logo?.url || ''
  if (hero && !landing.bannerImageUrl) {
    operations.push({
      type: 'ASSET_CHANGE',
      target: { sectionId: 'top' },
      changes: { heroImageUrl: hero, heroImagePublicId: landing.bannerImagePublicId || '' },
    })
  }
  if (gallery.length) {
    operations.push({
      type: 'ASSET_CHANGE',
      target: { sectionId: 'gallery' },
      changes: { gallery },
    })
  }
  const publicId = landing.bannerImagePublicId || profile?.assets?.logo?.publicId
  let responsive = null
  if (publicId) {
    try {
      responsive = buildImageVariantUrls(publicId)
    } catch {
      responsive = null
    }
  }
  return { operations, responsive }
}
