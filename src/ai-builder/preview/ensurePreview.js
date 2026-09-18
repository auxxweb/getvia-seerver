import { workspacePathFor, ensureWorkspace } from '../workspace/workspaceManager.js'
import { workspaceHasSite, ensurePreviewEditorInWorkspace } from '../workspace/viteScaffold.js'
import { restoreIsolatedSnapshot } from '../workspace/persistIsolatedDraft.js'
import { repairWorkspaceJsx } from '../workspace/fixJsxRuntime.js'
import { isIsolatedRuntimeEnabled, isHostPreviewAllowed } from '../runtimeFlags.js'
import {
  ensureIsolatedPreviewProcess,
  getIsolatedPreview,
  previewPortFromUrl,
} from './previewManager.js'

const reviveInFlight = new Map()

export async function reviveIsolatedPreview({ user, site, draft } = {}) {
  const key = String(site?._id || '')
  if (key && reviveInFlight.has(key)) return reviveInFlight.get(key)
  const run = doReviveIsolatedPreview({ user, site, draft }).finally(() => {
    if (key) reviveInFlight.delete(key)
  })
  if (key) reviveInFlight.set(key, run)
  return run
}

async function doReviveIsolatedPreview({ user, site, draft } = {}) {
  if (!isIsolatedRuntimeEnabled() || !isHostPreviewAllowed() || !site || !draft) {
    return { ok: false, skipped: true }
  }
  let loc
  try {
    loc = workspacePathFor({ userId: String(user?._id || site.ownerId), projectId: String(site._id) })
  } catch {
    return { ok: false, skipped: true, code: 'PATH_REJECTED' }
  }
  if (!(await workspaceHasSite(loc.dir))) {
    if (draft.isolatedSnapshot?.files) {
      try {
        const ensured = await ensureWorkspace({
          userId: String(user?._id || site.ownerId),
          projectId: String(site._id),
        })
        await restoreIsolatedSnapshot(ensured.dir, draft.isolatedSnapshot)
      } catch {
        /* fall through to NO_SITE if restore failed */
      }
    }
  }
  await repairWorkspaceJsx(loc.dir)
  await ensurePreviewEditorInWorkspace(loc.dir).catch(() => ({ ok: false }))
  if (!(await workspaceHasSite(loc.dir))) {
    if (draft.isolatedPreviewUrl || draft.isolatedPreviewPort) {
      draft.isolatedPreviewUrl = ''
      draft.isolatedPreviewPort = null
      await draft.save()
    }
    return { ok: false, skipped: true, code: 'NO_SITE' }
  }
  const preferredPort = draft.isolatedPreviewPort || previewPortFromUrl(draft.isolatedPreviewUrl)
  const preview = await ensureIsolatedPreviewProcess({
    projectId: String(site._id),
    workspaceDir: loc.dir,
    preferredPort,
  })
  if (preview.ok) {
    draft.isolatedPreviewUrl = preview.url
    draft.isolatedPreviewPort = preview.port
    await draft.save()
  } else if (draft.isolatedPreviewUrl) {
    draft.isolatedPreviewUrl = ''
    draft.isolatedPreviewPort = null
    await draft.save()
  }
  return preview
}

export function livePreviewUrlFor(projectId, draft) {
  return getIsolatedPreview(projectId)?.url || draft?.isolatedPreviewUrl || null
}
