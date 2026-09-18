import { codingAgent } from '../agents/codingAgent.js'
import { applyTypedWorkspaceEdit } from './typedEdits.js'
import { executeTool } from './toolExecutor.js'
import { inspectProject } from './contextEngine.js'
import { repairWorkspaceJsx } from '../workspace/fixJsxRuntime.js'
import { runOpenAiCodingLoop } from '../openai/codingLoop.js'
import { runCodexWebsiteTask, shouldRunCodexAgent } from '../codex/index.js'
import { decideCoder } from '../v3/router.js'
import { getUsageContext } from '../openai/usageContext.js'
import {
  isCreditsExhaustedResult,
  markOpenAiHealthy,
  openAiSkipReason,
  OPENAI_QUOTA_MESSAGE,
} from '../openai/availability.js'

/**
 * Codex SDK is the primary website developer when the V3 router says the job needs one.
 * Typed edits, heuristics, and shared recipes skip Codex and the OpenAI loop.
 */
export async function executeCoding({
  workspaceDir,
  prompt,
  profile,
  signal,
  inspectOnly = false,
  userId,
  projectId,
  onEvent,
  learningBrief = '',
  allowedFiles = null,
  v3 = null,
  usageCtx = null,
} = {}) {
  const inspect = await inspectProject(workspaceDir, prompt)
  await onEvent?.({ type: 'FILE_READ', message: `Inspected ${inspect.homepage || 'workspace'}` })

  if (inspectOnly) {
    return {
      ok: true,
      success: true,
      tool: 'coding_executor',
      inspect,
      typed: { ok: true, skipped: true, written: [], events: [] },
      coder: { ok: true, skipped: true, written: [] },
      loop: { ok: true, skipped: true, written: [] },
      written: [],
      error: null,
    }
  }

  const typed = await applyTypedWorkspaceEdit({ workspaceDir, prompt })
  for (const event of typed.events || []) await onEvent?.(event)

  const decision = decideCoder({
    prompt,
    typed,
    hasSite: Boolean(inspect?.homepage),
    match: v3?.match,
  })
  let loop = { ok: false, skipped: true, written: [], coder: 'openai-loop' }
  let coder = { ok: false, written: [], coder: 'pending' }
  let usedCodex = false

  if (!decision.useCodex) {
    await onEvent?.({
      type: 'ANALYSIS_STARTED',
      message: `Skipped Codex (${decision.reason} / ${decision.promptClass}). Using the GetVia coder.`,
    })
  }

  const priorQuota = openAiSkipReason() === 'quota'
  // Never hard-fail on a sticky prior quota mark — always try Codex with the
  // current OPENAI_API_KEY_WEBSITE_BUILDER. Only fail when THIS attempt reports quota.

  if (shouldRunCodexAgent() && decision.useCodex) {
    if (priorQuota) {
      // Soft-clear so Codex can exercise the website-builder key after a cooldown/key change.
      await onEvent?.({
        type: 'ANALYSIS_STARTED',
        message: 'Retrying website builder after a previous OpenAI billing lock.',
      })
    }
    const ctx = usageCtx || getUsageContext()
    const codex = await runCodexWebsiteTask({
      workspaceDir,
      prompt,
      profile,
      userId: userId || ctx.userId,
      projectId,
      signal,
      onEvent,
      inspect,
      learningBrief,
      allowedFiles,
      usageCtx: ctx,
    })
    if (!codex.skipped) usedCodex = true
    if (codex.written?.length && codex.ok) {
      await onEvent?.({ type: 'FILE_UPDATED', message: `Codex wrote ${codex.written.join(', ')}` })
    }
    if (usedCodex) {
      loop = { ...codex, coder: 'codex-sdk' }
      coder = {
        ok: Boolean(codex.ok),
        coder: 'codex-sdk',
        written: codex.ok ? codex.written || [] : [],
        summary: codex.summary || (codex.ok ? 'Codex updated the isolated website.' : codex.error || 'Codex failed.'),
        threadId: codex.threadId || null,
        usage: codex.usage || null,
        model: codex.usageModel || 'codex',
        estimatedCostUsd: codex.estimatedCostUsd ?? null,
        code: codex.code || null,
        error: codex.error || null,
      }
      if (codex.ok) markOpenAiHealthy()
      if (isCreditsExhaustedResult(codex)) {
        await onEvent?.({ type: 'TASK_FAILED', message: OPENAI_QUOTA_MESSAGE })
        return {
          ok: false,
          success: false,
          tool: 'coding_executor',
          inspect,
          typed,
          loop,
          coder,
          written: [],
          threadId: coder.threadId || null,
          coderPolicy: decision,
          error: OPENAI_QUOTA_MESSAGE,
          code: 'OPENAI_QUOTA',
        }
      }
    }
  }

  if (!usedCodex && decision.useOpenAiLoop) {
    loop = await runOpenAiCodingLoop({
      workspaceDir,
      prompt,
      profile,
      userId,
      projectId,
      signal,
      onEvent,
      inspect,
      learningBrief,
      allowedFiles,
    })
    if (loop.written?.length) {
      await onEvent?.({ type: 'FILE_UPDATED', message: `OpenAI coder wrote ${loop.written.join(', ')}` })
    }
    if (isCreditsExhaustedResult(loop)) {
      await onEvent?.({ type: 'TASK_FAILED', message: OPENAI_QUOTA_MESSAGE })
      return {
        ok: false,
        success: false,
        tool: 'coding_executor',
        inspect,
        typed,
        loop,
        coder: {
          ok: false,
          coder: 'openai-loop',
          written: [],
          summary: OPENAI_QUOTA_MESSAGE,
          code: 'OPENAI_QUOTA',
        },
        written: [],
        coderPolicy: decision,
        error: OPENAI_QUOTA_MESSAGE,
        code: 'OPENAI_QUOTA',
      }
    }
  }

  if (!usedCodex) {
    coder = loop.written?.length
      ? { ok: true, coder: 'openai-loop', written: loop.written, summary: loop.summary || 'Updated isolated website files.' }
      : typed.written?.length && !decision.useOpenAiLoop
        ? {
            ok: true,
            coder: 'typed',
            written: typed.written,
            summary: 'Applied a local GetVia edit without Codex.',
          }
        : Array.isArray(allowedFiles) &&
            allowedFiles.length &&
            !/\b(add|remove|delete|button|whatsapp|phone|email|product|service|offer|faq)\b/i.test(String(prompt || ''))
          ? {
              ok: Boolean(loop.ok || typed.ok),
              coder: 'scoped-no-fallback',
              written: [],
              summary: loop.summary || 'Scoped edit: skipped site-wide heuristic fallback.',
            }
          : await codingAgent({ workspaceDir, prompt, profile, signal, usageCtx: {} })
  }
  if (!loop.written?.length && coder.written?.length) {
    // When a scoped allowlist is active, drop out-of-scope heuristic writes from the report
    // but keep business.json feature updates.
    if (Array.isArray(allowedFiles) && allowedFiles.length) {
      const allow = new Set(allowedFiles.map(String))
      allow.add('src/data/business.json')
      coder.written = coder.written.filter((f) => allow.has(String(f)))
    }
    if (coder.written.length) {
      await onEvent?.({ type: 'FILE_UPDATED', message: `Coder wrote ${coder.written.join(', ')}` })
    }
  }

  const repaired = await repairWorkspaceJsx(workspaceDir)
  const written = [...new Set([...(typed.written || []), ...(loop.written || []), ...(coder.written || []), ...(repaired.repaired || [])])]
  const ok = Boolean(typed.ok || loop.ok || coder.ok || written.length)
  return {
    ok,
    success: ok,
    tool: 'coding_executor',
    inspect,
    typed,
    loop,
    coder,
    written,
    threadId: coder.threadId || loop.threadId || null,
    coderPolicy: decision,
    error: ok ? null : loop.error || coder.error || 'CODING_FAILED',
    code: ok ? null : loop.code || coder.code || 'CODING_FAILED',
  }
}

export async function runBuildTool({ workspaceDir, userId, projectId }) {
  return executeTool({ tool: 'run_build', workspaceDir, userId, projectId })
}

export const CodingExecutor = { execute: executeCoding, runBuild: runBuildTool }
