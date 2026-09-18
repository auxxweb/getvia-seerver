import { envFlag } from '../runtimeFlags.js'
import { getOpenAiClient, getWebsiteBuilderApiKey, isOpenAiConfigured } from './client.js'

let disabledReason = null
let disabledAt = 0
let disabledForKey = ''
let openaiHealthy = false
let probed = false
let probedForKey = ''

/** How long a quota mark blocks retries before we try the website-builder key again. */
const QUOTA_COOLDOWN_MS = 60_000

export const OPENAI_QUOTA_MESSAGE =
  'Website builder OpenAI credits are exhausted. Your change was not applied. Check billing for OPENAI_API_KEY_WEBSITE_BUILDER, then try again.'

function currentKeyFingerprint() {
  const key = getWebsiteBuilderApiKey()
  if (!key) return ''
  return `${key.length}:${key.slice(0, 8)}:${key.slice(-4)}`
}

function clearDisabledIfStale() {
  const keyFp = currentKeyFingerprint()
  if (disabledReason && keyFp && disabledForKey && keyFp !== disabledForKey) {
    console.warn('[openai] website-builder API key changed · clearing prior quota lock')
    disabledReason = null
    disabledAt = 0
    disabledForKey = ''
    probed = false
    openaiHealthy = false
    probedForKey = ''
    return
  }
  if (
    disabledReason === 'quota' &&
    disabledAt &&
    Date.now() - disabledAt >= QUOTA_COOLDOWN_MS
  ) {
    console.warn('[openai] quota cooldown expired · retrying website-builder OpenAI calls')
    disabledReason = null
    disabledAt = 0
    disabledForKey = ''
    probed = false
    openaiHealthy = false
    probedForKey = ''
  }
}

export function isOpenAiBillingError(err) {
  const status = Number(err?.status || err?.statusCode || 0)
  const code = String(err?.code || err?.error?.code || err?.type || '')
  const msg = String(err?.message || err?.error?.message || err || '').toLowerCase()
  if (code === 'insufficient_quota' || code === 'billing_hard_limit_reached') return true
  // Do not treat our own OPENAI_QUOTA code string as a live billing signal when
  // recirculated through summaries — require real API billing codes/messages.
  if (
    /insufficient_quota|exceeded your current quota|billing hard limit|no credits|credit balance|out of credits|you've run out of credits|billing_hard_limit/.test(
      msg,
    )
  ) {
    return true
  }
  return status === 429 && /insufficient_quota|exceeded your current quota|billing/.test(msg)
}

/** True when a coding result indicates GetVia tokens empty or OpenAI/Codex quota. */
export function isCreditsExhaustedResult(result) {
  const code = String(result?.code || result?.coder?.code || '')
  if (code === 'OPENAI_QUOTA' || code === 'AI_TOKENS_EMPTY' || code === 'quota') return true
  const errPayload = result?.error
  if (errPayload && typeof errPayload === 'object') return isOpenAiBillingError(errPayload)
  return isOpenAiBillingError({ message: String(errPayload || '') })
}

export function markOpenAiUnavailable(reason = 'quota') {
  openaiHealthy = false
  const next = String(reason || 'quota')
  if (disabledReason === next) return disabledReason
  disabledReason = next
  disabledAt = Date.now()
  disabledForKey = currentKeyFingerprint()
  console.warn(`[openai] ${disabledReason} · skipping further OpenAI calls until cooldown or key change`)
  return disabledReason
}

export function markOpenAiHealthy() {
  openaiHealthy = true
  probed = true
  probedForKey = currentKeyFingerprint()
  disabledReason = null
  disabledAt = 0
  disabledForKey = ''
}

export function clearOpenAiUnavailable(reason = 'manual') {
  if (!disabledReason) return false
  console.warn(`[openai] cleared ${disabledReason} lock (${reason})`)
  disabledReason = null
  disabledAt = 0
  disabledForKey = ''
  probed = false
  openaiHealthy = false
  probedForKey = ''
  return true
}

export function shouldSkipOpenAiLlm() {
  clearDisabledIfStale()
  return envFlag('AI_SKIP_CODING_LLM') || Boolean(disabledReason)
}

export function openAiSkipReason() {
  clearDisabledIfStale()
  if (envFlag('AI_SKIP_CODING_LLM')) return 'AI_SKIP_CODING_LLM'
  return disabledReason
}

export function hasFallbackLlm() {
  return Boolean(
    process.env.ANTHROPIC_API_KEY?.trim() ||
      process.env.XAI_API_KEY?.trim() ||
      process.env.GROK_API_KEY?.trim() ||
      process.env.OPENROUTER_API_KEY?.trim() ||
      process.env.OPENAI_COMPAT_API_KEY?.trim() ||
      process.env.LOCAL_LLM_URL?.trim(),
  )
}

export async function ensureOpenAiAvailability() {
  clearDisabledIfStale()
  if (envFlag('AI_SKIP_CODING_LLM')) return { ok: false, skipped: true, code: 'AI_SKIP_CODING_LLM' }
  if (disabledReason) return { ok: false, skipped: true, code: disabledReason }
  if (!isOpenAiConfigured()) return { ok: false, skipped: true, code: 'OPENAI_NOT_CONFIGURED' }
  const keyFp = currentKeyFingerprint()
  if ((openaiHealthy || probed) && probedForKey === keyFp) {
    return { ok: openaiHealthy, skipped: !openaiHealthy }
  }
  if (process.env.NODE_TEST_CONTEXT) return { ok: true, skipped: true, code: 'TEST' }
  probed = true
  probedForKey = keyFp
  try {
    const client = getOpenAiClient()
    await client.chat.completions.create(
      {
        model: String(process.env.OPENAI_PROBE_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'ok' }],
        max_tokens: 1,
      },
      { signal: AbortSignal.timeout(8000) },
    )
    markOpenAiHealthy()
    return { ok: true }
  } catch (err) {
    if (isOpenAiBillingError(err)) {
      markOpenAiUnavailable('quota')
      return { ok: false, skipped: true, code: 'OPENAI_QUOTA' }
    }
    // Non-billing probe errors (model/auth/network) should not sticky-lock the builder.
    return { ok: true, probeError: String(err?.message || err) }
  }
}

export function resetOpenAiAvailabilityForTests() {
  disabledReason = null
  disabledAt = 0
  disabledForKey = ''
  openaiHealthy = false
  probed = false
  probedForKey = ''
}
