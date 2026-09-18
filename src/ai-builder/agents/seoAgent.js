import { structuredDataTypeForCategory } from '../templates/categoryPatterns.js'
import { PUBLIC_PROFILE_PATH, getPublicSiteOrigin } from '../constants.js'

export function seoAgent({ profile, state }) {
  const name = profile?.identity?.name || ''
  const category = profile?.identity?.category || ''
  const city = profile?.location?.city || ''
  const desc = String(profile?.identity?.description || state?.content?.description || '').slice(0, 160)
  const title = [name, category && city ? `${category} in ${city}` : category].filter(Boolean).join(' | ')
  const canonical = profile?.publicId
    ? `${getPublicSiteOrigin()}${PUBLIC_PROFILE_PATH(profile.publicId)}`
    : profile?.publicUrl || ''
  return {
    operations: [
      {
        type: 'SEO_CHANGE',
        target: { site: true },
        changes: {
          title,
          description: desc,
          canonical,
          ogTitle: title,
          ogDescription: desc,
          ogImage: profile?.content?.landing?.bannerImageUrl || profile?.identity?.logo || '',
          robots: 'index,follow',
          structuredDataType: structuredDataTypeForCategory(category, profile?.identity?.subcategory),
        },
      },
    ],
  }
}
