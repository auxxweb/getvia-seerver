import { websiteStateToBusinessPatch, websiteStateToContentPatch } from '../state/applyWebsiteStateToProfile.js'

/**
 * Merge a draft Website State onto canonical business+content for preview only.
 */
export function mergeDraftIntoBundle(business, content, websiteState) {
  if (!websiteState) return { business, content }
  const bPatch = websiteStateToBusinessPatch(websiteState)
  const cPatch = websiteStateToContentPatch(websiteState)
  const nextBusiness = {
    ...business,
    ...(bPatch.description != null ? { description: bPatch.description } : {}),
    themeSettings: {
      ...(business.themeSettings || {}),
      ...(bPatch.themeSettings || {}),
      themeColorPresets: {
        ...(business.themeSettings?.themeColorPresets || {}),
        ...(bPatch.themeSettings?.themeColorPresets || {}),
      },
    },
  }
  const nextContent = {
    ...content,
    ...cPatch,
    landingSection: {
      ...(content?.landingSection || {}),
      ...(cPatch.landingSection || {}),
    },
  }
  return { business: nextBusiness, content: nextContent, seo: websiteState.seo || null }
}
