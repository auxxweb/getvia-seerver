import { commitVersion } from '../versions/versionService.js'
import { validateAndStore } from '../changeset/applyToDraft.js'
import { aiError, AiErrorCode } from '../errors.js'
import { getBusinessProfile } from '../tools/getBusinessProfile.js'
import { cloneState } from '../state/websiteState.schema.js'
import { applyBusinessToWebsiteState } from '../workspace/persistIsolatedDraft.js'
import { publishIsolatedLiveSite } from './publishIsolatedLive.js'

function preparePublishedState(draft, { isolatedLiveUrl } = {}) {
  let state = cloneState(draft?.websiteState || {})
  if (draft?.isolatedSnapshot?.business) {
    state = applyBusinessToWebsiteState(state, draft.isolatedSnapshot.business)
  }
  state.engine = 'ai'
  state.settings = {
    ...(state.settings || {}),
    hasAiDesign: true,
    isolatedLiveUrl: isolatedLiveUrl || state.settings?.isolatedLiveUrl || '',
  }
  if (!Array.isArray(state.sectionOrder) || !state.sectionOrder.length) {
    state.sectionOrder = ['hero', 'about', 'services', 'contact', 'footer']
  }
  return state
}

export async function publishDraft({ site, draft, user, idempotencyKey = '', profile: profileArg }) {
  if (idempotencyKey && site.lastPublishedIdempotencyKey === idempotencyKey && site.publishedVersionId) {
    const { WebsiteVersion } = await import('../../models/aiBuilderModels.js')
    const existing = await WebsiteVersion.findById(site.publishedVersionId)
    return { ok: true, replayed: true, version: existing, site }
  }

  const profile =
    profileArg || (await getBusinessProfile({ businessId: site.businessId, ownerId: user._id }))
  const { report } = await validateAndStore({ site, draft, profile, jobId: null })
  if (!report.passed) {
    throw aiError(400, 'Some improvements need your attention before publishing.', {
      code: AiErrorCode.VALIDATION_FAILED,
      retryable: true,
      recoveryAction: 'PREVIEW',
      details: { errors: report.errors, warnings: report.warnings },
    })
  }

  // Prefer the real isolated React build on the live profile (same as AI Builder preview).
  const live = await publishIsolatedLiveSite({ user, site, draft })
  if (!live.ok && !live.skipped) {
    throw aiError(400, live.message || 'Could not build the live website for publish.', {
      code: live.code || AiErrorCode.PUBLISH_FAILED,
      retryable: true,
      recoveryAction: 'PREVIEW',
      details: { publishLive: live },
    })
  }

  const publishedState = preparePublishedState(draft, { isolatedLiveUrl: live.ok ? live.url : '' })
  draft.websiteState = publishedState
  draft.markModified?.('websiteState')
  await draft.save?.()

  const version = await commitVersion({
    site,
    draft,
    userId: user._id,
    versionType: 'PUBLISHED',
    source: 'ai',
    prompt: 'publish',
    idempotencyKey,
    parentVersionId: site.publishedVersionId,
  })

  try {
    site.publishedState = publishedState
    site.engine = 'ai'
    site.renderer = live.ok ? 'IsolatedDist' : 'AiGeneratedOnePage'
  } catch (err) {
    throw aiError(500, 'Publishing failed. Your live website was not changed.', {
      code: AiErrorCode.PUBLISH_FAILED,
      retryable: true,
      recoveryAction: 'RETRY',
      details: { versionId: String(version._id) },
    })
  }

  site.publishedVersionId = version._id
  site.status = 'published'
  site.lastPublishedAt = new Date()
  if (idempotencyKey) site.lastPublishedIdempotencyKey = idempotencyKey
  await site.save()
  return { ok: true, replayed: false, version, site, isolatedLiveUrl: live.ok ? live.url : null }
}
