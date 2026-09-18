/**
 * Isolated preview gates. Host Vite is started only by previewManager when
 * PREVIEW_ENABLED=1. Clients never choose ports.
 */
import { isHostPreviewAllowed } from '../runtimeFlags.js'
import { startIsolatedPreviewProcess, ensureIsolatedPreviewProcess, getViaPreviewHint } from './previewManager.js'

export function isPreviewRuntimeEnabled() {
  return isHostPreviewAllowed()
}

export function startIsolatedPreview({ projectId, workspaceDir, portFromClient } = {}) {
  if (portFromClient != null) {
    return { ok: false, code: 'PREVIEW_PORT_REJECTED', message: 'Clients cannot choose preview ports.' }
  }
  if (!projectId) {
    return { ok: false, code: 'PREVIEW_REJECTED', message: 'projectId is required.' }
  }
  if (!isPreviewRuntimeEnabled()) {
    return {
      ok: false,
      code: 'PREVIEW_SANDBOX_REQUIRED',
      message:
        'Set PREVIEW_ENABLED=1 to start the generated Vite app on 127.0.0.1 with an allocated port (4100-4199).',
    }
  }
  if (!workspaceDir) {
    return { ok: false, code: 'PREVIEW_REJECTED', message: 'workspaceDir is required to start preview.' }
  }
  return startIsolatedPreviewProcess({ projectId, workspaceDir })
}

export { getViaPreviewHint, startIsolatedPreviewProcess, ensureIsolatedPreviewProcess }
