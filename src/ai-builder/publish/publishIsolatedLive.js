import fs from 'node:fs/promises'
import path from 'node:path'
import { inspectWorkspaceBuild } from '../validation/isolatedBuild.js'
import { workspacePathFor, ensureWorkspace } from '../workspace/workspaceManager.js'
import { workspaceHasSite, writePreviewViteConfig } from '../workspace/viteScaffold.js'
import { restoreIsolatedSnapshot } from '../workspace/persistIsolatedDraft.js'
import { runWorkspaceCommand } from '../workspace/runCommand.js'
import { getPublicApiOrigin } from '../getvia/publicApi.js'

const LIVE_PREFIX = '/ai-live'

export function publishRootDir() {
  const root = String(
    process.env.AI_PUBLISH_ROOT ||
      path.join(process.env.AI_WORKSPACE_ROOT || '/tmp/getvia-ai-workspaces', '_published'),
  )
  return path.resolve(root)
}

export function publishedLiveBasePath(siteId) {
  return `${LIVE_PREFIX}/${encodeURIComponent(String(siteId || ''))}/`
}

export function publicIsolatedLiveUrl(siteId) {
  const apiOrigin = String(
    process.env.PUBLIC_API_ORIGIN || process.env.GETVIA_API_ORIGIN || process.env.GETVIA_PUBLIC_API_ORIGIN || '',
  ).replace(/\/$/, '')
  if (!apiOrigin || /127\.0\.0\.1|localhost/i.test(apiOrigin)) {
    const port = process.env.PORT || '5001'
    return `http://127.0.0.1:${port}${publishedLiveBasePath(siteId)}`
  }
  return `${apiOrigin}${publishedLiveBasePath(siteId)}`
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) await copyDir(from, to)
    else await fs.copyFile(from, to)
  }
}

/**
 * Build (if needed) and copy the isolated Vite dist so the public profile can
 * iframe the same React site the owner saw in AI Builder preview.
 */
export async function publishIsolatedLiveSite({ user, site, draft } = {}) {
  if (!site?._id) return { ok: false, code: 'SITE_REQUIRED', message: 'Site is required.' }
  const siteId = String(site._id)
  let loc
  try {
    loc = workspacePathFor({ userId: String(user?._id || site.ownerId), projectId: siteId })
  } catch (err) {
    return { ok: false, code: 'PATH_REJECTED', message: String(err?.message || err) }
  }

  if (!(await workspaceHasSite(loc.dir)) && draft?.isolatedSnapshot?.files) {
    const ensured = await ensureWorkspace({ userId: String(user?._id || site.ownerId), projectId: siteId })
    await restoreIsolatedSnapshot(ensured.dir, draft.isolatedSnapshot)
  }
  if (!(await workspaceHasSite(loc.dir))) {
    return { ok: false, skipped: true, code: 'NO_ISOLATED_SITE', message: 'No isolated React site to publish.' }
  }

  const liveBase = publishedLiveBasePath(siteId)
  await writePreviewViteConfig(loc.dir, { apiOrigin: getPublicApiOrigin() }).catch(() => null)

  // Always rebuild with the public /ai-live/:id/ base so assets resolve in the iframe.
  const build = await runWorkspaceCommand({
    cwd: loc.dir,
    command: 'npm run build',
    extraEnv: {
      GETVIA_PREVIEW_BASE: liveBase,
      GETVIA_API_ORIGIN: getPublicApiOrigin(),
    },
    timeoutMs: 4 * 60 * 1000,
  })
  if (!build.ok) {
    try {
      await fs.access(path.join(loc.dir, 'dist', 'index.html'))
    } catch {
      return {
        ok: false,
        code: build.code || 'BUILD_FAILED',
        message: build.message || 'Could not build the website for publish.',
      }
    }
  }

  const distDir = path.join(loc.dir, 'dist')
  const outDir = path.join(publishRootDir(), siteId)
  await fs.rm(outDir, { recursive: true, force: true }).catch(() => null)
  await copyDir(distDir, outDir)

  const indexPath = path.join(outDir, 'index.html')
  try {
    let html = await fs.readFile(indexPath, 'utf8')
    html = html.replace(/<base\b[^>]*>/gi, '')
    html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${liveBase}">`)
    const prefix = liveBase.replace(/\/$/, '')
    html = html.replace(/(src|href)=(["'])(\/[^"']*)\2/gi, (full, attr, quote, pth) => {
      if (pth.startsWith('//')) return full
      if (pth === prefix || pth.startsWith(`${prefix}/`)) return full
      return `${attr}=${quote}${prefix}${pth}${quote}`
    })
    await fs.writeFile(indexPath, html, 'utf8')
  } catch {
    return { ok: false, code: 'DIST_MISSING', message: 'Published build is missing index.html.' }
  }

  return { ok: true, url: publicIsolatedLiveUrl(siteId), outDir, siteId }
}

export { LIVE_PREFIX }
