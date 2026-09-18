import { envFlag } from '../runtimeFlags.js'
import { isOpenAiConfigured } from '../openai/client.js'

export function isCodexSdkEnabled() {
  if (envFlag('AI_SKIP_CODEX')) return false
  if (envFlag('AI_SKIP_CODING_LLM')) return false
  if (process.env.NODE_TEST_CONTEXT && !envFlag('AI_TEST_CODEX')) return false
  return envFlag('AI_USE_CODEX') || envFlag('AI_CODEX_PRIMARY')
}

export function isCodexConfigured() {
  return isOpenAiConfigured()
}

export function shouldRunCodexAgent() {
  return isCodexSdkEnabled() && isCodexConfigured()
}

export function codexSkipReason() {
  if (envFlag('AI_SKIP_CODEX') || envFlag('AI_SKIP_CODING_LLM')) return 'AI_SKIP_CODEX'
  if (!isCodexSdkEnabled()) return 'CODEX_DISABLED'
  if (!isOpenAiConfigured()) return 'OPENAI_NOT_CONFIGURED'
  return null
}
