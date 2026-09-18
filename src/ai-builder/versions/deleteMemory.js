import {
  AIChangeSet,
  AIConversation,
  AIJob,
  AIMessage,
  AIUsage,
  AiSiteMemory,
  WebsiteDraft,
  WebsiteValidation,
  WebsiteVersion,
} from '../../models/aiBuilderModels.js'
import { abortJobsForSite } from '../jobs/queue.js'
import { freshAiCanvasFromProfile } from '../state/mapProfileToWebsiteState.js'
import { getBusinessProfile } from '../tools/getBusinessProfile.js'
import { wipeIsolatedRuntimeForSite } from '../workspace/wipeIsolatedRuntime.js'
import { aiError, AiErrorCode } from '../errors.js'

export async function deleteWebsiteVersion({ site, version }) {
  if (site.publishedVersionId && String(site.publishedVersionId) === String(version._id)) {
    site.publishedVersionId = null
    site.publishedState = null
    site.status = 'draft'
    await site.save()
  }
  await WebsiteVersion.deleteOne({ _id: version._id, siteId: site._id })
  return { ok: true, deletedVersionId: String(version._id) }
}

export async function deleteAllAiBuilderMemory({ site, user }) {
  await abortJobsForSite(site._id, { includeIdle: true })

  const conversations = await AIConversation.find({ siteId: site._id }).select('_id').lean()
  const conversationIds = conversations.map((row) => row._id)

  await Promise.all([
    WebsiteVersion.deleteMany({ siteId: site._id }),
    AIJob.deleteMany({ siteId: site._id }),
    AIChangeSet.deleteMany({ siteId: site._id }),
    WebsiteValidation.deleteMany({ siteId: site._id }),
    AIUsage.deleteMany({ siteId: site._id }),
    AiSiteMemory.deleteMany({ siteId: site._id }),
    conversationIds.length
      ? AIMessage.deleteMany({ conversationId: { $in: conversationIds } })
      : Promise.resolve(),
    AIMessage.deleteMany({ siteId: site._id }),
  ])

  await AIConversation.deleteMany({ siteId: site._id })

  const profile = await getBusinessProfile({ businessId: site.businessId, ownerId: site.ownerId })
  const facts = freshAiCanvasFromProfile({
    business: profile.raw.business,
    content: profile.raw.content,
    siteId: site._id,
  })

  let draft = await WebsiteDraft.findOne({ siteId: site._id })
  if (!draft) {
    throw aiError(404, 'Website draft not found.', { code: AiErrorCode.NOT_FOUND })
  }

  await wipeIsolatedRuntimeForSite({
    userId: user?._id || site.ownerId,
    siteId: site._id,
    previewPort: draft.isolatedPreviewPort,
  }).catch(() => ({ ok: true, workspaceDeleted: false }))

  draft.revisionNumber = (draft.revisionNumber || 1) + 1
  draft.websiteState = facts
  draft.contentOverlay = facts.content
  draft.themeOverlay = facts.theme
  draft.requirements = {}
  draft.unresolvedQuestions = []
  draft.confirmedRequirements = []
  draft.selectedElement = null
  draft.lastJobId = null
  draft.mutatingJobId = null
  draft.isolatedPreviewUrl = ''
  draft.isolatedPreviewPort = null
  draft.isolatedSnapshot = null
  draft.markModified('websiteState')
  await draft.save()

  site.publishedVersionId = null
  site.publishedState = null
  site.status = 'draft'
  site.lastPublishedAt = null
  site.lastPublishedIdempotencyKey = ''
  site.draftId = draft._id
  await site.save()

  return { ok: true, draft }
}
