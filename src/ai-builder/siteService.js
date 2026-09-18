import mongoose from 'mongoose'
import { Website, WebsiteDraft, AIConversation } from '../models/aiBuilderModels.js'
import { freshAiCanvasFromProfile, isDesignedAiDraft } from './state/mapProfileToWebsiteState.js'
import { getBusinessProfile } from './tools/getBusinessProfile.js'
import { AI_WEBSITE_PROJECT, ensureWebsiteProjectMeta, stampProjectOnState } from './state/projectMeta.js'

export function isPreservedAiDraft(websiteState) {
  if (websiteState?.engine !== 'ai' || websiteState?.templateId) return false
  if (websiteState?.settings?.hasAiDesign === false) return true
  return isDesignedAiDraft(websiteState)
}

export async function getOrCreateWebsiteForBusiness({ user, business }) {
  let site = await Website.findOne({ businessId: business._id })
  if (!site) {
    site = await Website.create({
      ownerId: user._id,
      businessId: business._id,
      status: 'draft',
      engine: 'ai',
      framework: AI_WEBSITE_PROJECT.framework,
      bundler: AI_WEBSITE_PROJECT.bundler,
      renderer: AI_WEBSITE_PROJECT.renderer,
    })
  } else {
    await ensureWebsiteProjectMeta(site)
  }
  let draft = await WebsiteDraft.findOne({ siteId: site._id })
  const profile = await getBusinessProfile({ businessId: business._id, ownerId: user._id })
  const facts = stampProjectOnState(
    freshAiCanvasFromProfile({
      business: profile.raw.business,
      content: profile.raw.content,
      siteId: site._id,
    }),
  )
  if (!draft) {
    draft = await WebsiteDraft.create({
      siteId: site._id,
      businessId: business._id,
      ownerId: user._id,
      revisionNumber: 1,
      websiteState: facts,
      contentOverlay: facts.content,
      themeOverlay: facts.theme,
      requirements: {},
    })
    site.draftId = draft._id
    await site.save()
  } else if (!isPreservedAiDraft(draft.websiteState) && !isDesignedAiDraft(draft.websiteState)) {
    draft.websiteState = facts
    draft.contentOverlay = facts.content
    draft.themeOverlay = facts.theme
    draft.markModified('websiteState')
    await draft.save()
  } else if (!draft.websiteState?.settings?.framework) {
    draft.websiteState = stampProjectOnState(draft.websiteState)
    draft.markModified('websiteState')
    await draft.save()
  }
  let conversation = await AIConversation.findOne({ siteId: site._id })
  if (!conversation) {
    conversation = await AIConversation.create({
      siteId: site._id,
      businessId: business._id,
      userId: user._id,
    })
  }
  return { site, draft, conversation, profile }
}

export function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id)
}
