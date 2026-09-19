import { readBusinessJson } from '../agents/codingAgent.js'
import { implementIsolatedWorkspace, installAndBuild } from '../jobs/isolatedWebsiteJob.js'
import { executeCoding } from './codingExecutor.js'
import { inspectProject } from './contextEngine.js'
import { ensureWorkspace } from '../workspace/workspaceManager.js'
import { workspaceHasSite } from '../workspace/viteScaffold.js'
import {
  ensureIsolatedPreviewProcess,
  getIsolatedPreview,
  getViaPreviewHint,
  serverSidePreviewUrl,
} from '../preview/previewManager.js'
import { envFlag, isIsolatedRuntimeEnabled } from '../runtimeFlags.js'
import { repairWorkspaceJsx } from '../workspace/fixJsxRuntime.js'
import { listProviderStatus, activeProviderName } from '../providers/aiProvider.js'
import { routeV2Task } from '../openai/modelRouter.js'
import { getUsageContext } from '../openai/usageContext.js'
import { createStateMachine } from './stateMachine.js'
import { analyzeIntent } from './intentAnalyzer.js'
import { readProjectBrain, writeProjectBrain, targetedContext } from './projectBrain.js'
import { indexWorkspace, filesForPrompt } from './projectIndexer.js'
import { writeDesignSystem, designSpecFrom } from './designSystem.js'
import { createCheckpoint, restoreCheckpoint } from './checkpoints.js'
import { parseBuildError, debugPrompt } from './debugger.js'
import { structuralQa, accessibilityQa, seoQa } from './structuralQa.js'
import { browserQa } from './browserQa.js'
import { visualQa, visualRepairPrompt } from './visualQa.js'
import { reviewAgent, completionMessage } from './reviewAgent.js'
import { ActivityLog } from './activityLog.js'
import { planV2 } from './planner.js'
import { authorizeTool } from './toolRegistry.js'
import {
  readLearning,
  buildLearningPromptAppendix,
  summarizeLearning,
} from '../learning/index.js'
import { recordV3Outcome, loadV3Context } from '../v3/memory.js'

function maxDebugAttempts() {
  const n = Number(process.env.AI_MAX_ITERATIONS)
  return Number.isFinite(n) && n > 0 ? Math.min(8, Math.max(1, Math.trunc(n))) : 3
}
const MAX_VISUAL = 1

function requireVisual() {
  return envFlag('AI_REQUIRE_VISUAL_QA')
}

async function progress(onProgress, machine, patch) {
  await onProgress?.({ status: machine.jobStatus(), ...patch })
}

async function runCoderFix({ workspaceDir, prompt, profile, signal, userId, projectId, learningBrief, allowedFiles = null }) {
  return executeCoding({
    workspaceDir,
    prompt,
    profile,
    signal,
    userId,
    projectId,
    learningBrief,
    allowedFiles,
    usageCtx: getUsageContext(),
  })
}

function failResult(fields) {
  return {
    ok: false,
    outcome: 'FAILED',
    code: 'V2_GATE_FAILED',
    v2: true,
    ...fields,
  }
}

export async function runV2WebsiteJob({
  job,
  site,
  draft,
  userId,
  projectId,
  prompt,
  selectedElement,
  websiteState,
  profile,
  signal,
  publicId,
  onProgress,
} = {}) {
  const machine = createStateMachine('IDLE')
  const activity = new ActivityLog()
  const started = Date.now()
  const ownerId = String(userId || job?.userId || '')
  const siteId = String(projectId || site?._id || '')
  const models = {
    classification: routeV2Task('classification'),
    coding: routeV2Task('coding'),
    debugging: routeV2Task('debugging'),
    vision: routeV2Task('vision'),
    review: routeV2Task('review'),
  }

  const bump = async (state, currentStep, progressPct, eventType, message) => {
    machine.transition(state)
    const event = activity.push(eventType, message)
    await progress(onProgress, machine, { currentStep, progress: progressPct, activityEvent: event })
  }

  await bump('ANALYZING', 'understanding', 6, 'TASK_STARTED', 'Task started')
  activity.push('ANALYSIS_STARTED', 'Understanding your request')

  if (!isIsolatedRuntimeEnabled()) {
    return {
      ok: false,
      code: 'ISOLATED_RUNTIME_DISABLED',
      message: 'Set AI_ISOLATED_RUNTIME=1 to generate per-tenant React + Vite workspaces.',
      previewUrl: getViaPreviewHint({ publicId }),
      intent: analyzeIntent(prompt, { hasSite: false }),
      activity: activity.events,
    }
  }

  const loc = await ensureWorkspace({ userId: ownerId, projectId: siteId }).catch(() => null)
  if (!loc) {
    const implemented = await implementIsolatedWorkspace({
      job,
      site,
      draft,
      userId: ownerId,
      projectId: siteId,
      prompt,
      selectedElement,
      websiteState,
      profile,
      signal,
      publicId,
      onProgress,
    })
    if (implemented.code === 'ISOLATED_RUNTIME_DISABLED') return implemented
    return failResult({
      message: implemented.message || 'Could not open an isolated workspace.',
      code: implemented.code || 'WORKSPACE_REQUIRED',
      intent: analyzeIntent(prompt, { hasSite: false }),
      activity: activity.events,
      models,
      durationMs: Date.now() - started,
    })
  }

  const existingBusiness = await readBusinessJson(loc.dir)
  const hasSite = Boolean(existingBusiness) && (await workspaceHasSite(loc.dir))
  const intent = analyzeIntent(prompt, { hasSite })
  const v3 = await loadV3Context({
    workspaceDir: loc.dir,
    prompt,
    category: profile?.identity?.category,
  })
  const learning = v3.site || (await readLearning(loc.dir))
  const learningBrief =
    v3.learningBrief ||
    buildLearningPromptAppendix(learning, {
      prompt,
      intent: intent.type,
      category: profile?.identity?.category,
    })
  const v2plan = planV2({ prompt, profile, websiteState, hasSite, learning, selectedElement })
  await bump('PLANNING', 'planning', 14, 'PLANNING_STARTED', `Intent ${intent.type}`)
  activity.push(
    'PLANNING_COMPLETED',
    `${v2plan.category} · ${(v2plan.sections || []).join(', ')}${v2plan.learnedDirection ? ` · learned:${v2plan.learnedDirection}` : ''}`,
  )

  if (intent.type === 'INSPECT') {
    const inspect = await inspectProject(loc.dir, prompt)
    const h1 = inspect.h1 || {}
    const message = `Homepage is ${inspect.homepage || 'unknown'}. Main H1 is in ${h1.file || 'unknown'} (${h1.via || 'n/a'}): ${h1.text || 'not found'}. No files were modified.`
    await bump('COMPLETED', 'review', 100, 'TASK_COMPLETED', message)
    await progress(onProgress, machine, { currentStep: 'review', progress: 100, stepsDone: true })
    return {
      ok: true,
      outcome: 'COMPLETED',
      inspectOnly: true,
      v2: true,
      message,
      inspect,
      intent,
      activity: activity.events,
      models,
      durationMs: Date.now() - started,
      written: [],
      files: inspect.files || [],
      workspace: { userId: loc.userId, projectId: loc.projectId },
      gates: { code: false, build: false, runtime: false, visual: false, review: true },
      stages: { visual: { status: 'skipped' }, browser: { status: 'skipped' } },
    }
  }

  const toolOk = authorizeTool({
    tool: 'create_checkpoint',
    userId: ownerId,
    projectId: siteId,
    workspaceDir: loc.dir,
  })
  if (toolOk.ok && hasSite) await createCheckpoint(loc.dir, { taskId: job?._id, prompt })

  let implemented
  if (intent.type === 'UNDO' || intent.type === 'RESTORE') {
    activity.push('REPAIR_STARTED', 'Restoring last checkpoint')
    const restored = await restoreCheckpoint(loc.dir)
    if (!restored.ok) {
      machine.transition('FAILED')
      return failResult({
        message: restored.message,
        code: restored.code,
        failedStage: 'REPAIRING',
        intent,
        activity: activity.events,
        models,
        durationMs: Date.now() - started,
      })
    }
    await bump('IMPLEMENTING', 'implement', 40, 'IMPLEMENTATION_STARTED', 'Restoring checkpoint')
    implemented = {
      ok: true,
      loc,
      business: await readBusinessJson(loc.dir),
      plan: v2plan.heuristic,
      coder: { ok: true, coder: 'checkpoint', written: [] },
      scaffold: { ok: true, written: [] },
    }
  } else {
    await bump('DESIGNING', 'design', 28, 'DESIGN_STARTED', 'Researching design practices, CDNs, and libraries')
    await bump('IMPLEMENTING', 'implement', 42, 'IMPLEMENTATION_STARTED', 'Codex / coding agent implementing in the workspace')
    implemented = await implementIsolatedWorkspace({
      job,
      site,
      draft,
      userId: ownerId,
      projectId: siteId,
      prompt,
      selectedElement,
      websiteState,
      profile,
      signal,
      publicId,
      onProgress,
    })
  }

  if (implemented.code === 'ISOLATED_RUNTIME_DISABLED') return implemented
  if (!implemented.ok || !implemented.loc) {
    machine.transition('FAILED')
    activity.push('TASK_FAILED', implemented.message || 'Implementation failed')
    return failResult({
      message: implemented.message || 'Implementation did not write a working workspace.',
      code: implemented.code || 'IMPLEMENT_FAILED',
      failedStage: 'IMPLEMENTING',
      intent,
      activity: activity.events,
      models,
      durationMs: Date.now() - started,
      coder: implemented.coder?.coder,
      openaiSkip: implemented.openaiSkip || null,
      usage: implemented.usage || null,
      usageModel: implemented.usageModel || null,
    })
  }

  const workspaceDir = implemented.loc.dir
  const scopedEdit = Boolean(implemented.editScope && implemented.editScope.scope !== 'site' && implemented.hasSite && !implemented.rebuild)
  const allowedFiles = scopedEdit ? implemented.editScope.files : null
  const spec = designSpecFrom({
    prompt,
    business: implemented.business,
    resources: implemented.resources,
    explore: implemented.explore,
    preserveLook: Boolean(implemented.hasSite && !implemented.rebuild) || scopedEdit,
    research: implemented.research,
    mode: implemented.resourceMode || implemented.explore?.mode,
    novelty: implemented.explore?.novelty,
  })
  const designWrite = await writeDesignSystem(workspaceDir, spec, {
    preserveCss: Boolean(implemented.hasSite && !implemented.rebuild) || scopedEdit,
    preserveTokens: scopedEdit,
  })
  const index = await indexWorkspace(workspaceDir)
  const priorBrain = await readProjectBrain(workspaceDir)
  if (implemented.designResources?.length) {
    activity.push(
      'DESIGN_STARTED',
      `Resources: ${implemented.designResources
        .map((row) => row.name)
        .filter(Boolean)
        .slice(0, 8)
        .join(', ')}`,
    )
  }
  const brain = await writeProjectBrain(workspaceDir, {
    ...priorBrain,
    userId: ownerId,
    projectId: siteId,
    sections: implemented.business?.sections || [],
    components: index.components,
    designSystem: {
      look: spec.look,
      style: spec.style,
      typography: spec.typography,
      animation: spec.animation,
      heroComposition: spec.heroComposition,
      navigation: spec.navigation,
      cardLanguage: spec.cardLanguage,
    },
    designDNA: spec.designDna || implemented.designDna || priorBrain.designDNA || null,
    designResources: implemented.designResources?.length ? implemented.designResources : priorBrain.designResources || [],
    designResearch: implemented.research
      ? {
          live: implemented.research.live,
          queries: implemented.research.queries,
          practices: (implemented.research.practices || []).map((row) => row.id),
          web: (implemented.research.web || []).slice(0, 6).map((row) => ({ title: row.title, url: row.url, source: row.source })),
          at: implemented.research.at,
        }
      : priorBrain.designResearch || null,
    business: {
      name: implemented.business?.name,
      category: implemented.business?.category,
      functionality: implemented.business?.functionality || null,
      source: implemented.business?.source || 'getvia-profile',
    },
    currentTask: { prompt: String(prompt || '').slice(0, 400), intent: intent.type },
    previousTasks: [
      ...(priorBrain.previousTasks || []).slice(-12),
      { prompt: String(prompt || '').slice(0, 200), intent: intent.type, at: new Date().toISOString() },
    ],
    recentChanges: filesForPrompt(index, prompt),
    conversationSummary: `${intent.type}: ${String(prompt || '').slice(0, 240)}`,
    learning: summarizeLearning(learning),
  })

  let debugAttempts = 0
  const maxDebug = maxDebugAttempts()
  await bump('BUILDING', 'build', 62, 'BUILD_STARTED', 'Running npm run build')
  let build = await installAndBuild(workspaceDir, { onProgress, projectId: siteId })
  while (!build.ok && !build.skipped && debugAttempts < maxDebug) {
    debugAttempts += 1
    const error = parseBuildError(build)
    activity.push('BUILD_FAILED', error.message.slice(0, 240))
    machine.transition('DEBUGGING')
    activity.push('DEBUG_STARTED', `Debug attempt ${debugAttempts}/${maxDebug}`)
    await progress(onProgress, machine, { currentStep: 'build', progress: 64 + debugAttempts })
    machine.transition('IMPLEMENTING')
    await runCoderFix({
      workspaceDir,
      prompt: debugPrompt(error, prompt),
      profile,
      signal,
      userId: ownerId,
      projectId: siteId,
      learningBrief,
      allowedFiles,
    })
    machine.transition('BUILDING')
    build = await installAndBuild(workspaceDir, { onProgress, projectId: siteId })
    activity.push('DEBUG_COMPLETED', build.ok ? 'Build recovered' : 'Build still failing')
  }

  const wrapFail = async (failedStage, message, extra = {}) => {
    try {
      machine.transition('FAILED')
    } catch {
      /* already terminal */
    }
    activity.push('TASK_FAILED', `Failed at ${failedStage}`)
    await recordV3Outcome({
      workspaceDir,
      prompt,
      intent: intent.type,
      outcome: 'FAILED',
      designDirection: spec?.style || v2plan?.designDirection || implemented?.explore?.chosen?.direction,
      category: profile?.identity?.category || implemented?.business?.category,
      failedStage,
      errors: [message, ...(extra.errors || [])].filter(Boolean),
      gates: extra.gates || {},
      look: spec?.look,
      files: implemented?.written || implemented?.coder?.written || [],
      siteId,
      ownerId,
    }).catch(() => null)
    await progress(onProgress, machine, {
      currentStep: failedStage === 'REVIEWING' ? 'review' : failedStage === 'VISUAL_TESTING' ? 'qa' : failedStage === 'BUILDING' ? 'build' : 'review',
      progress: 100,
      stepsDone: true,
    })
    const files = (index?.files || []).filter((f) => !f.startsWith('node_modules') && !f.startsWith('dist'))
    return failResult({
      message,
      failedStage,
      intent,
      activity: activity.events,
      models,
      durationMs: Date.now() - started,
      debugAttempts,
      coder: implemented.coder?.coder,
      build,
      workspace: { userId: implemented.loc.userId, projectId: implemented.loc.projectId },
      workspaceDir: implemented.loc?.dir,
      files,
      written: [...(implemented.scaffold?.written || []), ...(implemented.coder?.written || [])],
      websiteState: implemented.websiteState,
      revision: implemented.revision,
      applied: implemented.applied,
      analysis: implemented.analysis,
      suggestions: implemented.suggestions,
      isolatedPreviewUrl: extra.preview?.ok ? extra.preview.url : getIsolatedPreview(siteId)?.url || draft?.isolatedPreviewUrl || null,
      ...extra,
    })
  }

  if (!build.ok) {
    return wrapFail('BUILDING', completionMessage({ review: { approved: false }, failedStage: 'BUILDING', error: build.message }))
  }

  await bump('STARTING_PREVIEW', 'preview', 78, 'PREVIEW_STARTED', 'Starting isolated preview')
  let preview = { ok: false, skipped: true }
  if (!build.skipped) {
    preview = await ensureIsolatedPreviewProcess({
      projectId: siteId,
      workspaceDir,
      preferredPort: draft?.isolatedPreviewPort,
    })
    if (!preview.ok && ['PREVIEW_TIMEOUT', 'PREVIEW_SANDBOX_REQUIRED', 'PREVIEW_NO_PORT', 'PREVIEW_EXITED', 'PREVIEW_CRASH'].includes(preview.code)) {
      preview = { ...preview, skipped: true }
    }
  } else {
    preview = { ok: false, skipped: true, message: 'Preview skipped because workspace npm was skipped.' }
  }
  if (preview.ok) activity.push('PREVIEW_READY', preview.url || 'Preview ready')
  else if (preview.skipped) activity.push('PREVIEW_READY', preview.message || 'Preview not required for this run')
  if (draft) {
    draft.isolatedPreviewUrl = preview.ok ? preview.url : draft.isolatedPreviewUrl || ''
    draft.isolatedPreviewPort = preview.ok ? preview.port : draft.isolatedPreviewPort || null
    await draft.save()
  }

  let visualAttempts = 0
  let structural = structuralQa(implemented.business, { prompt })
  let a11y = accessibilityQa(implemented.business)
  let seo = seoQa(implemented.business)
  let browser = { status: 'skipped', skipped: true, approved: true, ran: false, issues: [], screenshots: [] }
  let visual = visualQa({ browser, structural, spec })

  const runQa = async () => {
    await bump('BROWSER_TESTING', 'qa', 86, 'BROWSER_TEST_STARTED', 'Opening preview in the browser')
    browser = await browserQa({
      previewUrl: serverSidePreviewUrl(preview, siteId),
      workspaceDir,
      fast: true,
      captureScreenshots: requireVisual(),
    })
    if (browser.screenshots?.length) activity.push('SCREENSHOT_CREATED', `${browser.screenshots.length} screenshots`)
    if (browser.console?.length) {
      activity.push('BROWSER_CONSOLE', browser.console.slice(0, 3).join(' · '))
    }
    await bump(
      'VISUAL_TESTING',
      'qa',
      90,
      browser.ran ? 'BROWSER_TEST_FINISHED' : 'VISUAL_QA_SKIPPED',
      browser.ran
        ? browser.approved
          ? 'Browser check passed'
          : browser.message || 'Browser check found issues'
        : browser.message || 'Browser check could not run',
    )
    const latest = await readBusinessJson(workspaceDir)
    structural = structuralQa(latest || implemented.business, { prompt })
    a11y = accessibilityQa(latest || implemented.business)
    seo = seoQa(latest || implemented.business)
    visual = visualQa({ browser, structural, spec })
    if (browser && 'primaryScreenshot' in browser) delete browser.primaryScreenshot
  }

  if (preview.ok) {
    await runQa()
    while (
      !visual.approved &&
      visual.status !== 'unavailable' &&
      visual.status !== 'skipped' &&
      (visual.issues || []).some((issue) => issue.severity === 'high') &&
      visualAttempts < MAX_VISUAL
    ) {
      visualAttempts += 1
      machine.transition('REPAIRING')
      activity.push('VISUAL_QA_FAILED', visual.message)
      activity.push('REPAIR_STARTED', `Fixing preview issues ${visualAttempts}/${MAX_VISUAL}`)
      await progress(onProgress, machine, { currentStep: 'qa', progress: 91 })
      await repairWorkspaceJsx(workspaceDir)
      await runCoderFix({
        workspaceDir,
        prompt: visualRepairPrompt(visual.issues, prompt),
        profile,
        signal,
        userId: ownerId,
        projectId: siteId,
        learningBrief,
        allowedFiles,
      })
      machine.transition('BUILDING')
      build = await installAndBuild(workspaceDir, { onProgress, projectId: siteId })
      if (!build.ok) {
        return wrapFail('BUILDING', build.message, { visualAttempts, preview, visual, browser, structural })
      }
      machine.transition('STARTING_PREVIEW')
      if (!build.skipped) {
        preview = await ensureIsolatedPreviewProcess({
          projectId: siteId,
          workspaceDir,
          preferredPort: preview.port || draft?.isolatedPreviewPort,
        })
      }
      await runQa()
    }
  } else {
    activity.push('BROWSER_TEST_SKIPPED', 'Live preview was not available, so browser checks could not run')
    await bump('BROWSER_TESTING', 'qa', 88, 'BROWSER_TEST_SKIPPED', 'Browser checks need a live preview')
    await bump('VISUAL_TESTING', 'qa', 92, 'VISUAL_QA_SKIPPED', 'Visual QA not run')
    visual = visualQa({ browser, structural, spec })
  }

  await bump('REVIEWING', 'review', 98, 'REVIEW_STARTED', 'Checking quality gates')
  const latestBusiness = (await readBusinessJson(workspaceDir)) || implemented.business
  structural = structuralQa(latestBusiness, { prompt })
  const review = reviewAgent({
    build,
    preview,
    structural,
    visual,
    browser,
    accessibility: a11y,
    seo,
    implement: implemented,
  })

  const files = (index.files || []).filter((f) => !String(f).startsWith('node_modules') && !String(f).startsWith('dist'))
  const fullSuccess = Boolean(review.approved)
  const partial = !fullSuccess && review.buildPass && review.structuralPass && review.visualUnavailable && !requireVisual()
  const previewLive = Boolean(preview.ok) && Boolean(build.ok)

  if (requireVisual() && review.visualUnavailable) {
    return wrapFail(
      'VISUAL_TESTING',
      'Visual QA is required (AI_REQUIRE_VISUAL_QA=1) but Playwright/browser QA was unavailable.',
      { visualAttempts, preview, visual, browser, structural, review },
    )
  }

  if (!fullSuccess && !partial && !previewLive) {
    const failedStage = !build.ok
      ? 'BUILDING'
      : !preview.ok && !preview.skipped
        ? 'STARTING_PREVIEW'
        : visual.status === 'failed'
          ? 'VISUAL_TESTING'
          : 'REVIEWING'
    activity.push('REVIEW_FAILED', review.message)
    return wrapFail(failedStage, completionMessage({ review, preview, failedStage, error: review.message }), {
      visualAttempts,
      preview,
      visual,
      browser,
      structural,
      review,
    })
  }

  machine.transition('COMPLETED')
  const visualFailed = visual.status === 'failed'
  const usableSite = previewLive
  const finalOutcome = fullSuccess || usableSite ? 'SUCCESS' : 'PARTIAL'
  await recordV3Outcome({
    workspaceDir,
    prompt,
    intent: intent.type,
    outcome: finalOutcome,
    designDirection: spec?.style || v2plan?.learnedDirection || v2plan?.designDirection,
    category: profile?.identity?.category || implemented?.business?.category,
    gates: {
      build: review.buildPass,
      runtime: review.runtimePass,
      visual: review.visualPass,
      review: review.approved,
    },
    look: spec?.look,
    errors: visualFailed ? (visual.issues || []).map((i) => i.message || i.code).slice(0, 4) : [],
    files: implemented?.written || implemented?.coder?.written || [],
    siteId,
    ownerId,
  }).catch(() => null)
  activity.push(
    'TASK_COMPLETED',
    fullSuccess
      ? 'Build, runtime, visual QA, and review passed'
      : visualFailed && usableSite
        ? 'Preview is live'
        : visualFailed
          ? 'Preview is live; visual QA still found issues'
          : 'Partial: visual QA unavailable',
  )
  await progress(onProgress, machine, { currentStep: 'review', progress: 100, stepsDone: true })

  const message = fullSuccess
    ? completionMessage({ review, preview })
    : visualFailed && usableSite
      ? 'Preview is live with your latest edits. Keep editing from chat if you want more changes.'
      : completionMessage({ review, preview })

  return {
    ok: true,
    outcome: finalOutcome,
    needsAttention: !fullSuccess && !usableSite,
    code: fullSuccess ? undefined : visualFailed ? 'VISUAL_QA_ISSUES' : 'VISUAL_QA_UNAVAILABLE',
    message,
    intent,
    v2: true,
    stages: {
      build: { ok: build.ok, skipped: Boolean(build.skipped) },
      runtime: { ok: Boolean(preview.ok), skipped: Boolean(preview.skipped) },
      visual: { status: visual.status, approved: Boolean(visual.approved) },
      review: { approved: review.approved, visualUnavailable: review.visualUnavailable },
    },
    gates: {
      build: review.buildPass,
      runtime: review.runtimePass,
      visual: review.visualPass,
      review: review.approved,
    },
    activity: activity.events,
    models,
    context: targetedContext(brain, intent),
    debugAttempts,
    visualAttempts,
    durationMs: Date.now() - started,
    coder: implemented.coder?.coder,
    threadId: implemented.threadId || implemented.coder?.threadId || null,
    usage: implemented.usage || implemented.coder?.usage || null,
    usageModel: implemented.usageModel || implemented.coder?.model || null,
    openaiSkip: implemented.openaiSkip || null,
    build,
    preview,
    isolatedPreviewUrl: preview.ok ? preview.url : null,
    workspace: { userId: implemented.loc.userId, projectId: implemented.loc.projectId },
    workspaceDir: implemented.loc?.dir,
    files,
    written: [...new Set([...(implemented.written || []), ...(implemented.scaffold?.written || []), ...(implemented.coder?.written || []), ...(designWrite.written || [])])],
    plan: {
      themePreset: implemented.plan?.themePreset,
      sections: implemented.plan?.sections || v2plan?.sections,
      designDirection: v2plan?.designDirection,
      learnedDirection: v2plan?.learnedDirection || null,
    },
    previewUrl: preview.ok ? preview.url : getViaPreviewHint({ publicId }),
    providers: listProviderStatus(),
    provider: activeProviderName(),
    websiteState: implemented.websiteState,
    revision: implemented.revision,
    applied: [
      ...(implemented.applied || []),
      ...(designWrite.written || []).map((file) => ({ type: 'FILE_UPDATED', summary: `Updated ${file}` })),
    ].filter((row, i, all) => all.findIndex((x) => (x.summary || x.type) === (row.summary || row.type)) === i),
    analysis: implemented.analysis,
    suggestions: implemented.suggestions,
    websiteSync: implemented.websiteSync,
    structural,
    visual,
    browser,
    review,
    design: spec,
    designResources: implemented.designResources || [],
    designResearch: implemented.research || null,
    learning: summarizeLearning(await readLearning(workspaceDir).catch(() => null)),
  }
}
