import { WebsiteVersion, WebsiteDomain, AIJob } from '../models/aiBuilderModels.js'
import { assertBusinessOwnership, assertSiteOwnership, loadOwnedDraft } from '../ai-builder/authz/assertSiteOwnership.js'
import { getOrCreateWebsiteForBusiness } from '../ai-builder/siteService.js'
import { enqueueBuilderJob, cancelJob, serializeJob, abortJobsForSite, getActiveJobForSite } from '../ai-builder/jobs/queue.js'
import { appendMessage, recentMessages, serializeMessage, maybeSummarize, assistantJobSummary } from '../ai-builder/memory/conversation.js'
import { applyChangeSetToDraft } from '../ai-builder/changeset/applyToDraft.js'
import { friendlyDiff } from '../ai-builder/versions/versionService.js'
import { restoreVersionSnapshot, duplicateVersionSnapshot } from '../ai-builder/versions/restore.js'
import { deleteAllAiBuilderMemory, deleteWebsiteVersion } from '../ai-builder/versions/deleteMemory.js'
import { publishDraft } from '../ai-builder/publish/publishService.js'
import { connectDomain, verifyDomain, disconnectDomain } from '../ai-builder/domains/domainService.js'
import { buildRecommendations } from '../ai-builder/recommendations/proactive.js'
import { buildSuggestedPrompts } from '../ai-builder/mutations/promptAnalysis.js'
import { runWebsiteValidation } from '../ai-builder/validation/runWebsiteValidation.js'
import { consumeAiPrompt } from '../services/planEntitlements.service.js'
import {
  MAX_USER_PROMPT_CHARS,
  PUBLIC_PROFILE_PATH,
  getPublicSiteOrigin,
  getCustomDomainCnameTarget,
} from '../ai-builder/constants.js'
import { sanitizeAiText } from '../ai-builder/lib/sanitize.js'
import { isFullWebsiteBuildPrompt } from '../ai-builder/mutations/interpretDesignerRequest.js'
import { analyzeEditScope } from '../ai-builder/mutations/editScope.js'
import { sanitizeReferenceImageUrl, sectionFromPrompt } from '../ai-builder/visual/referenceDesign.js'
import { aiError, AiErrorCode, newCorrelationId } from '../ai-builder/errors.js'
import { projectMetaFrom } from '../ai-builder/state/projectMeta.js'
import { isIsolatedRuntimeEnabled } from '../ai-builder/runtimeFlags.js'
import { listLLMProviders, activeLLMProviderName } from '../ai-builder/providers/llmProvider.js'
import { modelCatalogForClient } from '../ai-builder/openai/modelCatalog.js'
import { groupUsageByPrompt, MODEL_USD_PER_MILLION } from '../ai-builder/openai/usagePricing.js'
import { AIUsage } from '../models/AIUsage.js'
import { reviveIsolatedPreview } from '../ai-builder/preview/ensurePreview.js'

function serializeSite(site, draft, extra = {}) {
  const origin = getPublicSiteOrigin()
  const project = projectMetaFrom(site, draft)
  return {
    siteId: String(site._id),
    businessId: String(site.businessId),
    status: site.status,
    engine: project.engine,
    framework: project.framework,
    bundler: project.bundler,
    renderer: project.renderer,
    project,
    publishedVersionId: site.publishedVersionId ? String(site.publishedVersionId) : null,
    draftRevision: draft?.revisionNumber ?? null,
    lastPublishedAt: site.lastPublishedAt,
    liveUrl: extra.publicId ? `${origin}${PUBLIC_PROFILE_PATH(extra.publicId)}` : extra.publicUrl || null,
    websiteState: draft?.websiteState || null,
    isolatedPreviewUrl: draft?.isolatedPreviewUrl || extra.isolatedPreviewUrl || null,
    isolatedSavedAt: draft?.isolatedSnapshot?.savedAt || null,
    unresolvedQuestions: draft?.unresolvedQuestions || [],
    mutatingJobId: draft?.mutatingJobId ? String(draft.mutatingJobId) : null,
    ...extra,
  }
}

export async function startAiBuilder(req, res, next) {
  try {
    const businessId = req.body?.businessId || req.query?.businessId || req.user?.ownedBusinessId
    const business = await assertBusinessOwnership(req.user, businessId)
    const { site, draft, conversation, profile } = await getOrCreateWebsiteForBusiness({
      user: req.user,
      business,
    })
    const skipPreview = req.body?.skipPreview === true || req.query?.skipPreview === '1'
    if (!skipPreview) {
      await reviveIsolatedPreview({ user: req.user, site, draft }).catch(() => ({ ok: false }))
    }
    const activeJob = await getActiveJobForSite(site._id)
    const messages = await recentMessages(conversation._id)
    const validation = runWebsiteValidation(draft.websiteState, { profile })
    const recommendations = buildRecommendations({
      profile,
      validation,
      websiteState: draft.websiteState,
    })
    const suggestedPrompts = buildSuggestedPrompts(
      { text: '', requirements: [], domains: [] },
      { profile, websiteState: draft.websiteState, selectedElement: { site: true } },
    )
    res.json({
      ok: true,
      correlationId: newCorrelationId(),
      website: serializeSite(site, draft, {
        publicId: profile.publicId,
        publicUrl: profile.publicUrl,
      }),
      profile: stripRaw(profile),
      conversation: {
        id: String(conversation._id),
        messages: messages.map(serializeMessage),
        summarizedContext: conversation.summarizedContext || '',
      },
      recommendations,
      suggestedPrompts,
      validation,
      activeJob: serializeJob(activeJob),
      isolatedRuntime: isIsolatedRuntimeEnabled(),
      models: modelCatalogForClient({
        providers: listLLMProviders(),
        active: activeLLMProviderName(),
      }),
    })
  } catch (e) {
    next(e)
  }
}

export async function ensureIsolatedPreview(req, res, next) {
  try {
    const { site, draft } = await loadOwnedDraft(req.user, req.params.siteId)
    const preview = await reviveIsolatedPreview({ user: req.user, site, draft })
    if (!preview.ok) {
      throw aiError(409, preview.message || 'No generated site is available to preview. Build the website first.', {
        code: preview.code || 'PREVIEW_UNAVAILABLE',
      })
    }
    res.json({
      ok: true,
      isolatedPreviewUrl: preview.url,
      isolatedPreviewPort: preview.port,
      reused: Boolean(preview.reused),
    })
  } catch (e) {
    next(e)
  }
}

export async function getAiBuilderState(req, res, next) {
  try {
    const { site, draft } = await loadOwnedDraft(req.user, req.params.siteId)
    const { getBusinessProfile } = await import('../ai-builder/tools/getBusinessProfile.js')
    const profile = await getBusinessProfile({ businessId: site.businessId, ownerId: req.user._id })
    const { AIConversation } = await import('../models/aiBuilderModels.js')
    const conversation = await AIConversation.findOne({ siteId: site._id })
    const messages = conversation ? await recentMessages(conversation._id) : []
    res.json({
      ok: true,
      website: serializeSite(site, draft, { publicId: profile.publicId, publicUrl: profile.publicUrl }),
      profile: stripRaw(profile),
      conversation: conversation
        ? { id: String(conversation._id), messages: messages.map(serializeMessage) }
        : null,
    })
  } catch (e) {
    next(e)
  }
}

export async function getAiBuilderUsage(req, res, next) {
  try {
    const { site } = await loadOwnedDraft(req.user, req.params.siteId)
    const [jobs, rows] = await Promise.all([
      AIJob.find({ siteId: site._id, userId: req.user._id })
        .select('_id input.prompt createdAt status result.usage result.usageModel result.coder')
        .sort({ createdAt: -1 })
        .limit(80)
        .lean(),
      AIUsage.find({ siteId: site._id, userId: req.user._id }).sort({ createdAt: -1 }).limit(500).lean(),
    ])
    const report = groupUsageByPrompt({ jobs, rows })
    res.set('Cache-Control', 'no-store')
    res.json({
      ok: true,
      currency: 'USD',
      rates: MODEL_USD_PER_MILLION,
      summary: report.summary,
      prompts: report.prompts,
    })
  } catch (e) {
    next(e)
  }
}

export async function postAiBuilderMessage(req, res, next) {
  try {
    const referenceImageUrl = sanitizeReferenceImageUrl(req.body?.referenceImageUrl || req.body?.referenceImage?.url)
    let prompt = sanitizeAiText(req.body?.prompt || req.body?.message || '', { max: MAX_USER_PROMPT_CHARS })
    if (!prompt && referenceImageUrl) {
      const section = sectionFromPrompt('', req.body?.selectedElement)
      prompt = section && section !== 'site'
        ? `Match this uploaded design on the ${section} section.`
        : 'Match this uploaded design on the website.'
    }
    if (!prompt) throw aiError(400, 'Tell us what you want to change.')
    // Target section is decided from the prompt — ignore UI selectedElement overrides.
    const scope = analyzeEditScope({
      prompt,
      selectedElement: null,
      hasSite: true,
    })
    let selectedElement = scope.selectedElement || { site: true }
    if (referenceImageUrl) {
      const section = sectionFromPrompt(prompt, selectedElement)
      if (section && section !== 'site') selectedElement = { sectionId: section }
    }
    const business = await assertBusinessOwnership(req.user, req.body?.businessId)
    const { site, draft, conversation, profile } = await getOrCreateWebsiteForBusiness({
      user: req.user,
      business,
    })
    const blankCanvas =
      draft.websiteState?.settings?.hasAiDesign === false || !(draft.websiteState?.sectionOrder || []).length
    const isolated = isIsolatedRuntimeEnabled()
    const mode = isolated
      ? 'ISOLATED_WEBSITE'
      : isFullWebsiteBuildPrompt(prompt) || blankCanvas
        ? 'WEBSITE_BUILD'
        : 'DESIGNER_EDIT'
    const aiUsage = await consumeAiPrompt(site.businessId)
    await appendMessage({
      conversation,
      site,
      userId: req.user._id,
      role: 'user',
      content: prompt,
      metadata: referenceImageUrl ? { referenceImageUrl } : {},
    })
    await maybeSummarize(conversation)
    draft.selectedElement = selectedElement
    await draft.save()
    const job = await enqueueBuilderJob({
      site,
      draft,
      user: req.user,
      conversationId: conversation._id,
      type: mode,
      prompt,
      selectedElement,
      referenceImageUrl,
    })
    res.status(202).json({
      ok: true,
      job: serializeJob(job),
      aiUsage,
      questionsAvoided: profile.missing,
    })
  } catch (e) {
    next(e)
  }
}

export async function getAiJob(req, res, next) {
  try {
    const job = await AIJob.findById(req.params.jobId)
    if (!job) throw aiError(404, 'Job not found.', { code: AiErrorCode.NOT_FOUND })
    await assertSiteOwnership(req.user, job.siteId)
    if (['COMPLETED', 'WAITING_APPROVAL', 'PREVIEW_READY', 'FAILED', 'CANCELLED'].includes(job.status)) {
      const { AIConversation } = await import('../models/aiBuilderModels.js')
      const conversation = await AIConversation.findOne({ siteId: job.siteId })
      if (conversation && ['COMPLETED', 'FAILED'].includes(job.status) && job.result && !job.result.assistantPosted) {
        const text = assistantJobSummary(job)
        await appendMessage({
          conversation,
          site: { _id: job.siteId, businessId: job.businessId },
          userId: req.user._id,
          role: 'assistant',
          content: text,
          jobId: job._id,
          metadata: { status: job.status, suggestions: job.result?.suggestions || [] },
        })
        job.result = { ...job.result, assistantPosted: true }
        await job.save()
      }
    }
    res.set('Cache-Control', 'no-store')
    res.json({ ok: true, job: serializeJob(job) })
  } catch (e) {
    next(e)
  }
}

export async function streamAiJobEvents(req, res, next) {
  try {
    const job = await AIJob.findById(req.params.jobId)
    if (!job) throw aiError(404, 'Job not found.', { code: AiErrorCode.NOT_FOUND })
    await assertSiteOwnership(req.user, job.siteId)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()
    const write = (event) => {
      if (!event) return
      res.write(`event: ${event.type || 'message'}\ndata: ${JSON.stringify(event)}\n\n`)
    }
    for (const event of job.result?.activity || []) write(event)
    const { subscribeTaskEvents } = await import('../../agent/events/bus.js')
    const unsub = subscribeTaskEvents(String(job._id), write)
    const ping = setInterval(() => {
      res.write(`: ping\n\n`)
    }, 15000)
    const close = () => {
      clearInterval(ping)
      unsub()
    }
    req.on('close', close)
    req.on('end', close)
  } catch (e) {
    next(e)
  }
}

export async function cancelAiJob(req, res, next) {
  try {
    const job = await AIJob.findById(req.params.jobId)
    if (!job) throw aiError(404, 'Job not found.', { code: AiErrorCode.NOT_FOUND })
    await assertSiteOwnership(req.user, job.siteId)
    const updated = await cancelJob({ job, user: req.user })
    res.json({ ok: true, job: serializeJob(updated) })
  } catch (e) {
    next(e)
  }
}

export async function cancelActiveAiJobs(req, res, next) {
  try {
    const business = await assertBusinessOwnership(req.user, req.body?.businessId || req.query?.businessId)
    const { site } = await getOrCreateWebsiteForBusiness({ user: req.user, business })
    const cancelled = await abortJobsForSite(site._id)
    res.json({ ok: true, cancelled })
  } catch (e) {
    next(e)
  }
}

export async function patchWebsiteDraft(req, res, next) {
  try {
    const { site, draft } = await loadOwnedDraft(req.user, req.params.siteId)
    const operations = req.body?.operations || req.body?.changeSet?.operations
    if (!Array.isArray(operations) || !operations.length) {
      throw aiError(400, 'No changes to save.')
    }
    const result = await applyChangeSetToDraft({
      site,
      draft,
      operations,
      source: 'manual',
      prompt: req.body?.prompt || 'manual edit',
      userId: req.user._id,
      expectedRevision: req.body?.expectedRevision ?? draft.revisionNumber,
    })
    if (!result.ok) {
      throw aiError(400, 'Those changes are not allowed.', {
        code: AiErrorCode.VALIDATION_FAILED,
        details: { errors: result.errors },
      })
    }
    res.json({
      ok: true,
      revisionNumber: result.draft.revisionNumber,
      websiteState: result.draft.websiteState,
      applied: result.applied,
    })
  } catch (e) {
    next(e)
  }
}

export async function listWebsiteVersions(req, res, next) {
  try {
    const site = await assertSiteOwnership(req.user, req.params.siteId)
    const rows = await WebsiteVersion.find({ siteId: site._id }).sort({ versionNumber: -1 }).limit(50).lean()
    res.json({
      ok: true,
      versions: rows.map((v) => ({
        id: String(v._id),
        versionNumber: v.versionNumber,
        versionType: v.versionType,
        source: v.source,
        prompt: v.prompt,
        createdAt: v.createdAt,
        parentVersionId: v.parentVersionId ? String(v.parentVersionId) : null,
      })),
    })
  } catch (e) {
    next(e)
  }
}

export async function getWebsiteVersion(req, res, next) {
  try {
    const site = await assertSiteOwnership(req.user, req.params.siteId)
    const version = await WebsiteVersion.findOne({ _id: req.params.versionId, siteId: site._id }).lean()
    if (!version) throw aiError(404, 'Version not found.', { code: AiErrorCode.NOT_FOUND })
    res.json({ ok: true, version })
  } catch (e) {
    next(e)
  }
}

export async function compareWebsiteVersions(req, res, next) {
  try {
    const site = await assertSiteOwnership(req.user, req.params.siteId)
    const [a, b] = await Promise.all([
      WebsiteVersion.findOne({ _id: req.params.a, siteId: site._id }).lean(),
      WebsiteVersion.findOne({ _id: req.params.b, siteId: site._id }).lean(),
    ])
    if (!a || !b) throw aiError(404, 'Version not found.', { code: AiErrorCode.NOT_FOUND })
    res.json({ ok: true, changes: friendlyDiff(a.snapshot, b.snapshot) })
  } catch (e) {
    next(e)
  }
}

export async function restoreWebsiteVersion(req, res, next) {
  try {
    const { site, draft } = await loadOwnedDraft(req.user, req.params.siteId)
    const version = await WebsiteVersion.findOne({ _id: req.params.versionId, siteId: site._id })
    if (!version) throw aiError(404, 'Version not found.', { code: AiErrorCode.NOT_FOUND })
    const result = await restoreVersionSnapshot({ site, draft, version, user: req.user })
    res.json({
      ok: true,
      revisionNumber: result.draft.revisionNumber,
      websiteState: result.draft.websiteState,
      version: { id: String(result.version._id), versionNumber: result.version.versionNumber },
    })
  } catch (e) {
    next(e)
  }
}

export async function deleteWebsiteVersionHandler(req, res, next) {
  try {
    const site = await assertSiteOwnership(req.user, req.params.siteId)
    const version = await WebsiteVersion.findOne({ _id: req.params.versionId, siteId: site._id })
    if (!version) throw aiError(404, 'Version not found.', { code: AiErrorCode.NOT_FOUND })
    await deleteWebsiteVersion({ site, version })
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
}

export async function deleteAiBuilderMemory(req, res, next) {
  try {
    const { site } = await loadOwnedDraft(req.user, req.params.siteId)
    const result = await deleteAllAiBuilderMemory({ site, user: req.user })
    res.json({
      ok: true,
      websiteState: result.draft.websiteState,
      draftRevision: result.draft.revisionNumber,
      isolatedPreviewUrl: null,
      isolatedPreviewPort: null,
    })
  } catch (e) {
    next(e)
  }
}

export async function duplicateWebsiteVersion(req, res, next) {
  try {
    const { site, draft } = await loadOwnedDraft(req.user, req.params.siteId)
    const version = await WebsiteVersion.findOne({ _id: req.params.versionId, siteId: site._id })
    if (!version) throw aiError(404, 'Version not found.', { code: AiErrorCode.NOT_FOUND })
    const result = await duplicateVersionSnapshot({ site, draft, version, user: req.user })
    res.json({
      ok: true,
      revisionNumber: result.draft.revisionNumber,
      websiteState: result.draft.websiteState,
      version: { id: String(result.version._id), versionNumber: result.version.versionNumber },
    })
  } catch (e) {
    next(e)
  }
}

export async function publishWebsite(req, res, next) {
  try {
    const { site, draft } = await loadOwnedDraft(req.user, req.params.siteId)
    const key = String(req.headers['idempotency-key'] || req.body?.idempotencyKey || '').slice(0, 80)
    const result = await publishDraft({ site, draft, user: req.user, idempotencyKey: key })
    res.json({
      ok: true,
      replayed: result.replayed,
      publishedVersionId: String(result.version._id),
      versionNumber: result.version.versionNumber,
    })
  } catch (e) {
    next(e)
  }
}

export async function rollbackWebsite(req, res, next) {
  try {
    const { site, draft } = await loadOwnedDraft(req.user, req.params.siteId)
    if (!site.publishedVersionId) throw aiError(400, 'Nothing is published yet.')
    const version = await WebsiteVersion.findById(site.publishedVersionId)
    if (!version) throw aiError(404, 'Published version missing.', { code: AiErrorCode.NOT_FOUND })
    const restored = await restoreVersionSnapshot({ site, draft, version, user: req.user })
    const published = await publishDraft({
      site,
      draft: restored.draft,
      user: req.user,
      idempotencyKey: `rollback:${Date.now()}`,
    })
    res.json({ ok: true, publishedVersionId: String(published.version._id) })
  } catch (e) {
    next(e)
  }
}

export async function listDomains(req, res, next) {
  try {
    const site = await assertSiteOwnership(req.user, req.params.siteId)
    const rows = await WebsiteDomain.find({ siteId: site._id }).sort({ createdAt: -1 }).lean()
    res.json({
      ok: true,
      cnameTarget: getCustomDomainCnameTarget(),
      domains: rows.map(serializeDomain),
    })
  } catch (e) {
    next(e)
  }
}

export async function addDomain(req, res, next) {
  try {
    const site = await assertSiteOwnership(req.user, req.params.siteId)
    const domain = await connectDomain({ site, user: req.user, hostname: req.body?.hostname })
    res.status(201).json({ ok: true, domain: serializeDomain(domain), cnameTarget: getCustomDomainCnameTarget() })
  } catch (e) {
    next(e)
  }
}

export async function verifyDomainHandler(req, res, next) {
  try {
    const site = await assertSiteOwnership(req.user, req.params.siteId)
    const domain = await WebsiteDomain.findOne({ _id: req.params.domainId, siteId: site._id })
    if (!domain) throw aiError(404, 'Domain not found.', { code: AiErrorCode.NOT_FOUND })
    const updated = await verifyDomain({ domain, site })
    res.json({ ok: true, domain: serializeDomain(updated) })
  } catch (e) {
    next(e)
  }
}

export async function deleteDomainHandler(req, res, next) {
  try {
    const site = await assertSiteOwnership(req.user, req.params.siteId)
    const domain = await WebsiteDomain.findOne({ _id: req.params.domainId, siteId: site._id })
    if (!domain) throw aiError(404, 'Domain not found.', { code: AiErrorCode.NOT_FOUND })
    await disconnectDomain({ domain, site })
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
}

export async function getRecommendations(req, res, next) {
  try {
    const { site, draft } = await loadOwnedDraft(req.user, req.params.siteId)
    const { getBusinessProfile } = await import('../ai-builder/tools/getBusinessProfile.js')
    const profile = await getBusinessProfile({ businessId: site.businessId, ownerId: req.user._id })
    const validation = runWebsiteValidation(draft.websiteState, { profile })
    res.json({
      ok: true,
      recommendations: buildRecommendations({ profile, validation, websiteState: draft.websiteState }),
    })
  } catch (e) {
    next(e)
  }
}

export async function getDraftPreviewBundle(req, res, next) {
  try {
    const { draft } = await loadOwnedDraft(req.user, req.params.siteId)
    res.json({
      ok: true,
      engine: 'ai',
      seo: draft.websiteState?.seo || null,
      websiteState: draft.websiteState,
      revisionNumber: draft.revisionNumber,
    })
  } catch (e) {
    next(e)
  }
}

function serializeDomain(d) {
  const o = typeof d.toObject === 'function' ? d.toObject() : d
  return {
    id: String(o._id),
    hostname: o.hostname,
    status: o.status,
    cnameTarget: o.cnameTarget,
    httpsStatus: o.httpsStatus,
    lastError: o.lastError,
    verifiedAt: o.verifiedAt,
  }
}

function stripRaw(profile) {
  if (!profile) return profile
  const { raw, ...rest } = profile
  return rest
}
