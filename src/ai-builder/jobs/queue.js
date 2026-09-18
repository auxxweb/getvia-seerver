import { AIConversation, AIJob, WebsiteDraft } from '../../models/aiBuilderModels.js'
import { AI_JOB_STATUSES, USER_FACING_STEPS, V2_USER_FACING_STEPS, getMaxAiJobsPerDay, getStaleAiJobMs, resolveUserFacingStep } from '../constants.js'
import { newCorrelationId, aiError, AiErrorCode } from '../errors.js'
import { runDesignerEdit, runWebsiteBuild } from '../orchestrator.js'
import { runIsolatedWebsiteJob } from '../jobs/isolatedWebsiteJob.js'
import { getBusinessProfile } from '../tools/getBusinessProfile.js'
import { persistIsolatedDraft } from '../workspace/persistIsolatedDraft.js'
import { workspacePathFor } from '../workspace/workspaceManager.js'
import { appendMessage, assistantJobSummary } from '../memory/conversation.js'
import { isAgentRuntimeEnabled } from '../runtimeFlags.js'
import { runGetviaWebsiteJob } from '../../../agent/getvia/job.js'
import { publishTaskEvent } from '../../../agent/events/bus.js'
import { runWithUsageContext } from '../openai/usageContext.js'
import {
  TERMINAL_JOB_STATUSES,
  isMutatingStatus,
  markJobStarted,
  markJobStopped,
  orphanAction,
  sanitizeProgressPatch,
} from './jobLifecycle.js'

const abortByJob = new Map()
const TERMINAL_STATUSES = TERMINAL_JOB_STATUSES

export { isMutatingStatus }

function stepCatalog(type) {
  return type === 'ISOLATED_WEBSITE' ? V2_USER_FACING_STEPS : USER_FACING_STEPS
}

function initialSteps(type) {
  return stepCatalog(type).map((s) => ({ ...s, status: 'pending' }))
}

function hasLiveRunner(jobId) {
  return abortByJob.has(String(jobId))
}

async function clearDraftMutation(siteId) {
  await WebsiteDraft.updateMany({ siteId, mutatingJobId: { $ne: null } }, { $set: { mutatingJobId: null } })
}

export async function reapStaleJobs(siteId) {
  const cutoff = new Date(Date.now() - getStaleAiJobMs())
  const stale = await AIJob.find({
    siteId,
    status: { $nin: TERMINAL_STATUSES },
    $or: [{ startedAt: { $lte: cutoff } }, { startedAt: null, createdAt: { $lte: cutoff } }, { updatedAt: { $lte: cutoff } }],
  })
  let reaped = 0
  for (const job of stale) {
    if (!isMutatingStatus(job.status)) continue
    markJobStopped(job, { message: 'This AI update was stopped because it was stuck.' })
    await job.save()
    abortByJob.get(String(job._id))?.abort()
    abortByJob.delete(String(job._id))
    reaped += 1
  }
  if (reaped) await clearDraftMutation(siteId)
  return reaped
}

export async function recoverOrphanedJobs(siteId) {
  await reapStaleJobs(siteId)
  const jobs = await AIJob.find({
    siteId,
    status: { $nin: TERMINAL_STATUSES },
  }).sort({ createdAt: 1, _id: 1 })
  let live = false
  let resumed = 0
  let cancelled = 0
  for (const job of jobs) {
    const action = orphanAction(job, { hasRunner: hasLiveRunner(job._id) })
    if (action === 'running') {
      live = true
      continue
    }
    if (action === 'resume') {
      if (live) continue
      job.startedAt = job.startedAt || new Date()
      await job.save()
      const draft = await WebsiteDraft.findOne({ siteId })
      if (draft) {
        draft.mutatingJobId = job._id
        await draft.save()
      }
      startJobRunner(job._id)
      live = true
      resumed += 1
      continue
    }
    if (action === 'cancel') {
      markJobStopped(job, { message: 'This AI update was interrupted. Send the prompt again.' })
      await job.save()
      abortByJob.get(String(job._id))?.abort()
      abortByJob.delete(String(job._id))
      cancelled += 1
    }
  }
  if (!live) {
    await clearDraftMutation(siteId)
    await startNextQueuedJob(siteId)
  }
  return { resumed, cancelled, live }
}

export async function assertNoActiveMutation(siteId) {
  await recoverOrphanedJobs(siteId)
  const active = await AIJob.findOne({
    siteId,
    status: { $nin: TERMINAL_STATUSES },
  }).sort({ createdAt: -1 })
  if (active && isMutatingStatus(active.status)) {
    throw aiError(409, 'Another AI update is still running. Wait or cancel it first.', {
      code: AiErrorCode.JOB_IN_PROGRESS,
      retryable: true,
      recoveryAction: 'CANCEL',
      details: { jobId: String(active._id) },
    })
  }
  return active
}

export async function getActiveJobForSite(siteId) {
  await recoverOrphanedJobs(siteId)
  const active = await AIJob.findOne({
    siteId,
    status: { $nin: TERMINAL_STATUSES },
  }).sort({ createdAt: -1 })
  if (active && isMutatingStatus(active.status)) return active
  return null
}

export async function assertDailyJobCap(userId) {
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  const count = await AIJob.countDocuments({ userId, createdAt: { $gte: start } })
  if (count >= getMaxAiJobsPerDay()) {
    throw aiError(429, 'Daily AI limit reached. Try again tomorrow.', {
      code: AiErrorCode.RATE_LIMIT,
      retryable: false,
      recoveryAction: 'WAIT',
    })
  }
}

function startJobRunner(jobId) {
  const id = String(jobId)
  if (abortByJob.has(id)) return
  abortByJob.set(id, new AbortController())
  setImmediate(() => {
    runJob(jobId).catch((err) => {
      console.error('[ai-builder] job crashed', String(jobId), err)
    })
  })
}

async function startNextQueuedJob(siteId, justFinishedId) {
  const next = await AIJob.findOne({
    siteId,
    status: 'QUEUED',
    ...(justFinishedId ? { _id: { $ne: justFinishedId } } : {}),
  }).sort({ createdAt: 1, _id: 1 })
  if (!next) return null
  next.startedAt = next.startedAt || new Date()
  await next.save()
  const draft = await WebsiteDraft.findOne({ siteId })
  if (draft) {
    draft.mutatingJobId = next._id
    await draft.save()
  }
  startJobRunner(next._id)
  return next
}

export async function enqueueBuilderJob({
  site,
  draft,
  user,
  conversationId,
  type,
  prompt,
  selectedElement = null,
  referenceImageUrl = '',
}) {
  await assertDailyJobCap(user._id)
  await recoverOrphanedJobs(site._id)
  const job = await AIJob.create({
    siteId: site._id,
    businessId: site.businessId,
    userId: user._id,
    conversationId,
    type,
    status: 'QUEUED',
    progress: 0,
    currentStep: 'understanding',
    userFacingSteps: initialSteps(type),
    input: { prompt, selectedElement, referenceImageUrl: referenceImageUrl || '', routedBy: 'v3' },
    modelTier: 'medium',
    model: '',
    correlationId: newCorrelationId(),
    startedAt: null,
  })
  const first = await AIJob.findOne({
    siteId: site._id,
    status: { $nin: TERMINAL_STATUSES },
  }).sort({ createdAt: 1, _id: 1 })
  if (first && String(first._id) !== String(job._id)) return job
  job.startedAt = new Date()
  await job.save()
  draft.mutatingJobId = job._id
  await draft.save()
  startJobRunner(job._id)
  return job
}

export async function cancelJob({ job, user }) {
  if (job.userId.toString() !== user._id.toString() && user.role !== 'SUPER_ADMIN') {
    throw aiError(403, 'Not your job.', { code: AiErrorCode.FORBIDDEN })
  }
  const siteId = job.siteId
  const jobId = job._id
  if (isMutatingStatus(job.status) || job.status === 'QUEUED' || !TERMINAL_STATUSES.includes(job.status)) {
    markJobStopped(job, { message: 'This AI update was stopped.' })
  }
  await job.save()
  abortByJob.get(String(jobId))?.abort()
  abortByJob.delete(String(jobId))
  await clearDraftMutation(siteId)
  await startNextQueuedJob(siteId, jobId)
  return job
}

export async function abortJobsForSite(siteId, { includeIdle = false } = {}) {
  const jobs = await AIJob.find({
    siteId,
    status: { $nin: TERMINAL_STATUSES },
  })
  for (const job of jobs) {
    if (
      !includeIdle &&
      !isMutatingStatus(job.status) &&
      ['PREVIEW_READY', 'WAITING_APPROVAL'].includes(job.status)
    ) {
      continue
    }
    markJobStopped(job, { message: 'This AI update was stopped.' })
    await job.save()
    abortByJob.get(String(job._id))?.abort()
    abortByJob.delete(String(job._id))
  }
  await clearDraftMutation(siteId)
  return jobs.length
}

async function runJob(jobId) {
  const job = await AIJob.findById(jobId)
  if (!job) {
    abortByJob.delete(String(jobId))
    return
  }
  if (job.status === 'CANCELLED' || job.cancelRequested) {
    abortByJob.delete(String(job._id))
    await startNextQueuedJob(job.siteId, job._id)
    return
  }
  const ctrl = abortByJob.get(String(job._id)) || new AbortController()
  abortByJob.set(String(job._id), ctrl)
  if (job.status === 'QUEUED') {
    markJobStarted(job, { steps: stepCatalog(job.type) })
    await job.save()
  }
  const draft = await WebsiteDraft.findOne({ siteId: job.siteId })
  const { Website } = await import('../../models/aiBuilderModels.js')
  const site = await Website.findById(job.siteId)
  let heart
  try {
    const profile = await getBusinessProfile({ businessId: job.businessId, ownerId: job.userId })
    heart = setInterval(() => {
      AIJob.updateOne(
        { _id: job._id, status: { $nin: TERMINAL_STATUSES } },
        { $set: { updatedAt: new Date() } },
      ).catch(() => {})
    }, 2500)
    const onProgress = async (patch) => {
      const fresh = await AIJob.findById(job._id)
      if (fresh?.cancelRequested) ctrl.abort()
      const nextPatch = sanitizeProgressPatch(patch, job.type)
      const { activityEvent, stepsDone, ...persist } = nextPatch
      Object.assign(job, persist)
      if (stepsDone) {
        job.userFacingSteps = stepCatalog(job.type).map((s) => ({ ...s, status: 'done' }))
      } else if (patch.currentStep) {
        const catalog = stepCatalog(job.type)
        const currentKey = resolveUserFacingStep(job.type, patch.currentStep)
        job.userFacingSteps = catalog.map((s) => {
          const keys = catalog.map((x) => x.key)
          const currentIdx = keys.indexOf(currentKey)
          const idx = keys.indexOf(s.key)
          let status = 'pending'
          if (idx < currentIdx) status = 'done'
          else if (idx === currentIdx) status = 'active'
          return { ...s, status }
        })
      }
      if (patch.activityEvent || patch.agent) {
        const prev = Array.isArray(job.result?.activity) ? job.result.activity : []
        job.result = {
          ...(job.result && typeof job.result === 'object' ? job.result : {}),
          activity: patch.activityEvent ? [...prev, patch.activityEvent].slice(-80) : prev,
          agent: patch.agent || job.result?.agent || null,
        }
        if (patch.activityEvent) publishTaskEvent(String(job._id), patch.activityEvent)
      }
      await job.save()
    }
    let result
    const runTracked = (fn) =>
      runWithUsageContext(
        {
          userId: job.userId,
          businessId: job.businessId,
          siteId: job.siteId,
          jobId: job._id,
          prompt: job.input?.prompt,
        },
        fn,
      )
    if (job.type === 'ISOLATED_WEBSITE') {
      result = await runTracked(() =>
        isAgentRuntimeEnabled()
          ? runGetviaWebsiteJob({
              userId: job.userId,
              projectId: String(site._id),
              businessId: job.businessId,
              prompt: job.input?.prompt,
              signal: ctrl.signal,
              onProgress,
              site,
              draft,
              keepPreview: true,
              jobId: String(job._id),
              fetchProfile: async () => {
                const copy = { ...(profile || {}) }
                delete copy.raw
                return copy
              },
            })
          : runIsolatedWebsiteJob({
              job,
              site,
              draft,
              profile,
              prompt: job.input?.prompt,
              selectedElement: job.input?.selectedElement,
              signal: ctrl.signal,
              onProgress,
              userId: job.userId,
              projectId: String(site._id),
              publicId: profile?.publicId,
              websiteState: draft?.websiteState,
            }),
      )
    } else if (job.type === 'DESIGNER_EDIT') {
      result = await runTracked(() =>
        runDesignerEdit({
          job,
          site,
          draft,
          profile,
          prompt: job.input?.prompt,
          selectedElement: job.input?.selectedElement,
          signal: ctrl.signal,
          onProgress,
          userId: job.userId,
        }),
      )
    } else {
      result = await runTracked(() =>
        runWebsiteBuild({
          job,
          site,
          draft,
          profile,
          prompt: job.input?.prompt,
          signal: ctrl.signal,
          onProgress,
          userId: job.userId,
        }),
      )
    }
    const latest = await AIJob.findById(job._id)
    if (latest?.cancelRequested || latest?.status === 'CANCELLED' || job.cancelRequested) {
      markJobStopped(job, { message: 'This AI update was stopped.' })
      job.completedAt = new Date()
      await job.save()
      return
    }
    if (
      job.type === 'ISOLATED_WEBSITE' &&
      draft &&
      latest &&
      !latest.cancelRequested &&
      !result.saved &&
      result.ok &&
      result.outcome !== 'FAILED'
    ) {
      try {
        const loc = workspacePathFor({ userId: String(job.userId), projectId: String(job.siteId) })
        const saved = await persistIsolatedDraft({
          site,
          draft,
          workspaceDir: result.workspaceDir || loc.dir,
          userId: job.userId,
          prompt: job.input?.prompt,
          jobId: job._id,
          preview: result.preview,
        })
        if (saved.ok) {
          result.revision = saved.revision
          result.saved = true
          result.websiteState = draft.websiteState
        }
      } catch (err) {
        console.error('[ai-builder] auto-save failed', String(job._id), err?.message || err)
      }
    }
    const isolatedChanged = Boolean(result.v2 || result.written?.length || result.isolatedPreviewUrl || result.saved)
    if (!result.ok || result.outcome === 'FAILED' || (result.code === 'NO_CHANGE_APPLIED' && !isolatedChanged)) {
      job.status = 'FAILED'
      job.progress = 100
      job.currentStep = ''
      job.userFacingSteps = stepCatalog(job.type).map((s) => ({ ...s, status: 'done' }))
      job.error = {
        code: result.code || 'NO_CHANGE_APPLIED',
        message: result.message || 'No website change was applied.',
      }
      job.result = {
        ok: false,
        outcome: 'FAILED',
        code: result.code || 'NO_CHANGE_APPLIED',
        applied: result.applied || [],
        operationsRequested: result.operationsRequested,
        operationsApplied: result.operationsApplied || 0,
        message: result.message,
        websiteState: result.websiteState,
        revision: result.revision,
        analysis: result.analysis,
        suggestions: result.suggestions,
        debug: result.debug,
        isolatedPreviewUrl: result.isolatedPreviewUrl,
        v2: result.v2,
        saved: Boolean(result.saved),
        intent: result.intent,
        activity: result.activity,
        stages: result.stages,
        gates: result.gates,
        failedStage: result.failedStage,
        review: result.review,
        visual: result.visual,
        usage: result.usage || null,
        usageModel: result.usageModel || null,
        coder: result.coder,
        build: result.build
          ? { ok: result.build.ok, skipped: result.build.skipped, message: result.build.message, code: result.build.code }
          : undefined,
      }
    } else {
      job.status = result.needsAttention ? 'WAITING_APPROVAL' : 'COMPLETED'
      job.progress = 100
      job.currentStep = ''
      job.userFacingSteps = stepCatalog(job.type).map((s) => ({ ...s, status: 'done' }))
      job.result = {
        ok: result.ok,
        outcome: result.outcome || (result.ok ? 'SUCCESS' : 'FAILED'),
        v2: result.v2,
        intent: result.intent,
        activity: result.activity,
        stages: result.stages,
        gates: result.gates,
        review: result.review,
        visual: result.visual,
        questions: result.questions,
        notices: result.notices,
        applied: result.applied,
        operationsRequested: result.operationsRequested,
        operationsApplied: result.operationsApplied,
        affectedComponents: result.affectedComponents,
        previousRevision: result.previousRevision,
        newRevision: result.newRevision,
        needsAttention: result.needsAttention,
        validation: result.validation,
        message: result.message,
        websiteState: result.websiteState,
        revision: result.revision,
        analysis: result.analysis,
        suggestions: result.suggestions,
        debug: result.debug,
        isolatedPreviewUrl: result.isolatedPreviewUrl,
        written: result.written || [],
        saved: Boolean(result.saved),
        coder: result.coder,
        usage: result.usage || null,
        usageModel: result.usageModel || null,
        workspace: result.workspace,
        files: result.files,
        build: result.build
          ? { ok: result.build.ok, skipped: result.build.skipped, message: result.build.message, code: result.build.code }
          : undefined,
        preview: result.preview
          ? { ok: result.preview.ok, url: result.preview.url, code: result.preview.code, message: result.preview.message }
          : undefined,
        plan: result.plan
          ? {
              engine: 'ai',
              layout: 'one-page',
              themePreset: result.plan.themePreset,
              sections: (result.plan.sections || []).map((s) => s.type || s.id),
            }
          : undefined,
      }
    }
    job.completedAt = new Date()
    await job.save()
    if (
      job.conversationId &&
      job.result &&
      !job.result.assistantPosted &&
      ['COMPLETED', 'FAILED', 'WAITING_APPROVAL'].includes(job.status)
    ) {
      const conversation = await AIConversation.findById(job.conversationId)
      if (conversation) {
        await appendMessage({
          conversation,
          site: { _id: job.siteId, businessId: job.businessId },
          userId: job.userId,
          role: 'assistant',
          content: assistantJobSummary(job),
          jobId: job._id,
          metadata: { status: job.status, suggestions: job.result?.suggestions || [], saved: Boolean(job.result?.saved) },
        })
        job.result = { ...job.result, assistantPosted: true }
        await job.save()
      }
    }
  } catch (err) {
    const latest = await AIJob.findById(job._id)
    const cancelled = Boolean(latest?.cancelRequested || job.cancelRequested || latest?.status === 'CANCELLED')
    if (cancelled) {
      markJobStopped(job, { message: 'This AI update was stopped.' })
    } else {
      job.status = 'FAILED'
      job.currentStep = ''
      job.userFacingSteps = (job.userFacingSteps || []).map((s) => ({
        ...(typeof s.toObject === 'function' ? s.toObject() : s),
        status: 'done',
      }))
      job.error = {
        code: err.code || 'AI_ERROR',
        message: err.message || 'AI job failed',
        retryable: Boolean(err.retryable),
        recoveryAction: err.recoveryAction || 'RETRY',
        correlationId: job.correlationId,
      }
      job.completedAt = new Date()
    }
    await job.save()
  } finally {
    if (heart) clearInterval(heart)
    abortByJob.delete(String(job._id))
    if (draft) {
      draft.mutatingJobId = null
      await draft.save()
    }
    await startNextQueuedJob(job.siteId, job._id)
  }
}

export function serializeJob(job) {
  if (!job) return null
  const o = typeof job.toObject === 'function' ? job.toObject() : job
  return {
    jobId: String(o._id),
    type: o.type,
    status: o.status,
    progress: o.progress,
    currentStep: o.currentStep,
    userFacingSteps: o.userFacingSteps,
    result: o.result,
    error: o.error,
    cancelRequested: o.cancelRequested,
    correlationId: o.correlationId,
    modelTier: o.modelTier || o.input?.speed || null,
    model: o.model || o.input?.model || null,
    provider: o.input?.provider || null,
    input: {
      prompt: o.input?.prompt || '',
      selectedElement: o.input?.selectedElement || null,
      referenceImageUrl: o.input?.referenceImageUrl || '',
    },
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    completedAt: o.completedAt,
  }
}

export { AI_JOB_STATUSES }
