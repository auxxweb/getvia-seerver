import { envFlag } from '../runtimeFlags.js'
import { getWebsiteBuilderApiKey, recordUsage } from '../openai/client.js'
import { getUsageContext } from '../openai/usageContext.js'
import { extractCodexUsage } from '../openai/usagePricing.js'
import { isOpenAiBillingError, markOpenAiUnavailable, OPENAI_QUOTA_MESSAGE } from '../openai/availability.js'
import { shouldRunCodexAgent, codexSkipReason } from './availability.js'
import { emptyCodexRun } from './types.js'
import { filesFromCodexItems, mapCodexEvent } from './events.js'
import { buildCodexDeveloperPrompt } from './prompt.js'
import { readCodexThreadId, writeCodexThreadId } from './workspaceContext.js'

const DEFAULT_TIMEOUT_MS = 8 * 60 * 1000

function timeoutMs() {
  const n = Number(process.env.AI_CODEX_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  return Number.isFinite(n) && n > 10_000 ? n : DEFAULT_TIMEOUT_MS
}

function sandboxMode() {
  const raw = String(process.env.AI_CODEX_SANDBOX || 'workspace-write').trim()
  if (raw === 'read-only' || raw === 'danger-full-access' || raw === 'workspace-write') return raw
  return 'workspace-write'
}

export async function loadCodexSdk() {
  if (!shouldRunCodexAgent()) return null
  try {
    return await import('@openai/codex-sdk')
  } catch (err) {
    err.code = err.code || 'CODEX_SDK_MISSING'
    throw err
  }
}

function cliEnv(apiKey) {
  const allow = [
    'PATH',
    'HOME',
    'USER',
    'LOGNAME',
    'SHELL',
    'LANG',
    'LC_ALL',
    'TERM',
    'TMPDIR',
    'TMP',
    'TEMP',
    'XDG_CACHE_HOME',
    'XDG_CONFIG_HOME',
    'CODEX_HOME',
  ]
  const env = {}
  for (const key of allow) {
    if (process.env[key]) env[key] = process.env[key]
  }
  env.OPENAI_API_KEY = apiKey
  env.CODEX_API_KEY = apiKey
  env.TERM = env.TERM || 'dumb'
  env.LANG = env.LANG || 'en_US.UTF-8'
  return env
}

function createClient(Codex) {
  const apiKey = getWebsiteBuilderApiKey()
  if (!apiKey) {
    throw Object.assign(new Error('OPENAI_API_KEY_WEBSITE_BUILDER is not configured'), {
      code: 'OPENAI_NOT_CONFIGURED',
    })
  }
  return new Codex({
    apiKey,
    env: cliEnv(apiKey),
    config: {
      sandbox_workspace_write: { network_access: false },
    },
  })
}

export async function runCodexWebsiteTask({
  workspaceDir,
  prompt,
  profile,
  userId,
  projectId,
  signal,
  onEvent,
  inspect,
  learningBrief = '',
  allowedFiles = null,
  brief = '',
  threadId = null,
  sdk = null,
  usageCtx = null,
} = {}) {
  const skip = codexSkipReason()
  if (skip) return { ...emptyCodexRun(), code: skip }
  if (!workspaceDir || !prompt) return { ...emptyCodexRun(), code: 'MISSING_WORKSPACE' }

  try {
    sdk = sdk || (await loadCodexSdk())
  } catch (err) {
    return { ...emptyCodexRun(), skipped: true, code: 'CODEX_SDK_MISSING', error: String(err.message || err) }
  }

  const Codex = sdk.Codex || sdk.default
  if (!Codex) return { ...emptyCodexRun(), code: 'CODEX_SDK_MISSING' }

  const timeout = AbortSignal.timeout(timeoutMs())
  const combined =
    signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : signal || timeout
  const client = createClient(Codex)
  const savedId = threadId || (await readCodexThreadId(workspaceDir))
  const threadOptions = {
    workingDirectory: workspaceDir,
    skipGitRepoCheck: true,
    sandboxMode: sandboxMode(),
    approvalPolicy: 'never',
    networkAccessEnabled: false,
    model: String(process.env.AI_CODEX_MODEL || process.env.OPENAI_COMPLEX_MODEL || '').trim() || undefined,
  }
  const thread = savedId ? client.resumeThread(savedId, threadOptions) : client.startThread(threadOptions)
  const input = buildCodexDeveloperPrompt({
    prompt,
    brief,
    learningBrief,
    allowedFiles,
    scoped: Boolean(allowedFiles?.length),
    profile,
    inspect,
  })

  const events = []
  const items = []
  let summary = ''
  let usage = null
  let failed = null
  await onEvent?.({ type: 'IMPLEMENTATION_STARTED', message: savedId ? 'Resuming Codex developer thread' : 'Starting Codex developer thread' })

  try {
    const streamed = await thread.runStreamed(input, { signal: combined })
    for await (const event of streamed.events) {
      if (event.type === 'thread.started' && event.thread_id) {
        await writeCodexThreadId(workspaceDir, event.thread_id, { projectId })
      }
      if (event.type === 'item.completed' && event.item) items.push(event.item)
      const eventUsage = event?.usage || event?.event?.usage || event?.turn?.usage
      if (eventUsage) usage = eventUsage
      if (event.type === 'turn.failed') failed = event.error || { message: 'Codex turn failed' }
      const mapped = mapCodexEvent(event)
      if (mapped) {
        events.push(mapped)
        await onEvent?.(mapped)
      }
    }
    if (streamed?.usage) usage = streamed.usage
    if (streamed?.final_response?.usage) usage = streamed.final_response.usage
  } catch (err) {
    failed = err
  }

  const liveThreadId = thread.id || savedId || (await readCodexThreadId(workspaceDir))
  if (liveThreadId) {
    await writeCodexThreadId(workspaceDir, liveThreadId, {
      projectId,
      lastError: failed ? String(failed.message || failed) : null,
    })
  }
  const parsedUsage = extractCodexUsage(events, usage)
  const ctx = { ...getUsageContext(), ...(usageCtx || {}) }
  const codexModel = threadOptions.model || process.env.AI_CODEX_MODEL || process.env.OPENAI_COMPLEX_MODEL || 'codex'
  const usageModel = `codex/${codexModel}`
  const recorded = await recordUsage({
    userId: userId || ctx.userId,
    businessId: ctx.businessId,
    siteId: ctx.siteId,
    jobId: ctx.jobId,
    prompt: ctx.prompt || prompt,
    model: usageModel,
    operation: 'codex_sdk',
    usage: {
      prompt_tokens: parsedUsage.inputTokens,
      completion_tokens: parsedUsage.outputTokens,
      cached_input_tokens: parsedUsage.cachedInputTokens,
    },
  }).catch(() => null)
  const estimatedCostUsd = recorded?.estimatedCostUsd
  if (parsedUsage.inputTokens || parsedUsage.outputTokens) {
    await onEvent?.({
      type: 'TURN_COMPLETED',
      message: `Codex tokens: ${parsedUsage.inputTokens} in / ${parsedUsage.outputTokens} out${
        estimatedCostUsd != null ? ` (≈ $${Number(estimatedCostUsd).toFixed(4)})` : ''
      }`,
      usage: parsedUsage,
    })
  }

  const written = filesFromCodexItems(items)
  const failMsg = failed ? String(failed.message || failed.error?.message || failed || 'Codex turn failed') : ''
  const quotaHit = Boolean(failed && isOpenAiBillingError(failed))
  if (quotaHit) markOpenAiUnavailable('quota')
  summary =
    items.find((row) => row.type === 'agent_message')?.text ||
    (quotaHit ? OPENAI_QUOTA_MESSAGE : failed ? failMsg : 'Codex updated the website workspace.')
  if (failed) {
    return {
      ok: false,
      skipped: false,
      coder: 'codex-sdk',
      threadId: liveThreadId || null,
      written: quotaHit ? [] : written,
      items,
      events,
      summary: String(summary).slice(0, 800),
      usage: parsedUsage,
      usageModel,
      estimatedCostUsd: estimatedCostUsd ?? null,
      error: quotaHit ? OPENAI_QUOTA_MESSAGE : failMsg,
      code: quotaHit ? 'OPENAI_QUOTA' : 'CODEX_TURN_FAILED',
    }
  }
  return {
    ok: true,
    skipped: false,
    coder: 'codex-sdk',
    threadId: liveThreadId || null,
    written,
    items,
    events,
    summary: String(summary).slice(0, 800),
    usage: parsedUsage,
    usageModel,
    estimatedCostUsd: estimatedCostUsd ?? null,
    error: null,
    code: null,
  }
}

export function isCodexPrimary() {
  return envFlag('AI_USE_CODEX') || envFlag('AI_CODEX_PRIMARY')
}
