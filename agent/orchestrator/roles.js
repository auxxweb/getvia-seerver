import { isReadOnlyIntent } from '../core/intent.js'
import { expectedEvidence, filesForPlan, applyHeuristicEdit } from './edits.js'
import { reviewCompletion } from '../review/index.js'
import { repairBuildFailure } from '../repair/index.js'
import { applyDesignToWorkspace } from '../visual/design-explorer/index.js'

export function planTask({ prompt, intent, context, designMode, novelty, spec, explore, profile, resources } = {}) {
  const files = filesForPlan(context, prompt, { designMode, intent })
  const expect = expectedEvidence(prompt, intent, spec, profile)
  const readOnly = isReadOnlyIntent(intent)
  const steps = [
    { action: 'inspect', role: 'planner' },
    { action: 'explore-design', role: 'planner', mode: designMode, novelty },
    readOnly ? null : { action: 'discover-resources', role: 'planner' },
    { action: 'read', role: 'coder', files },
    readOnly ? null : { action: 'edit', role: 'coder', files, goal: prompt },
    readOnly ? null : { action: 'build', role: 'debugger' },
    { action: 'verify', role: 'reviewer', expect },
  ].filter(Boolean)
  return {
    role: 'planner',
    intent,
    designMode: designMode || 'PRESERVE',
    novelty: novelty ?? 1,
    spec: spec || null,
    explore: explore || null,
    resources: resources || null,
    files,
    expect,
    steps,
    skipBuild: readOnly,
    homepage: context?.homepage || 'src/App.jsx',
    components: context?.components || [],
  }
}

export async function codeTask({ runtime, ctx, plan, prompt, intent }) {
  const changed = []
  const observations = []
  let dna = null
  if (plan.spec && plan.designMode && plan.designMode !== 'PRESERVE') {
    const design = await applyDesignToWorkspace({ runtime, ctx, spec: plan.spec, novelty: plan.novelty })
    changed.push(...design.changed)
    observations.push(...design.observations)
    dna = design.dna
  }
  for (const rel of plan.files || []) {
    if (plan.designMode !== 'PRESERVE' && rel !== 'src/data/business.json' && rel !== 'index.html') continue
    const read = await runtime.callTool('read_file', { path: rel }, ctx)
    if (!read.success) {
      observations.push({ path: rel, ok: false, message: read.message })
      continue
    }
    observations.push({ path: rel, ok: true, bytes: read.data.contents.length })
    const edit = applyHeuristicEdit({ prompt, intent, path: rel, contents: read.data.contents })
    if (!edit.changed) continue
    const write = await runtime.callTool('patch_file', { path: rel, contents: edit.next }, ctx)
    if (write.success) changed.push(rel)
    else observations.push({ path: rel, ok: false, message: write.message })
  }
  return { role: 'coder', changed: [...new Set(changed)], observations, dna }
}

export async function debugTask({ runtime, ctx, build, files }) {
  const repair = await repairBuildFailure({ runtime, ctx, build, files })
  return { role: 'debugger', ...repair }
}

export async function reviewTask({ runtime, ctx, plan }) {
  const review = await reviewCompletion({ runtime, ctx, expect: plan.expect, files: plan.files })
  return { role: 'reviewer', ...review }
}
