import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import net from 'node:net'
import fs from 'node:fs/promises'
import path from 'node:path'
import { assertAllowedCommand } from '../security/commandPolicy.js'
import { sanitizedWorkspaceEnv } from '../security/workspaceEnv.js'
import { isHostPreviewAllowed } from '../runtimeFlags.js'
import { repairWorkspaceJsx } from '../workspace/fixJsxRuntime.js'
import { writePreviewViteConfig } from '../workspace/viteScaffold.js'
import { inspectWorkspaceBuild } from '../validation/isolatedBuild.js'
import { runWorkspaceCommand } from '../workspace/runCommand.js'
import { publicIsolatedPreviewUrl, shouldUsePublicPreviewProxy } from './previewProxy.js'
import { getPublicSiteOrigin } from '../constants.js'
import { getPublicApiOrigin } from '../getvia/publicApi.js'

const execFileAsync = promisify(execFile)

const previews = new Map()
const PORT_MIN = 4100
const PORT_MAX = 4199

function isPreviewRuntimeEnabled() {
  return isHostPreviewAllowed()
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true))
    })
  })
}

export async function allocatePreviewPort() {
  const used = new Set([...previews.values()].map((row) => row.port))
  for (let port = PORT_MIN; port <= PORT_MAX; port += 1) {
    if (used.has(port)) continue
    if (await portFree(port)) return port
  }
  return null
}

export function getIsolatedPreview(projectId) {
  return previews.get(String(projectId || '')) || null
}

export function previewPortFromUrl(url) {
  try {
    const port = Number(new URL(String(url || '')).port)
    return Number.isInteger(port) && port >= PORT_MIN && port <= PORT_MAX ? port : null
  } catch {
    return null
  }
}

export async function isPreviewListening(port) {
  if (!Number.isInteger(port) || port < PORT_MIN || port > PORT_MAX) return false
  return !(await portFree(port))
}

/** Rebuild workspace dist with base "/" when publish left /ai-live/ paths in dist. */
async function ensurePreviewSafeDist(workspaceDir) {
  const distIndex = path.join(workspaceDir, 'dist', 'index.html')
  try {
    const html = await fs.readFile(distIndex, 'utf8')
    if (!/\/ai-live\/[a-f0-9]+\//i.test(html)) return { ok: true, rebuilt: false }
  } catch {
    return { ok: true, rebuilt: false }
  }
  await writePreviewViteConfig(workspaceDir, { apiOrigin: getPublicApiOrigin() }).catch(() => null)
  const result = await runWorkspaceCommand({
    cwd: workspaceDir,
    command: 'npm run build',
    extraEnv: { GETVIA_PREVIEW_BASE: '/', GETVIA_BUILD_OUTDIR: 'dist' },
    timeoutMs: 4 * 60 * 1000,
  })
  return { ...result, rebuilt: true }
}

function killProcessTree(child, signal = 'SIGTERM') {
  if (!child?.pid) return
  try {
    process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      /* already gone */
    }
  }
}

async function killListenerOnPort(port) {
  if (!Number.isInteger(port) || port < PORT_MIN || port > PORT_MAX) return
  try {
    const { stdout } = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      timeout: 3000,
    })
    const pids = String(stdout || '')
      .split(/\s+/)
      .map((value) => Number(value))
      .filter((pid) => Number.isInteger(pid) && pid > 1)
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* no listener on this host */
  }
}

export async function stopIsolatedPreview(projectId, { port } = {}) {
  const key = String(projectId || '')
  const current = previews.get(key)
  if (current) {
    killProcessTree(current.child, 'SIGTERM')
    setTimeout(() => killProcessTree(current.child, 'SIGKILL'), 1500)
    if (current.port) await killListenerOnPort(current.port)
    previews.delete(key)
    return { ok: true, stopped: true, port: current.port }
  }
  const orphanPort = Number(port)
  if (Number.isInteger(orphanPort) && orphanPort >= PORT_MIN && orphanPort <= PORT_MAX) {
    await killListenerOnPort(orphanPort)
    return { ok: true, stopped: true, port: orphanPort, orphan: true }
  }
  return { ok: true, stopped: false }
}

function waitForReady(child, timeoutMs = 15_000) {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const done = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      done({ ok: false, code: 'PREVIEW_TIMEOUT', stdout, stderr, message: 'Preview server did not become ready.' })
    }, timeoutMs)
    const consider = () => {
      if (/Local:|ready in|127\.0\.0\.1:\d+|localhost:\d+/i.test(`${stdout}\n${stderr}`)) {
        done({ ok: true, stdout, stderr })
      }
    }
    child.stdout.on('data', (c) => {
      stdout += String(c)
      consider()
    })
    child.stderr.on('data', (c) => {
      stderr += String(c)
      consider()
    })
    child.on('error', (errObj) => {
      done({ ok: false, code: 'PREVIEW_CRASH', message: String(errObj.message || errObj), stdout, stderr })
    })
    child.on('close', (code) => {
      done({
        ok: false,
        code: 'PREVIEW_EXITED',
        message: `Preview process exited ${code}.`,
        stdout,
        stderr,
      })
    })
  })
}

export async function startIsolatedPreviewProcess({ projectId, workspaceDir, portFromClient } = {}) {
  if (portFromClient != null) {
    return { ok: false, code: 'PREVIEW_PORT_REJECTED', message: 'Clients cannot choose preview ports.' }
  }
  if (!projectId) {
    return { ok: false, code: 'PREVIEW_REJECTED', message: 'projectId is required.' }
  }
  if (process.env.NODE_ENV === 'production' && !isPreviewRuntimeEnabled()) {
    return {
      ok: false,
      code: 'PREVIEW_SANDBOX_REQUIRED',
      message: 'Untrusted generated apps are not started on the API host in production without PREVIEW_ENABLED.',
    }
  }
  if (!isPreviewRuntimeEnabled()) {
    return {
      ok: false,
      code: 'PREVIEW_SANDBOX_REQUIRED',
      message: 'Set PREVIEW_ENABLED=1 to bind generated Vite apps on 127.0.0.1 with an allocated port.',
    }
  }
  if (!workspaceDir) {
    return { ok: false, code: 'PREVIEW_REJECTED', message: 'workspaceDir is required to start preview.' }
  }
  await repairWorkspaceJsx(workspaceDir)
  const usePublicProxy = shouldUsePublicPreviewProxy()
  let command = 'npm run dev'
  if (usePublicProxy) {
    // Static `vite preview` has no HMR websocket (the live-host failure mode).
    const distIndex = path.join(workspaceDir, 'dist', 'index.html')
    let hasDist = false
    try {
      await fs.access(distIndex)
      hasDist = true
    } catch {
      hasDist = false
    }
    if (!hasDist) {
      const built = await inspectWorkspaceBuild({ workspaceDir, runBuild: true })
      hasDist = Boolean(built?.ok)
    }
    if (hasDist) {
      const safe = await ensurePreviewSafeDist(workspaceDir)
      if (!safe.ok && safe.rebuilt) {
        return {
          ok: false,
          code: safe.code || 'BUILD_FAILED',
          message: safe.message || 'Could not rebuild preview dist.',
        }
      }
      command = 'npm run preview'
    }
  }
  const allowed = assertAllowedCommand(command)
  if (!allowed.ok) return allowed
  await stopIsolatedPreview(projectId)
  const port = await allocatePreviewPort()
  if (!port) {
    return { ok: false, code: 'PREVIEW_NO_PORT', message: 'No free preview port in 4100-4199.' }
  }

  const apiOrigin = String(
    process.env.GETVIA_API_ORIGIN ||
      process.env.PUBLIC_API_ORIGIN ||
      `http://127.0.0.1:${process.env.PORT || 5001}`,
  ).replace(/\/$/, '')
  const previewBase = '/'
  await writePreviewViteConfig(workspaceDir, { apiOrigin }).catch(() => null)

  const child = spawn(allowed.argv[0], allowed.argv.slice(1), {
    cwd: workspaceDir,
    env: {
      ...sanitizedWorkspaceEnv(),
      GETVIA_PREVIEW_PORT: String(port),
      GETVIA_PREVIEW_BASE: previewBase,
      GETVIA_PREVIEW_HMR: usePublicProxy ? '0' : '1',
      GETVIA_PREVIEW_ORIGIN: '',
      GETVIA_API_ORIGIN: apiOrigin,
      npm_config_update_notifier: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  const localUrl = `http://127.0.0.1:${port}/`
  const url = publicIsolatedPreviewUrl(projectId, { port, localUrl }) || localUrl
  const ready = await waitForReady(child)
  if (!ready.ok) {
    killProcessTree(child, 'SIGKILL')
    console.warn(`[ai-builder] preview ${ready.code || 'failed'} · ${ready.message || ''}`.trim())
    return ready
  }
  child.on('exit', () => {
    const current = previews.get(String(projectId))
    if (current?.child === child) previews.delete(String(projectId))
  })
  child.unref()
  console.log(`[ai-builder] preview ready · ${url} (local ${localUrl})`)
  const row = { projectId: String(projectId), port, url, localUrl, child, startedAt: Date.now() }
  previews.set(String(projectId), row)
  return { ok: true, port, url, localUrl, host: usePublicProxy ? 'proxy' : '127.0.0.1' }
}

/**
 * Reuse a live Vite preview if it is still listening. Start a new one only when
 * the previous process died (API --watch restart, cancel, crash).
 */
export async function ensureIsolatedPreviewProcess({ projectId, workspaceDir, preferredPort } = {}) {
  if (workspaceDir) await repairWorkspaceJsx(workspaceDir)
  const key = String(projectId || '')
  const current = previews.get(key)
  // Behind the public proxy, always restart so Vite runs with base "/" (avoids redirect loops
  // from older processes that used /ai-preview/:id as Vite base).
  const forceRestart = shouldUsePublicPreviewProxy()
  if (!forceRestart && current?.port && (await isPreviewListening(current.port))) {
    const url =
      publicIsolatedPreviewUrl(key, { port: current.port, localUrl: current.localUrl || current.url }) ||
      current.url
    current.url = url
    const localUrl = current.localUrl || `http://127.0.0.1:${current.port}/`
    return {
      ok: true,
      url,
      localUrl,
      port: current.port,
      host: current.host || '127.0.0.1',
      reused: true,
    }
  }
  if (current) await stopIsolatedPreview(key)
  if (!forceRestart) {
    const orphanPort = Number(preferredPort)
    if (Number.isInteger(orphanPort) && (await isPreviewListening(orphanPort))) {
      const localUrl = `http://127.0.0.1:${orphanPort}/`
      const url = publicIsolatedPreviewUrl(key, { port: orphanPort, localUrl }) || localUrl
      previews.set(key, { projectId: key, port: orphanPort, url, localUrl, child: null, startedAt: Date.now() })
      return { ok: true, url, localUrl, port: orphanPort, host: '127.0.0.1', reused: true, orphan: true }
    }
  } else if (preferredPort) {
    await killListenerOnPort(Number(preferredPort)).catch(() => null)
  }
  return startIsolatedPreviewProcess({ projectId, workspaceDir })
}

export function getViaPreviewHint({ publicId, origin } = {}) {
  if (!publicId) return null
  const base = origin || getPublicSiteOrigin()
  return `${String(base).replace(/\/$/, '')}/profile/${publicId}`
}

/**
 * Playwright runs on the API host — use loopback Vite (127.0.0.1:4100) instead of the
 * public /ai-preview proxy so QA does not depend on nginx TLS or path rewriting.
 */
export function serverSidePreviewUrl(preview, projectId) {
  if (!preview?.ok) return null
  const local =
    preview.localUrl ||
    (Number.isInteger(preview.port) ? `http://127.0.0.1:${preview.port}/` : null)
  if (local) return local.endsWith('/') ? local : `${local}/`
  const row = projectId ? getIsolatedPreview(String(projectId)) : null
  if (row?.localUrl) return row.localUrl.endsWith('/') ? row.localUrl : `${row.localUrl}/`
  if (row?.port) return `http://127.0.0.1:${row.port}/`
  const publicUrl = preview.url || row?.url
  return publicUrl ? (publicUrl.endsWith('/') ? publicUrl : `${publicUrl}/`) : null
}
