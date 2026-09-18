import fs from 'node:fs/promises'
import path from 'node:path'
import { readBusinessJson, isRebuildPrompt, persistMerge, heuristicSufficient } from '../agents/codingAgent.js'
import { ensureWorkspace, writeWorkspaceFile } from '../workspace/workspaceManager.js'
import { applyWorkspaceFiles, listWorkspaceFiles } from '../workspace/projectFiles.js'
import { inspectWorkspaceBuild } from '../validation/isolatedBuild.js'
import { isEsbuildIpcCrash } from '../validation/buildError.js'
import { startIsolatedPreviewProcess, getViaPreviewHint, stopIsolatedPreview } from '../preview/previewManager.js'
import { runWorkspaceCommand } from '../workspace/runCommand.js'
import { isIsolatedRuntimeEnabled, shouldRunWorkspaceNpm, skipWebsiteStateSync } from '../runtimeFlags.js'
import {
  ensureOpenAiAvailability,
  isCreditsExhaustedResult,
  openAiSkipReason,
  OPENAI_QUOTA_MESSAGE,
  shouldSkipOpenAiLlm,
} from '../openai/availability.js'
import { listProviderStatus, activeProviderName } from '../providers/aiProvider.js'
import { isFullWebsiteBuildPrompt } from '../mutations/interpretDesignerRequest.js'
import { runDesignerEdit, runWebsiteBuild } from '../orchestrator.js'
import { planWebsiteHeuristic } from '../agents/plannerAgent.js'
import { analyzeRequirementsHeuristic, requirementAgent } from '../agents/requirementAgent.js'
import { writeViteScaffold, businessJsonFrom, workspaceHasSite } from '../workspace/viteScaffold.js'
import { isHeroLayoutPrompt, patchPremiumSplitHero } from '../workspace/heroLayout.js'
import { executeCoding } from '../v2/codingExecutor.js'
import { repairWorkspaceJsx } from '../workspace/fixJsxRuntime.js'
import { analyzeIntent } from '../v2/intentAnalyzer.js'
import { readProjectBrain } from '../v2/projectBrain.js'
import { selectAndApplyDesignResources } from '../design-resources/engine.js'
import { readLearning, buildLearningPromptAppendix, summarizeLearning } from '../learning/index.js'
import { loadV3Context } from '../v3/memory.js'
import {
  analyzeReferenceImage,
  applyReferenceSection,
  isReferenceDesignPrompt,
  referencePromptAppendix,
  sanitizeReferenceImageUrl,
  sectionFromPrompt,
} from '../visual/referenceDesign.js'
import { analyzeEditScope, buildScopedExecutionBrief } from '../mutations/editScope.js'
import { writeCodexWorkspaceContext } from '../codex/index.js'

export async function planIsolatedHandoff({ prompt, websiteState, profile, plan, business }) {
  return {
    taskType: 'ISOLATED_WEBSITE',
    framework: 'react-vite',
    request: String(prompt || '').slice(0, 4000),
    specification: {
      engine: websiteState?.engine || 'ai',
      sectionOrder: business?.sections || websiteState?.sectionOrder || [],
      theme: websiteState?.theme || {},
      look: business?.look,
      planSections: (plan?.sections || []).map((s) => s.type || s.id),
      business: {
        name: profile?.identity?.name || websiteState?.settings?.businessName || '',
        category: profile?.identity?.category || '',
        city: profile?.location?.city || '',
      },
    },
    rule: 'GetVia owns data/structure/functionality. AI owns design/presentation only. Isolated React + Vite workspace. No secrets.',
  }
}

async function nodeModulesReady(workspaceDir) {
  try {
    await fs.access(path.join(workspaceDir, 'node_modules', 'vite', 'package.json'))
    await fs.access(path.join(workspaceDir, 'node_modules', 'react', 'package.json'))
    return true
  } catch {
    return false
  }
}

export async function installAndBuild(workspaceDir, { onProgress, projectId } = {}) {
  if (!shouldRunWorkspaceNpm()) {
    const inspect = await inspectWorkspaceBuild({ workspaceDir, runBuild: false })
    return { ok: inspect.ok, skipped: true, inspect, message: 'Workspace npm skipped (AI_SKIP_WORKSPACE_NPM).' }
  }
  const inspect = await inspectWorkspaceBuild({ workspaceDir, runBuild: false })
  if (!inspect.ok) return inspect
  if (projectId) await stopIsolatedPreview(projectId).catch(() => ({ ok: true, stopped: false }))
  await repairWorkspaceJsx(workspaceDir)
  let install = { ok: true, skipped: true, message: 'npm install skipped; node_modules already present.' }
  if (!(await nodeModulesReady(workspaceDir))) {
    await onProgress?.({ currentStep: 'build', progress: 63 })
    console.log('[ai-builder] npm install starting', workspaceDir)
    install = await runWorkspaceCommand({
      cwd: workspaceDir,
      command: 'npm install',
      extraEnv: { npm_config_audit: 'false', npm_config_fund: 'false' },
      timeoutMs: 6 * 60 * 1000,
    })
    if (!install.ok) return { ...install, step: 'install' }
  }
  await onProgress?.({ currentStep: 'build', progress: 70 })
  console.log('[ai-builder] npm run build starting', workspaceDir)
  let build = await inspectWorkspaceBuild({ workspaceDir, runBuild: true })
  if (!build.ok && projectId && isEsbuildIpcCrash(`${build.stderr || ''}\n${build.message || ''}`)) {
    await stopIsolatedPreview(projectId).catch(() => ({ ok: true, stopped: false }))
    console.log('[ai-builder] npm run build retry after preview/esbuild conflict')
    build = await inspectWorkspaceBuild({ workspaceDir, runBuild: true })
  }
  console.log(`[ai-builder] npm run build ${build.ok ? 'ok' : 'failed'}`)
  return { ...build, install, step: 'build' }
}

async function syncWebsiteState({ job, site, draft, profile, prompt, selectedElement, signal, onProgress, userId, incremental = false }) {
  if (!job || !site || !draft || skipWebsiteStateSync()) {
    return { ok: true, skipped: true, websiteState: draft?.websiteState, revision: draft?.revisionNumber }
  }
  const blank =
    draft.websiteState?.settings?.hasAiDesign === false || !(draft.websiteState?.sectionOrder || []).length
  const full = !incremental && (isFullWebsiteBuildPrompt(prompt) || blank)
  try {
    const result = full
      ? await runWebsiteBuild({ job, site, draft, profile, prompt, signal, onProgress, userId })
      : await runDesignerEdit({
          job,
          site,
          draft,
          profile,
          prompt,
          selectedElement,
          signal,
          onProgress,
          userId,
          incremental,
        })
    return result
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      code: err.code || 'WEBSITE_STATE_SYNC_FAILED',
      message: err.message || 'Website State sync failed.',
      websiteState: draft.websiteState,
      revision: draft.revisionNumber,
    }
  }
}

export async function implementIsolatedWorkspace({
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
  onProgress,
} = {}) {
  if (!isIsolatedRuntimeEnabled()) {
    return {
      ok: false,
      code: 'ISOLATED_RUNTIME_DISABLED',
      message: 'Set AI_ISOLATED_RUNTIME=1 to generate per-tenant React + Vite workspaces.',
      loc: null,
    }
  }
  const ownerId = String(userId || job?.userId || '')
  const siteId = String(projectId || site?._id || '')
  const loc = await ensureWorkspace({ userId: ownerId, projectId: siteId })
  const existingBusiness = await readBusinessJson(loc.dir)
  const hasSite = Boolean(existingBusiness) && (await workspaceHasSite(loc.dir))
  const rebuild = !hasSite || isRebuildPrompt(prompt) || isFullWebsiteBuildPrompt(prompt)
  const editScope = analyzeEditScope({ prompt, selectedElement, hasSite })
  const scopedEdit = hasSite && !rebuild && editScope.scope !== 'site'
  const heroOnly = hasSite && !rebuild && isHeroLayoutPrompt(prompt)
  await ensureOpenAiAvailability()
  await onProgress?.({ status: 'PLANNING', progress: 12, currentStep: 'planning' })
  const websiteSync =
    heroOnly || scopedEdit || (hasSite && !rebuild)
      ? { ok: true, skipped: true, websiteState: draft?.websiteState || websiteState, revision: draft?.revisionNumber, applied: [] }
      : await syncWebsiteState({
    job,
    site,
    draft,
    profile,
    prompt,
    selectedElement: editScope.selectedElement || selectedElement,
    signal,
    onProgress,
    userId: job?.userId || userId,
    incremental: hasSite && !rebuild,
  })
  const state = websiteSync.websiteState || websiteState || draft?.websiteState
  const requirements = shouldSkipOpenAiLlm() || (!rebuild && heuristicSufficient(prompt))
    ? analyzeRequirementsHeuristic(prompt, profile, { websiteState: state })
    : await requirementAgent({
        prompt,
        profile,
        websiteState: state,
        usageCtx: {},
        signal,
      })
  const plan = websiteSync.plan || (await planWebsiteHeuristic({ profile, requirements }))
  const generated = businessJsonFrom({ profile, prompt, plan, websiteState: state })
  const business = rebuild ? generated : persistMerge(existingBusiness, generated, prompt)
  const spec = await planIsolatedHandoff({ prompt, websiteState: state, profile, plan, business })
  await writeWorkspaceFile({
    userId: ownerId,
    projectId: siteId,
    relativePath: 'getvia-spec.json',
    contents: JSON.stringify(spec, null, 2),
  })
  await onProgress?.({ status: 'EXECUTING', progress: 40, currentStep: 'design' })
  const scaffold = await writeViteScaffold({
    workspaceDir: loc.dir,
    business,
    overwrite: rebuild,
  })
  // Scoped visual edits must not rewrite business facts or clobber other sections.
  // Feature/content prompts (buttons, add/remove, copy) still persist business.json.
  const touchesBusinessData =
    /\b(add|remove|delete|button|whatsapp|phone|email|product|service|offer|faq|section|reorder|move|headline|copy|text|content)\b/i.test(
      String(prompt || ''),
    )
  if (!rebuild && !(scopedEdit && !touchesBusinessData)) {
    await applyWorkspaceFiles({
      workspaceDir: loc.dir,
      files: [{ path: 'src/data/business.json', contents: `${JSON.stringify(business, null, 2)}\n` }],
    })
  }
  const intent = analyzeIntent(prompt, { hasSite, selectedElement: editScope.selectedElement })
  const priorBrain = await readProjectBrain(loc.dir)
  const v3 = await loadV3Context({
    workspaceDir: loc.dir,
    prompt,
    category: business?.category || profile?.identity?.category,
  })
  const learning = v3.site || (await readLearning(loc.dir))
  let designPrep = { selection: null, explore: null, applied: null, brief: '', mode: null }
  if (!heroOnly) {
    await onProgress?.({
      status: 'DESIGNING',
      progress: 44,
      currentStep: 'design',
      message: scopedEdit
        ? `Focusing on ${editScope.sections.join(', ') || 'selected'} section only.`
        : 'Researching live design practices, CDNs, and libraries.',
    })
    designPrep = await selectAndApplyDesignResources({
      workspaceDir: loc.dir,
      prompt,
      intent: intent.type,
      hasSite,
      rebuild,
      brain: { ...priorBrain, learning: summarizeLearning(learning) },
      business,
      projectId: siteId,
      learning,
      scoped: scopedEdit,
    })
  }

  if (heroOnly) {
    await onProgress?.({ status: 'EXECUTING', progress: 48, currentStep: 'implement' })
    const heroPatch = await patchPremiumSplitHero(loc.dir)
    const coder = {
      ok: heroPatch.ok,
      coder: 'heuristic',
      written: heroPatch.written || [],
      summary: 'Updated the hero to a two-column premium layout.',
    }
    const latestBusiness = (await readBusinessJson(loc.dir)) || business
    return {
      ok: heroPatch.ok,
      loc,
      hasSite,
      rebuild,
      business: latestBusiness,
      existingBusiness,
      plan,
      spec,
      scaffold,
      coder,
      websiteState: state,
      revision: websiteSync.revision || draft?.revisionNumber,
      applied: [{ type: 'HERO_LAYOUT', summary: 'Two-column premium hero' }],
      analysis: requirements.analysis,
      suggestions: requirements.suggestedPrompts,
      websiteSync: 'skipped',
    }
  }
  await onProgress?.({ status: 'BUILDING', progress: 55, currentStep: 'implement' })
  const referenceImageUrl = sanitizeReferenceImageUrl(job?.input?.referenceImageUrl)
  const referenceSection = sectionFromPrompt(prompt, editScope.selectedElement || selectedElement)
  let reference = null
  if (referenceImageUrl || isReferenceDesignPrompt(prompt)) {
    await onProgress?.({
      status: 'DESIGNING',
      progress: 50,
      currentStep: 'design',
      message: 'Reading the uploaded design reference.',
    })
    reference = await analyzeReferenceImage({
      imageUrl: referenceImageUrl,
      prompt,
      section: referenceSection === 'site' ? 'footer' : referenceSection,
      signal,
    })
  }
  const scopeBrief = buildScopedExecutionBrief(editScope)
  const targetSection =
    editScope.primarySection ||
    (selectedElement?.sectionId && selectedElement.sectionId !== 'site' ? selectedElement.sectionId : '')
  const imageHint =
    scopedEdit && /\b(image|photo|picture|img)\b/i.test(String(prompt || ''))
      ? 'IMAGE REQUEST: Add/show an image inside the target section only, using an existing GetVia gallery/about/product image URL from business.json. Do not invent stock photos. Do not rewrite other sections.'
      : ''
  const targetBrief = targetSection
    ? `PRECISE EDIT TARGET: Only change the "${targetSection}" section.\nPreferred files: ${(editScope.files || []).join(', ') || 'section component + src/index.css'}.\nKeep GetVia data bindings. Do not rewrite unrelated sections, App.jsx section order, or business.json facts.`
    : ''
  const learningBrief = [
    v3.learningBrief,
    designPrep.learningBrief,
    !v3.learningBrief && !designPrep.learningBrief
      ? buildLearningPromptAppendix(learning, {
          prompt,
          intent: intent.type,
          category: business?.category,
        })
      : '',
  ]
    .filter(Boolean)
    .join('\n')
  const codingPrompt = [
    reference?.spec ? `${prompt}${referencePromptAppendix(reference.spec)}` : prompt,
    scopeBrief,
    targetBrief,
    imageHint,
    scopedEdit ? '' : designPrep.brief,
    scopedEdit && designPrep.brief ? String(designPrep.brief).slice(0, 1200) : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  await writeCodexWorkspaceContext({
    workspaceDir: loc.dir,
    profile,
    business,
    prompt,
    composition: designPrep.explore?.composition || null,
    preserveConfig: scopedEdit,
  }).catch(() => ({ ok: false, written: [] }))
  const executed = await executeCoding({
    workspaceDir: loc.dir,
    prompt: codingPrompt,
    profile,
    signal,
    userId: ownerId,
    projectId: siteId,
    learningBrief,
    allowedFiles: scopedEdit ? editScope.files : null,
    v3,
    usageCtx: {
      userId: ownerId,
      businessId: site?.businessId || job?.businessId,
      siteId: site?._id || siteId,
      jobId: job?._id,
      prompt,
    },
    onEvent: async (event) => {
      await onProgress?.({
        status: 'BUILDING',
        progress: 56,
        currentStep: 'implement',
        activityEvent: event,
        message: event.message,
      })
    },
  })
  const coder = executed.coder || { ok: executed.ok, written: executed.written || [] }
  const creditsExhausted = isCreditsExhaustedResult(executed) || isCreditsExhaustedResult(coder)

  if (creditsExhausted) {
    return {
      ok: false,
      code: 'OPENAI_QUOTA',
      message: OPENAI_QUOTA_MESSAGE,
      loc,
      hasSite,
      rebuild,
      business: (await readBusinessJson(loc.dir)) || business,
      existingBusiness,
      plan,
      spec,
      scaffold,
      coder: { ...coder, ok: false, written: [], code: 'OPENAI_QUOTA', summary: OPENAI_QUOTA_MESSAGE },
      openaiSkip: openAiSkipReason() || 'quota',
      websiteState: state,
      revision: websiteSync.revision || draft?.revisionNumber,
      applied: [],
      written: [],
      analysis: websiteSync.analysis || requirements.analysis,
      suggestions: websiteSync.suggestions || requirements.suggestedPrompts,
      websiteSync: websiteSync.skipped ? 'skipped' : websiteSync.ok ? 'ok' : 'failed',
      reference: null,
      resources: designPrep.selection,
      explore: designPrep.explore,
      designResources: designPrep.selection?.used || [],
      research: designPrep.research || null,
      resourceMode: designPrep.mode,
      designDna: designPrep.designDna || null,
      learningBrief: designPrep.learningBrief || learningBrief || '',
      coderPolicy: executed.coderPolicy || null,
      promptClass: v3.promptClass || null,
      editScope,
      usage: executed.coder?.usage || executed.loop?.usage || null,
      usageModel: executed.coder?.model || null,
      threadId: coder.threadId || executed.loop?.threadId || null,
    }
  }

  let referenceWrite = { written: [] }
  if (reference?.spec) {
    referenceWrite = await applyReferenceSection({ workspaceDir: loc.dir, spec: reference.spec })
    if (referenceWrite.written?.length) {
      await onProgress?.({
        status: 'BUILDING',
        progress: 58,
        currentStep: 'implement',
        activityEvent: { type: 'FILE_UPDATED', message: reference.message || referenceWrite.message },
      })
    }
  }

  const latestBusiness = (await readBusinessJson(loc.dir)) || business
  // Do not report scaffold fill-ins as user-facing edits on incremental runs.
  const scaffoldTouched = rebuild ? scaffold.written || [] : []
  const written = [
    ...new Set([
      ...scaffoldTouched,
      ...(coder.written || []),
      ...(executed.written || []),
      ...(referenceWrite.written || []),
      ...(designPrep.applied?.written || []),
    ]),
  ]
  const applied = [
    ...(Array.isArray(websiteSync.applied) ? websiteSync.applied : []),
    ...written.map((file) => ({ type: 'FILE_UPDATED', summary: `Updated ${file}` })),
  ]
  const codingOk = Boolean(executed.ok || coder.ok || (coder.written || []).length || (executed.written || []).length)
  return {
    ok: Boolean(scaffold.ok) && codingOk,
    code: codingOk ? undefined : executed.code || coder.code || 'IMPLEMENT_FAILED',
    message: codingOk ? undefined : executed.error || coder.summary || 'Implementation did not write a working workspace.',
    loc,
    hasSite,
    rebuild,
    business: latestBusiness,
    existingBusiness,
    plan,
    spec,
    scaffold,
    coder,
    openaiSkip: openAiSkipReason() || null,
    websiteState: state,
    revision: websiteSync.revision || draft?.revisionNumber,
    applied,
    written,
    analysis: websiteSync.analysis || requirements.analysis,
    suggestions: websiteSync.suggestions || requirements.suggestedPrompts,
    websiteSync: websiteSync.skipped ? 'skipped' : websiteSync.ok ? 'ok' : 'failed',
    reference,
    resources: designPrep.selection,
    explore: designPrep.explore,
    designResources: designPrep.selection?.used || [],
    research: designPrep.research || null,
    resourceMode: designPrep.mode,
    designDna: designPrep.designDna || null,
    learningBrief: designPrep.learningBrief || learningBrief || '',
    coderPolicy: executed.coderPolicy || null,
    promptClass: v3.promptClass || null,
    editScope,
    usage: executed.coder?.usage || executed.loop?.usage || null,
    usageModel: executed.coder?.model || null,
    threadId: coder.threadId || executed.loop?.threadId || null,
  }
}

/** V2 entry: plan → implement → build/debug → preview → QA → review. */
export async function runIsolatedWebsiteJob(args) {
  const { runV2WebsiteJob } = await import('../v2/orchestrator.js')
  return runV2WebsiteJob(args)
}

/** Legacy implement+build+preview without V2 gates (internal/debug). */
export async function runIsolatedWebsiteJobLegacy({
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
  const implemented = await implementIsolatedWorkspace({
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
  })
  if (!implemented.ok && implemented.code === 'ISOLATED_RUNTIME_DISABLED') {
    return { ...implemented, previewUrl: getViaPreviewHint({ publicId }) }
  }
  const loc = implemented.loc
  await onProgress?.({ status: 'VALIDATING', progress: 72, currentStep: 'assets' })
  const build = await installAndBuild(loc.dir, { projectId: String(projectId || site?._id || '') })
  await onProgress?.({ status: 'VALIDATING', progress: 88, currentStep: 'validate' })
  const files = await listWorkspaceFiles(loc.dir)
  let preview = { ok: false, skipped: true }
  if (build.ok) {
    await onProgress?.({ status: 'PREVIEW_READY', progress: 95, currentStep: 'preview' })
    preview = await startIsolatedPreviewProcess({ projectId: String(projectId || site?._id || ''), workspaceDir: loc.dir })
  } else {
    preview = { ok: false, code: build.code || 'BUILD_FAILED', message: build.message }
  }
  if (draft) {
    draft.isolatedPreviewUrl = preview.ok ? preview.url : ''
    draft.isolatedPreviewPort = preview.ok ? preview.port : null
    await draft.save()
  }
  const ok = Boolean(implemented.ok && build.ok)
  return {
    ok,
    outcome: ok ? 'SUCCESS' : 'FAILED',
    code: ok ? undefined : build.code || 'ISOLATED_WEBSITE_FAILED',
    message: ok
      ? preview.ok
        ? 'Isolated React + Vite site is running in preview.'
        : `Files are ready. Preview: ${preview.message || 'not started'}`
      : build.message || implemented.coder?.summary || 'Isolated website job failed.',
    coder: implemented.coder?.coder,
    openaiSkip: implemented.openaiSkip || null,
    build,
    preview,
    isolatedPreviewUrl: preview.ok ? preview.url : null,
    workspace: { userId: loc.userId, projectId: loc.projectId },
    files: files.filter((f) => !f.startsWith('node_modules') && !f.startsWith('dist')),
    written: [...(implemented.scaffold?.written || []), ...(implemented.coder?.written || [])],
    plan: { themePreset: implemented.plan?.themePreset, sections: implemented.plan?.sections },
    previewUrl: preview.ok ? preview.url : getViaPreviewHint({ publicId }),
    providers: listProviderStatus(),
    provider: activeProviderName(),
    websiteState: implemented.websiteState,
    revision: implemented.revision,
    applied: implemented.applied,
    analysis: implemented.analysis,
    suggestions: implemented.suggestions,
    websiteSync: implemented.websiteSync,
  }
}
