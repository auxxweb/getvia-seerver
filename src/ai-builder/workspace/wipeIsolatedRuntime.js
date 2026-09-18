import { closeBrowserSession } from '../v2/browserSession.js'
import { getIsolatedPreview, stopIsolatedPreview } from '../preview/previewManager.js'
import { deleteWorkspaceProject } from './workspaceManager.js'

/**
 * End the live Vite preview, close QA browser, and delete generated files so
 * the next prompt scaffolds a new project instead of editing leftovers.
 */
export async function wipeIsolatedRuntimeForSite({ userId, siteId, previewPort } = {}) {
  const projectId = String(siteId || '')
  const tracked = getIsolatedPreview(projectId)
  const port = tracked?.port ?? previewPort ?? null
  await closeBrowserSession(projectId).catch(() => ({ ok: true }))
  await stopIsolatedPreview(projectId, { port }).catch(() => ({ ok: true, stopped: false }))
  if (!userId || !projectId) return { ok: true, workspaceDeleted: false }
  try {
    await deleteWorkspaceProject({ userId: String(userId), projectId })
    return { ok: true, workspaceDeleted: true }
  } catch (err) {
    if (err?.code === 'PATH_REJECTED' || err?.code === 'WORKSPACE_UNSAFE') {
      return { ok: true, workspaceDeleted: false, code: err.code }
    }
    throw err
  }
}
