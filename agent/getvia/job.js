import { createAgentRuntime } from '../runtime.js'
import { runAgentTask } from '../orchestrator/run.js'
import { ensureWorkspace } from '../../src/ai-builder/workspace/workspaceManager.js'
import { persistIsolatedDraft } from '../../src/ai-builder/workspace/persistIsolatedDraft.js'
import { loadBusinessProfile } from './adapter.js'
import { seedWorkspaceFromProfile } from './seed.js'
import { assertProductionGuards, withTimeout, DEFAULT_TIMEOUT_MS } from './production.js'
import { progressFromEvent } from '../events/index.js'

export async function runGetviaWebsiteJob(input = {}) {
  const {
    userId,
    projectId,
    businessId,
    prompt,
    signal,
    profile: injected,
    site,
    draft,
    onProgress,
    keepPreview = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchProfile,
    runtime,
    jobId,
  } = input

  const guards = assertProductionGuards({ userId, projectId, businessId, timeoutMs, workspaceDir: input.workspaceDir })
  if (!guards.ok && !injected) {
    return {
      ok: false,
      outcome: 'FAILED',
      code: guards.issues[0]?.type === 'authentication' ? 'UNAUTHORIZED' : 'FORBIDDEN',
      message: guards.issues[0]?.message || 'Not allowed.',
      issues: guards.issues,
    }
  }

  const loaded = await loadBusinessProfile({
    businessId,
    ownerId: userId,
    profile: injected,
    fetchProfile,
  })
  if (!loaded.ok) {
    return {
      ok: false,
      outcome: 'FAILED',
      code: loaded.errorType,
      message: loaded.message,
      profile: loaded.profile,
    }
  }

  let workspaceDir = input.workspaceDir
  if (!workspaceDir && userId && projectId) {
    const loc = await ensureWorkspace({ userId: String(userId), projectId: String(projectId) })
    workspaceDir = loc.dir
  }
  if (!workspaceDir) {
    return { ok: false, outcome: 'FAILED', code: 'WORKSPACE_REQUIRED', message: 'Isolated workspace is required.' }
  }

  const rt = runtime || createAgentRuntime()
  const ctx = { userId: String(userId || 'user'), projectId: String(projectId || 'site'), workspaceDir, permission: 'execute', signal }
  await onProgress?.({ currentStep: 'inspecting_project', message: 'Loading GetVia listing.' })
  const seeded = await seedWorkspaceFromProfile({ workspaceDir, profile: loaded.profile, runtime: rt, ctx })

  const task = await withTimeout(
    runAgentTask({
      prompt,
      workspaceDir,
      userId: ctx.userId,
      projectId: ctx.projectId,
      signal,
      runtime: rt,
      profile: loaded.profile,
      keepPreview,
      jobId,
      onEvent: async (event, current) => {
        await onProgress?.(progressFromEvent(event, current))
      },
    }),
    timeoutMs,
    signal,
  ).catch((err) => ({
    success: false,
    state: err.code === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
    message: err.message,
    filesChanged: seeded.written,
  }))

  let saved = false
  if (task.success && site && draft) {
    try {
      const persisted = await persistIsolatedDraft({
        site,
        draft,
        workspaceDir,
        userId,
        prompt,
        preview: task.preview,
      })
      saved = Boolean(persisted?.ok)
    } catch {
      /* auto-save is best-effort; job still reports the workspace result */
    }
  }

  return {
    ok: Boolean(task.success),
    outcome: task.success ? 'SUCCESS' : task.state === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
    message: task.message,
    intent: task.intent,
    design: task.design,
    build: task.build,
    review: task.review,
    browser: task.browser,
    visual: task.browser,
    preview: task.preview,
    isolatedPreviewUrl: task.preview?.url || null,
    written: task.filesChanged || seeded.written,
    profile: loaded.profile,
    missing: loaded.profile.missing,
    v2: true,
    saved,
    stages: task.phases,
    pipeline: ['getvia', 'profile', 'design', 'implementation', 'build', 'preview', 'browserQA', 'visualQA', 'review'],
    agent: {
      prompt,
      state: task.state,
      intent: task.intent,
      filesChanged: task.filesChanged || seeded.written,
      repairAttempts: task.repairAttempts || 0,
      lastActivity: task.lastActivity || null,
      ops: task.ops || [],
      recovered: Boolean(task.recovered),
    },
    gates: { build: task.build, browser: task.browser, review: task.review },
  }
}
