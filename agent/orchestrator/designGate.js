import fs from 'node:fs/promises'
import path from 'node:path'
import { MAX_DESIGN_ITERS } from '../execution/index.js'
import { applyDesignToWorkspace, exploreDirections } from '../visual/design-explorer/index.js'
import { isSameComposition, screenshotSimilarity } from '../visual/similarity.js'
import { closeBrowserSession } from '../browser/index.js'

async function readPng(workspaceDir, rel) {
  if (!workspaceDir || !rel) return null
  try {
    return await fs.readFile(path.join(workspaceDir, rel))
  } catch {
    return null
  }
}

export async function captureDesignShot(runtime, ctx, name) {
  const started = await runtime.callTool('start_preview', {}, ctx)
  if (!started.success || started.skipped || !started.data?.url) {
    return { skipped: true, buffer: null, path: null }
  }
  if (started.data.kind === 'static') {
    await runtime.callTool('stop_preview', {}, ctx).catch(() => {})
    return { skipped: true, buffer: null, path: null, preview: started.data, reason: 'static-preview' }
  }
  const opened = await runtime.callTool('browser_open', { url: started.data.url, width: 1280, height: 800 }, ctx)
  if (!opened.success || opened.skipped) {
    return { skipped: true, buffer: null, path: null, preview: started.data }
  }
  const shot = await runtime.callTool('browser_screenshot', { name }, ctx)
  const rel = shot.path || shot.data?.path || null
  const buffer = await readPng(ctx.workspaceDir, rel)
  await closeBrowserSession(ctx.projectId).catch(() => {})
  await runtime.callTool('stop_preview', {}, ctx).catch(() => {})
  return {
    skipped: Boolean(shot.skipped) || !shot.success,
    buffer,
    path: rel,
    preview: started.data,
  }
}

export async function ensureDistinctDesign({
  runtime,
  ctx,
  task,
  plan,
  previousDNA,
  go,
  record,
  runBuild,
} = {}) {
  if (!plan?.spec || (plan.designMode !== 'REDESIGN' && plan.designMode !== 'REIMAGINE')) {
    return { iterated: false, spec: plan?.spec || null }
  }
  const after = await captureDesignShot(runtime, ctx, 'design-after')
  const shotCheck = isSameComposition(previousDNA, plan.spec, {
    screenshots: { before: task.design?.beforeBuffer, after: after.buffer },
  })
  let similar = false
  if (task.design?.beforeBuffer && after.buffer && !after.skipped) {
    similar = screenshotSimilarity(task.design.beforeBuffer, after.buffer) >= 0.92
  } else if (shotCheck.reason !== 'screenshot') {
    similar = Boolean(previousDNA?.direction && previousDNA.direction === plan.spec.direction)
  }
  let iterations = 0
  const used = new Set([plan.spec.direction])
  while (similar && iterations < MAX_DESIGN_ITERS - 1) {
    const nextExplore = exploreDirections({
      currentDNA: { direction: plan.spec.direction, ...plan.spec },
      mode: 'REIMAGINE',
      novelty: plan.novelty,
      seed: `${ctx.projectId}:iter${iterations}`,
      avoid: [...used],
    })
    if (!nextExplore.chosen || used.has(nextExplore.chosen.direction)) break
    used.add(nextExplore.chosen.direction)
    iterations += 1
    if (!go('DEBUGGING', { phase: 'REPAIR', role: 'planner', message: `Design iteration ${iterations}: ${nextExplore.chosen.direction}` })) {
      break
    }
    if (!go('REPAIRING', { phase: 'REPAIR', role: 'planner', message: `Design iteration ${iterations}: ${nextExplore.chosen.direction}` })) {
      break
    }
    plan.spec = nextExplore.chosen
    plan.explore = nextExplore
    plan.expect = [plan.spec.direction, plan.spec.heroComposition, plan.spec.navigationStrategy]
    const applied = await applyDesignToWorkspace({ runtime, ctx, spec: plan.spec, novelty: plan.novelty })
    task.filesChanged = [...new Set([...task.filesChanged, ...applied.changed])]
    record(task, 'REPAIR', `Switched design to ${plan.spec.direction}`, { role: 'planner', detail: applied })
    if (!go('BUILDING', { phase: 'OBSERVE', role: 'debugger', message: 'Rebuild after design iteration.' })) break
    const build = await runBuild(runtime, ctx)
    task.build = build
    if (!build.ok) break
    similar = false
    task.design = { ...(task.design || {}), spec: plan.spec, dna: applied.dna, iterations }
  }
  return { iterated: iterations > 0, spec: plan.spec, similar, iterations, after }
}
