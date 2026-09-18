export function envFlag(name) {
  const raw = String(process.env[name] || '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

/** Per-tenant React+Vite one-page workspaces. Off unless explicitly enabled. */
export function isIsolatedRuntimeEnabled() {
  return envFlag('AI_ISOLATED_RUNTIME')
}

export function shouldRunWorkspaceNpm() {
  if (envFlag('AI_SKIP_WORKSPACE_NPM')) return false
  return isIsolatedRuntimeEnabled()
}

export function isHostPreviewAllowed() {
  return envFlag('PREVIEW_ENABLED')
}

/** Dual-run the rebuilt agent runtime on isolated website jobs. Off unless explicitly enabled. */
export function isAgentRuntimeEnabled() {
  return envFlag('AI_AGENT_RUNTIME')
}

export function skipWebsiteStateSync() {
  return envFlag('AI_SKIP_WEBSITE_STATE_SYNC')
}

/** Official Codex SDK is the primary website developer when enabled. */
export function isCodexRuntimeEnabled() {
  if (envFlag('AI_SKIP_CODEX') || envFlag('AI_SKIP_CODING_LLM')) return false
  return envFlag('AI_USE_CODEX') || envFlag('AI_CODEX_PRIMARY')
}
