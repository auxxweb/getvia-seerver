import { commitVersion } from './versionService.js'
import { aiError, AiErrorCode } from '../errors.js'
import { ensureWorkspace } from '../workspace/workspaceManager.js'
import { restoreIsolatedSnapshot } from '../workspace/persistIsolatedDraft.js'

export async function restoreVersionSnapshot({ site, draft, version, user }) {
  if (version.siteId.toString() !== site._id.toString()) {
    throw aiError(403, 'Not your version.', { code: AiErrorCode.FORBIDDEN })
  }
  const snap = version.snapshot?.websiteState || version.snapshot
  if (!snap || typeof snap !== 'object') {
    throw aiError(400, 'This version cannot be restored.', { code: AiErrorCode.NOT_FOUND })
  }
  draft.websiteState = snap
  draft.contentOverlay = snap.content || {}
  draft.themeOverlay = snap.theme || {}
  const isolated = version.snapshot?.isolated || draft.isolatedSnapshot
  if (isolated) {
    draft.isolatedSnapshot = isolated
    draft.markModified('isolatedSnapshot')
    try {
      const loc = await ensureWorkspace({
        userId: String(user?._id || site.ownerId),
        projectId: String(site._id),
      })
      await restoreIsolatedSnapshot(loc.dir, isolated)
    } catch {
      /* workspace restore is best-effort; draft snapshot is already saved */
    }
  }
  draft.revisionNumber += 1
  await draft.save()
  const restored = await commitVersion({
    site,
    draft,
    userId: user._id,
    versionType: 'RESTORED',
    source: 'manual',
    prompt: `Restored version ${version.versionNumber}`,
    parentVersionId: site.publishedVersionId,
    changeSet: { restoredFrom: String(version._id), restoredVersionNumber: version.versionNumber },
  })
  return { draft, version: restored }
}

export async function duplicateVersionSnapshot({ site, draft, version, user }) {
  return restoreVersionSnapshot({ site, draft, version, user })
}
