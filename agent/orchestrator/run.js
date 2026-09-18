import { createAgentRuntime } from '../runtime.js'
import { classifyIntent, isReadOnlyIntent } from '../core/intent.js'
import { classifyDesignMode, noveltyFor, isDesignOverhaul } from '../core/designMode.js'
import { createTaskRecord, transition, failTask, completeTask, TERMINAL_STATES } from '../state/machine.js'
import { record, emitTaskEvent } from '../events/index.js'
import { refreshProjectBrain, writeProjectBrain } from '../brain/index.js'
import { buildContext } from '../context/index.js'
import { MAX_BUILD_REPAIRS } from '../execution/index.js'
import { planTask, codeTask, debugTask, reviewTask } from './roles.js'
import { verifyInBrowser, stopPreviewQuiet } from './browserGate.js'
import { captureDesignShot, ensureDistinctDesign } from './designGate.js'
import { exploreDirections } from '../visual/design-explorer/index.js'
import { selectAndApplyDesignResources } from '../../src/ai-builder/design-resources/engine.js'
import { SKIPPED_MESSAGE, PASSED_MESSAGE, closeBrowserSession } from '../browser/index.js'
import { seedWorkspaceFromProfile } from '../getvia/seed.js'
import { undoLastChange } from './undo.js'
import { startStuckWatchdog } from '../watchdog.js'
import { joinSignals } from '../signals.js'

function aborted(signal) {
  return Boolean(signal?.aborted)
}

function toolCtx(input, task) {
  return {
    userId: input.userId,
    projectId: input.projectId,
    workspaceDir: input.workspaceDir,
    permission: input.permission || 'execute',
    signal: input.signal,
    task,
    emit: (type, message, extra) => emitTaskEvent(task, type, message, extra),
  }
}

async function checkpoint(runtime, ctx, task, message) {
  const result = await runtime.callTool('git_checkpoint', { message }, ctx)
  const row = {
    ok: result.success,
    skipped: Boolean(result.data?.skipped) || result.errorType === 'GIT_UNAVAILABLE',
    sha: result.data?.sha || null,
    message,
    error: result.success ? null : result.message,
  }
  task.checkpoints.push(row)
  return row
}

async function runBuild(runtime, ctx, task) {
  emitTaskEvent(task, 'BUILD_STARTED', 'Running npm run build.')
  const result = await runtime.callTool('run_build', {}, ctx)
  const build = {
    ok: Boolean(result.success),
    message: result.message || result.data?.stdout || '',
    details: result.details || result.data || null,
    data: result.data || null,
  }
  emitTaskEvent(task, build.ok ? 'BUILD_PASSED' : 'BUILD_FAILED', build.ok ? 'Build passed.' : build.message)
  return build
}

async function persistBrain(workspaceDir, brain, task, prompt, extra = {}) {
  await writeProjectBrain(workspaceDir, {
    ...brain,
    undoSha: extra.undoSha !== undefined ? extra.undoSha : brain.undoSha,
    recentChanges: [
      ...(brain.recentChanges || []),
      ...(task.filesChanged || []).filter((path) => path && !String(path).startsWith('(')).map((path) => ({
        path,
        at: new Date().toISOString(),
        prompt: String(prompt).slice(0, 120),
      })),
    ].slice(-20),
    buildStatus: extra.buildStatus || brain.buildStatus,
    previewStatus: extra.previewStatus || brain.previewStatus,
    designDNA: task.design?.dna || brain.designDNA,
    designResources: extra.designResources || task.design?.resources || brain.designResources || [],
    knownErrors: extra.knownErrors || brain.knownErrors || [],
  }).catch(() => {})
}

export async function runAgentTask(input = {}) {
  const { prompt, workspaceDir, userId, projectId } = input
  const localAbort = new AbortController()
  const joined = joinSignals(input.signal, localAbort.signal)
  const signal = joined.signal
  const runtime = input.runtime || createAgentRuntime(input)
  const task = createTaskRecord({ prompt, userId, projectId, workspaceDir })
  task.jobId = input.jobId || null
  task.ops = []
  task.onEvent = (event) => input.onEvent?.(event, task)
  const ctx = toolCtx({ ...input, signal }, task)
  const stopWatch = startStuckWatchdog(task, {
    stuckMs: input.stuckMs,
    intervalMs: input.stuckIntervalMs,
    onStuck: () => {
      localAbort.abort()
      if (!TERMINAL_STATES.includes(task.state)) {
        failTask(task, 'This task was stuck and recovered.')
        emitTaskEvent(task, 'TASK_FAILED', 'This task was stuck and recovered.')
      }
    },
  })

  const go = (state, event) => {
    if (aborted(signal)) {
      if (TERMINAL_STATES.includes(task.state)) return false
      if (task.recovered) {
        failTask(task, 'This task was stuck and recovered.')
        emitTaskEvent(task, 'TASK_FAILED', task.message)
        return false
      }
      task.success = false
      task.message = 'Cancelled.'
      task.finishedAt = new Date().toISOString()
      if (!TERMINAL_STATES.includes(task.state)) transition(task, 'CANCELLED', { phase: 'OBSERVE', message: 'Cancelled.' })
      emitTaskEvent(task, 'TASK_FAILED', 'Cancelled.', { cancelled: true })
      return false
    }
    const moved = transition(task, state, event)
    if (!moved.ok) {
      failTask(task, moved.message)
      emitTaskEvent(task, 'TASK_FAILED', moved.message)
      return false
    }
    return true
  }

  const done = async (result) => {
    stopWatch()
    if (task.state === 'CANCELLED' || task.recovered || aborted(signal)) {
      await stopPreviewQuiet(runtime, ctx).catch(() => {})
    }
    return result
  }

  if (!prompt || !workspaceDir || !userId || !projectId) {
    return done(failTask(task, 'Task requires prompt, workspaceDir, userId, and projectId.'))
  }

  if (!go('ANALYZING', { phase: 'THINK', role: 'planner', message: 'Classifying intent.' })) return done(task)
  emitTaskEvent(task, 'TASK_STARTED', `Started: ${String(prompt).slice(0, 140)}`)
  const classified = classifyIntent(prompt)
  task.intent = classified.intent
  const designMode = classifyDesignMode(prompt, classified.intent)
  const novelty = noveltyFor(designMode, prompt, classified.intent)
  record(task, 'THINK', `Intent ${classified.intent} · ${designMode} novelty ${novelty}`, {
    role: 'planner',
    detail: { ...classified, designMode, novelty },
  })

  if (input.profile && (classified.intent === 'CREATE' || classified.intent === 'REDESIGN' || classified.intent === 'REIMAGINE')) {
    await seedWorkspaceFromProfile({ workspaceDir, profile: input.profile, runtime, ctx })
    record(task, 'OBSERVE', 'Seeded workspace from GetVia BusinessProfile', {
      role: 'planner',
      detail: { name: input.profile.name, missing: input.profile.missing },
    })
  }

  if (!go('INSPECTING', { phase: 'OBSERVE', role: 'planner', message: 'Inspecting project.' })) return done(task)
  const { index, brain } = await refreshProjectBrain(workspaceDir, { userId, projectId })
  const context = await buildContext({ workspaceDir, task: prompt, brain })
  emitTaskEvent(task, 'PROJECT_INSPECTED', `Indexed ${index.files?.length || 0} files`, {
    detail: { homepage: context.homepage, files: context.files },
  })

  if (!go('PLANNING', { phase: 'THINK', role: 'planner', message: 'Creating plan.' })) return done(task)
  const explore = exploreDirections({
    currentDNA: brain.designDNA,
    mode: designMode,
    novelty,
    seed: projectId,
  })
  const plan = planTask({
    prompt,
    intent: classified.intent,
    context,
    brain,
    designMode,
    novelty,
    spec: explore.chosen,
    explore,
    profile: input.profile || null,
  })
  task.plan = plan
  task.design = { mode: designMode, novelty, spec: explore.chosen, explore, dna: null }
  emitTaskEvent(task, 'PLAN_CREATED', `Plan with ${plan.steps.length} steps`, {
    role: 'planner',
    detail: { files: plan.files, expect: plan.expect, designMode, direction: explore.chosen?.direction },
  })

  if (isReadOnlyIntent(classified.intent)) {
    const homepage = context.homepage || 'src/App.jsx'
    await runtime.callTool('read_file', { path: homepage }, ctx)
    if (!go('REVIEWING', { phase: 'VERIFY', role: 'reviewer', message: 'Read-only analysis.' })) return done(task)
    const review = await reviewTask({ runtime, ctx, plan })
    task.review = review
    const completed = completeTask(task, review.message || 'Analysis complete.', { review })
    emitTaskEvent(task, 'TASK_COMPLETED', completed.message)
    return done(completed)
  }

  if (classified.intent === 'UNDO') {
    const undone = await undoLastChange({ runtime, ctx, brain, task, go, runBuild: (rt, c) => runBuild(rt, c, task) })
    if (!undone?.ok) return done(task)
    await persistBrain(workspaceDir, brain, task, prompt, { undoSha: null, buildStatus: 'ok' })
    const completed = completeTask(task, task.review.message, { review: task.review, build: task.build })
    emitTaskEvent(task, 'TASK_COMPLETED', completed.message)
    return done(completed)
  }

  const before = await checkpoint(runtime, ctx, task, 'agent: before changes')
  if (before.sha) brain.undoSha = before.sha

  const prepared = await selectAndApplyDesignResources({
    workspaceDir,
    prompt,
    intent: classified.intent,
    hasSite: Boolean(index.homepage),
    rebuild: designMode === 'REIMAGINE' || classified.intent === 'CREATE',
    brain,
    explore,
    projectId,
  })
  plan.spec = prepared.explore?.chosen || plan.spec
  plan.explore = prepared.explore || plan.explore
  plan.resources = prepared.selection
  plan.resourceBrief = prepared.brief
  task.design = {
    ...(task.design || {}),
    spec: plan.spec,
    explore: plan.explore,
    resources: prepared.selection?.used || [],
  }
  if (prepared.applied?.written?.length) {
    task.filesChanged = [...new Set([...(task.filesChanged || []), ...prepared.applied.written])]
  }

  if (isDesignOverhaul(designMode)) {
    emitTaskEvent(task, 'VISUAL_CHECK_STARTED', 'Capturing the current design.')
    const beforeShot = await captureDesignShot(runtime, ctx, 'design-before')
    task.design.beforeBuffer = beforeShot.buffer
    task.design.beforePath = beforeShot.path
  }

  if (!go('IMPLEMENTING', { phase: 'ACT', role: 'coder', message: 'Modifying files.' })) return done(task)
  const coded = await codeTask({ runtime, ctx, plan, prompt, intent: classified.intent })
  task.filesChanged = [...new Set([...(task.filesChanged || []), ...coded.changed])]
  if (coded.dna) task.design = { ...(task.design || {}), dna: coded.dna, spec: plan.spec }
  record(task, 'ACT', coded.changed.length ? `Modified ${coded.changed.join(', ')}` : 'No files changed', {
    role: 'coder',
    detail: coded,
  })

  if (!coded.changed.length) {
    const failed = failTask(task, 'No files were modified for this task.', { detail: coded })
    emitTaskEvent(task, 'TASK_FAILED', failed.message)
    return done(failed)
  }

  let build = { ok: false, message: 'Build did not run.' }
  if (!go('BUILDING', { phase: 'OBSERVE', role: 'debugger', message: 'Running build.' })) return done(task)

  while (task.repairAttempts <= MAX_BUILD_REPAIRS) {
    if (aborted(signal)) {
      if (!TERMINAL_STATES.includes(task.state) && !task.recovered) {
        transition(task, 'CANCELLED', { phase: 'OBSERVE', message: 'Cancelled.' })
        task.success = false
        task.message = 'Cancelled.'
        task.finishedAt = new Date().toISOString()
        emitTaskEvent(task, 'TASK_FAILED', 'Cancelled.', { cancelled: true })
      }
      return done(task)
    }
    build = await runBuild(runtime, ctx, task)
    task.build = build
    record(task, 'OBSERVE', build.ok ? 'Build passed' : `Build failed: ${build.message}`, { role: 'debugger', detail: build })
    if (build.ok) break
    if (task.repairAttempts >= MAX_BUILD_REPAIRS) {
      const failed = failTask(task, `Build failed after ${MAX_BUILD_REPAIRS} repair attempts.`, { build, phase: 'REPAIR' })
      emitTaskEvent(task, 'TASK_FAILED', failed.message)
      return done(failed)
    }
    if (!go('DEBUGGING', { phase: 'REPAIR', role: 'debugger', message: 'Locating build error.' })) return done(task)
    if (!go('REPAIRING', { phase: 'REPAIR', role: 'debugger', message: `Repair attempt ${task.repairAttempts + 1}.` })) return done(task)
    emitTaskEvent(task, 'REPAIR_STARTED', `Repair attempt ${task.repairAttempts + 1}.`)
    const repaired = await debugTask({ runtime, ctx, build, files: plan.files })
    task.repairAttempts += 1
    task.filesChanged = [...new Set([...task.filesChanged, ...repaired.patched])]
    emitTaskEvent(task, 'REPAIR_COMPLETED', repaired.ok ? `Patched ${repaired.patched.join(', ') || 'files'}` : 'No repair patch applied')
    if (!repaired.ok) {
      const failed = failTask(task, `Could not repair the build: ${build.message}`, { build })
      emitTaskEvent(task, 'TASK_FAILED', failed.message)
      return done(failed)
    }
    if (!go('BUILDING', { phase: 'OBSERVE', role: 'debugger', message: 'Rebuilding after repair.' })) return done(task)
  }

  if (!build.ok) {
    const failed = failTask(task, 'Build is failing; cannot complete.', { build })
    emitTaskEvent(task, 'TASK_FAILED', failed.message)
    return done(failed)
  }

  if (isDesignOverhaul(designMode)) {
    emitTaskEvent(task, 'VISUAL_CHECK_STARTED', 'Comparing the new design.')
    await ensureDistinctDesign({
      runtime,
      ctx,
      task,
      plan,
      previousDNA: brain.designDNA,
      go,
      record,
      runBuild: (rt, c) => runBuild(rt, c, task),
    })
    if (TERMINAL_STATES.includes(task.state)) return done(task)
    if (task.build && task.build.ok === false) {
      const failed = failTask(task, 'Build is failing; cannot complete.', { build: task.build })
      emitTaskEvent(task, 'TASK_FAILED', failed.message)
      return done(failed)
    }
    build = task.build || build
  }

  if (TERMINAL_STATES.includes(task.state)) return done(task)
  if (!go('REVIEWING', { phase: 'VERIFY', role: 'reviewer', message: 'Verifying task.' })) return done(task)
  const review = await reviewTask({ runtime, ctx, plan })
  task.review = review
  record(task, 'VERIFY', review.message, { role: 'reviewer', detail: review })
  if (!review.ok) {
    if (task.repairAttempts < MAX_BUILD_REPAIRS) {
      if (!go('DEBUGGING', { phase: 'REPAIR', role: 'coder', message: 'Review failed; retrying edit.' })) return done(task)
      if (!go('REPAIRING', { phase: 'REPAIR', role: 'coder', message: 'Review failed; retrying edit.' })) return done(task)
      emitTaskEvent(task, 'REPAIR_STARTED', 'Review failed; retrying edit.')
      task.repairAttempts += 1
      const retry = await codeTask({ runtime, ctx, plan, prompt, intent: classified.intent })
      task.filesChanged = [...new Set([...task.filesChanged, ...retry.changed])]
      emitTaskEvent(task, 'REPAIR_COMPLETED', retry.changed.length ? `Patched ${retry.changed.join(', ')}` : 'Retry applied.')
      if (!go('BUILDING', { phase: 'OBSERVE', role: 'debugger', message: 'Rebuilding after review repair.' })) return done(task)
      build = await runBuild(runtime, ctx, task)
      task.build = build
      if (!build.ok) {
        const failed = failTask(task, 'Build is failing; cannot complete.', { build })
        emitTaskEvent(task, 'TASK_FAILED', failed.message)
        return done(failed)
      }
      const again = await reviewTask({ runtime, ctx, plan })
      task.review = again
      if (!again.ok) {
        const failed = failTask(task, again.message, { build })
        emitTaskEvent(task, 'TASK_FAILED', failed.message)
        return done(failed)
      }
      if (!go('REVIEWING', { phase: 'VERIFY', role: 'reviewer', message: again.message })) return done(task)
    } else {
      const failed = failTask(task, review.message, { build })
      emitTaskEvent(task, 'TASK_FAILED', failed.message)
      return done(failed)
    }
  }

  await checkpoint(runtime, ctx, task, 'agent: after success')
  const browser = await verifyInBrowser({ runtime, ctx, task, plan, go, record, runBuild: (rt, c) => runBuild(rt, c, task) })
  if (browser?.ran) {
    emitTaskEvent(task, browser.passed ? 'BROWSER_TEST_PASSED' : 'BROWSER_TEST_FAILED', browser.message)
  }
  await closeBrowserSession(ctx.projectId).catch(() => {})
  if (input.keepPreview) {
    const status = await runtime.callTool('preview_status', {}, ctx)
    if (!status.data?.running || !status.data?.url) {
      const started = await runtime.callTool('start_preview', {}, ctx)
      if (started.success) task.preview = started.data
    }
  } else {
    await stopPreviewQuiet(runtime, ctx)
  }

  if (browser?.ran && !browser.passed) {
    const failed = failTask(task, browser.message || 'Browser QA failed.', { build, browser, review: task.review })
    emitTaskEvent(task, 'TASK_FAILED', failed.message)
    return done(failed)
  }

  const browserNote = !browser
    ? ''
    : browser.skipped
      ? ` ${SKIPPED_MESSAGE}`
      : browser.passed
        ? ` ${PASSED_MESSAGE}`
        : ''
  await persistBrain(workspaceDir, brain, task, prompt, {
    undoSha: before.sha || brain.undoSha,
    buildStatus: 'ok',
    previewStatus: browser?.skipped ? 'skipped' : browser?.passed ? 'ok' : 'unknown',
    knownErrors: [],
  })

  const completed = completeTask(task, `${task.review?.message || review?.message || 'Task completed.'}${browserNote}`, {
    review: task.review || review,
    build,
    browser,
    design: task.design || null,
  })
  emitTaskEvent(task, 'TASK_COMPLETED', completed.message)
  return done(completed)
}

export function createOrchestrator(options = {}) {
  const runtime = options.runtime || createAgentRuntime(options)
  return {
    runtime,
    runTask(prompt, ctx = {}) {
      return runAgentTask({ prompt, runtime, ...ctx })
    },
  }
}
