import { USER_FACING_STEPS, getMaxRepairAttempts } from './constants.js'
import { requirementAgent } from './agents/requirementAgent.js'
import { plannerAgent } from './agents/plannerAgent.js'
import { designAgent } from './agents/designAgent.js'
import { contentAgent } from './agents/contentAgent.js'
import { assetAgent } from './agents/assetAgent.js'
import { functionalityAgent } from './agents/functionalityAgent.js'
import { seoAgent } from './agents/seoAgent.js'
import { designerAgent } from './agents/designerAgent.js'
import { repairFromValidation } from './agents/repairAgent.js'
import { applyChangeSetToDraft, validateAndStore } from './changeset/applyToDraft.js'
import { aiError, AiErrorCode } from './errors.js'
import { isFullWebsiteBuildPrompt, isSiteWideChangePrompt } from './mutations/interpretDesignerRequest.js'
import { isExecutableOperation } from './state/changeSet.schema.js'

function stepState(key, status) {
  return USER_FACING_STEPS.map((s) => ({
    ...s,
    status: s.key === key ? status : undefined,
  }))
}

export async function runWebsiteBuild({ job, site, draft, profile, prompt, signal, onProgress, userId }) {
  const usageCtx = { userId, businessId: site.businessId, siteId: site._id, jobId: job._id }
  const throwIfCancelled = async () => {
    if (signal?.aborted || job.cancelRequested) {
      throw aiError(409, 'This request was stopped.', { code: AiErrorCode.JOB_CANCELLED })
    }
  }

  await onProgress({ status: 'ANALYZING', progress: 10, currentStep: 'understanding' })
  await throwIfCancelled()
  const requirements = await requirementAgent({
    prompt,
    profile,
    usageCtx,
    signal,
    websiteState: draft.websiteState,
  })

  await onProgress({ status: 'ANALYZING', progress: 25, currentStep: 'profile' })
  await throwIfCancelled()

  await onProgress({ status: 'PLANNING', progress: 40, currentStep: 'planning' })
  const plan = await plannerAgent({
    profile,
    requirements,
    currentState: draft.websiteState,
    usageCtx,
    signal,
  })

  await onProgress({ status: 'EXECUTING', progress: 55, currentStep: 'design' })
  await throwIfCancelled()
  const design = designAgent({ plan, state: draft.websiteState, requirements })
  const content = await contentAgent({ profile, requirements, usageCtx, signal })
  await onProgress({ status: 'BUILDING', progress: 70, currentStep: 'content' })
  const assets = assetAgent({ profile })
  const functions = functionalityAgent({ profile, requirements })
  const seo = seoAgent({ profile, state: draft.websiteState })

  const operations = [
    ...design.operations,
    ...content.operations,
    ...assets.operations,
    ...functions.operations,
    ...seo.operations,
  ].filter((op) => isExecutableOperation(op))

  await onProgress({ status: 'BUILDING', progress: 80, currentStep: 'assets' })
  const applied = await applyChangeSetToDraft({
    site,
    draft,
    operations,
    source: 'ai',
    jobId: job._id,
    prompt,
    userId,
    expectedRevision: draft.revisionNumber,
  })
  if (!applied.ok) {
    return {
      ok: false,
      requirements,
      plan,
      errors: applied.errors,
      notices: functions.notices,
    }
  }

  await onProgress({ status: 'VALIDATING', progress: 88, currentStep: 'validate' })
  let { report } = await validateAndStore({ site, draft, profile, jobId: job._id })
  let repairAttempts = 0
  const maxRepair = getMaxRepairAttempts()
  while (!report.passed && repairAttempts < maxRepair) {
    await throwIfCancelled()
    await onProgress({ status: 'REPAIRING', progress: 90, currentStep: 'validate' })
    const repair = repairFromValidation(draft.websiteState, report)
    if (!repair.operations.length) break
    await applyChangeSetToDraft({
      site,
      draft,
      operations: repair.operations,
      source: 'system',
      jobId: job._id,
      prompt: 'auto-repair',
      userId,
      expectedRevision: draft.revisionNumber,
    })
    repairAttempts += 1
    report = (await validateAndStore({ site, draft, profile, jobId: job._id })).report
  }

  await onProgress({ progress: 100, currentStep: 'preview' })
  draft.requirements = requirements
  draft.unresolvedQuestions = requirements.unresolvedQuestions || []
  await draft.save()

  return {
    ok: report.passed || repairAttempts >= 0,
    requirements,
    plan,
    validation: report,
    repairAttempts,
    notices: functions.notices,
    applied: applied.applied,
    questions: requirements.unresolvedQuestions || [],
    needsAttention: !report.passed,
    websiteState: draft.websiteState,
    revision: draft.revisionNumber,
    outcome: report.passed ? 'SUCCESS' : 'PARTIAL_SUCCESS',
    analysis: requirements.analysis,
    suggestions: requirements.suggestedPrompts || [],
    message:
      requirements.analysis?.summary ||
      'Your original one-page website is ready. Review the preview, then publish when you are happy.',
  }
}

export async function runDesignerEdit({ job, site, draft, profile, prompt, selectedElement, signal, onProgress, userId, incremental = false }) {
  if (
    !incremental &&
    (isFullWebsiteBuildPrompt(prompt) || (draft.websiteState?.settings?.hasAiDesign === false && isSiteWideChangePrompt(prompt)))
  ) {
    return runWebsiteBuild({ job, site, draft, profile, prompt, signal, onProgress, userId })
  }
  const usageCtx = { userId, businessId: site.businessId, siteId: site._id, jobId: job._id }
  await onProgress({ status: 'ANALYZING', progress: 20, currentStep: 'understanding' })
  const agent = await designerAgent({
    prompt,
    selectedElement,
    profile,
    currentState: draft.websiteState,
    usageCtx,
    signal,
  })
  const debug = {
    userRequest: prompt,
    intent: agent.intent,
    resolvedTarget: agent.resolvedTargets?.[0] || selectedElement,
    changeSet: agent.operations,
    outcome: agent.outcome,
    analysis: agent.analysis,
  }
  if (!agent.operations?.length) {
    if (agent.outcome === 'REROUTE_WEBSITE_BUILD') {
      return runWebsiteBuild({ job, site, draft, profile, prompt, signal, onProgress, userId })
    }
    await onProgress({ progress: 100, currentStep: 'preview' })
    return {
      ok: false,
      outcome: 'FAILED',
      code: 'NO_CHANGE_APPLIED',
      applied: [],
      operationsRequested: agent.operations?.length || 0,
      operationsApplied: 0,
      message: agent.message || 'I could not change the website. Nothing was saved.',
      websiteState: draft.websiteState,
      revision: draft.revisionNumber,
      analysis: agent.analysis,
      suggestions: agent.suggestions || [],
      debug: { ...debug, validation: 'SKIPPED', mutation: 'NONE' },
    }
  }
  await onProgress({ status: 'EXECUTING', progress: 70, currentStep: 'design' })
  const applied = await applyChangeSetToDraft({
    site,
    draft,
    operations: agent.operations,
    source: 'ai',
    jobId: job._id,
    prompt,
    userId,
    expectedRevision: draft.revisionNumber,
  })
  if (!applied.ok) {
    await onProgress({ progress: 100, currentStep: 'preview' })
    return {
      ok: false,
      outcome: 'FAILED',
      code: applied.code || 'NO_CHANGE_APPLIED',
      applied: [],
      errors: applied.errors,
      message: "Those changes could not be applied, so the website was left as it was.",
      websiteState: draft.websiteState,
      revision: draft.revisionNumber,
      debug: { ...debug, validation: 'FAIL', mutation: 'ROLLED_BACK', errors: applied.errors },
    }
  }
  if (!applied.applied?.length) {
    await onProgress({ progress: 100, currentStep: 'preview' })
    return {
      ok: false,
      outcome: 'FAILED',
      code: applied.code || 'NO_CHANGE_APPLIED',
      applied: [],
      operationsRequested: agent.operations.length,
      operationsApplied: 0,
      affectedComponents: [],
      previousRevision: draft.revisionNumber,
      newRevision: draft.revisionNumber,
      message: 'I understood the request but no website fields changed. Nothing was saved.',
      websiteState: draft.websiteState,
      revision: draft.revisionNumber,
      debug: { ...debug, validation: 'PASS', mutation: 'EMPTY' },
    }
  }
  await onProgress({ progress: 100, currentStep: 'preview' })
  const summaries = applied.applied.map((row) => row.summary).filter(Boolean)
  const previousRevision = draft.revisionNumber - 1
  return {
    ok: true,
    outcome: 'SUCCESS',
    success: true,
    operationsRequested: agent.operations.length,
    operationsApplied: applied.applied.length,
    affectedComponents: applied.applied.map((row) => row.componentId).filter(Boolean),
    previousRevision,
    newRevision: applied.draft.revisionNumber,
    applied: applied.applied,
    websiteState: applied.draft.websiteState,
    revision: applied.draft.revisionNumber,
    changeSetId: applied.changeSetId,
    analysis: agent.analysis,
    suggestions: agent.suggestions || [],
    message: agent.message || `Done — ${summaries.join('; ')}.`,
    debug: {
      ...debug,
      validation: 'PASS',
      mutation: 'SUCCESS',
      newRevision: applied.draft.revisionNumber,
      changesApplied: applied.applied,
    },
  }
}

export { stepState }
