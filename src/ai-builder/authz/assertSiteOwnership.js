import { Business } from '../../models/Business.js'
import { Website, WebsiteDraft } from '../../models/aiBuilderModels.js'
import { HttpError } from '../../middleware/errorHandler.js'
import { aiError, AiErrorCode } from '../errors.js'

export async function assertBusinessOwnership(user, businessId) {
  if (!user?._id) throw aiError(401, 'Sign in required.', { code: AiErrorCode.UNAUTHORIZED })
  if (!businessId) throw aiError(400, 'businessId is required.', { code: AiErrorCode.NOT_FOUND })
  const business = await Business.findById(businessId).select('_id ownerId publicId').lean()
  if (!business) throw aiError(404, 'Business not found.', { code: AiErrorCode.NOT_FOUND })
  const isOwner = business.ownerId.toString() === user._id.toString()
  const isAdmin = user.role === 'SUPER_ADMIN'
  if (!isOwner && !isAdmin) {
    throw aiError(403, 'Not your business.', { code: AiErrorCode.FORBIDDEN })
  }
  return business
}

export async function assertSiteOwnership(user, siteId) {
  if (!user?._id) throw aiError(401, 'Sign in required.', { code: AiErrorCode.UNAUTHORIZED })
  const site = await Website.findById(siteId)
  if (!site) throw aiError(404, 'Website not found.', { code: AiErrorCode.NOT_FOUND })
  const isOwner = site.ownerId.toString() === user._id.toString()
  const isAdmin = user.role === 'SUPER_ADMIN'
  if (!isOwner && !isAdmin) {
    throw aiError(403, 'Not your website.', { code: AiErrorCode.FORBIDDEN })
  }
  return site
}

export async function loadOwnedDraft(user, siteId) {
  const site = await assertSiteOwnership(user, siteId)
  const draft = await WebsiteDraft.findOne({ siteId: site._id })
  if (!draft) throw new HttpError(404, 'Website draft not found')
  return { site, draft }
}
