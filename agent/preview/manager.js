import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { assertInsideWorkspace } from '../../src/ai-builder/security/pathPolicy.js'
import { isHostPreviewAllowed } from '../../src/ai-builder/runtimeFlags.js'
import {
  allocatePreviewPort,
  getIsolatedPreview,
  startIsolatedPreviewProcess,
  stopIsolatedPreview,
} from '../../src/ai-builder/preview/previewManager.js'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
}

const agentPreviews = new Map()

function previewRow(projectId) {
  return agentPreviews.get(String(projectId || '')) || getIsolatedPreview(projectId)
}

async function hasIndexHtml(workspaceDir) {
  try {
    await fs.access(path.join(workspaceDir, 'index.html'))
    return true
  } catch {
    return false
  }
}

async function startStaticPreview({ projectId, workspaceDir }) {
  const port = await allocatePreviewPort()
  if (!port) {
    return { ok: false, code: 'PREVIEW_NO_PORT', message: 'No free preview port in 4100-4199.' }
  }
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname)
      const rel = (pathname === '/' ? 'index.html' : pathname.replace(/^\//, '')).replace(/\\/g, '/')
      const inside = assertInsideWorkspace(workspaceDir, rel)
      if (!inside.ok || rel.includes('node_modules') || rel.startsWith('.git')) {
        res.writeHead(403)
        res.end('Forbidden')
        return
      }
      const buf = await fs.readFile(inside.path)
      res.writeHead(200, { 'content-type': MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream' })
      res.end(buf)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  const url = `http://127.0.0.1:${port}`
  const row = {
    projectId: String(projectId),
    port,
    url,
    host: '127.0.0.1',
    kind: 'static',
    server,
    startedAt: Date.now(),
  }
  agentPreviews.set(String(projectId), row)
  return { ok: true, port, url, host: '127.0.0.1', kind: 'static' }
}

export async function startPreview({ projectId, workspaceDir, portFromClient } = {}) {
  if (portFromClient != null) {
    return { ok: false, code: 'PREVIEW_PORT_REJECTED', message: 'Clients cannot choose preview ports.' }
  }
  if (!projectId) return { ok: false, code: 'PREVIEW_REJECTED', message: 'projectId is required.' }
  if (!workspaceDir) return { ok: false, code: 'PREVIEW_REJECTED', message: 'workspaceDir is required.' }
  if (process.env.NODE_ENV === 'production' && !isHostPreviewAllowed()) {
    return {
      ok: false,
      code: 'PREVIEW_SANDBOX_REQUIRED',
      skipped: true,
      message: 'Set PREVIEW_ENABLED=1 to bind generated apps on 127.0.0.1.',
    }
  }
  await stopPreview({ projectId })
  if (isHostPreviewAllowed()) {
    const vite = await startIsolatedPreviewProcess({ projectId, workspaceDir })
    if (vite.ok) {
      agentPreviews.set(String(projectId), { ...vite, kind: 'vite', projectId: String(projectId) })
      return { ...vite, kind: 'vite' }
    }
  }
  if (await hasIndexHtml(workspaceDir)) {
    return startStaticPreview({ projectId, workspaceDir })
  }
  return {
    ok: false,
    skipped: true,
    code: 'PREVIEW_NOT_READY',
    message: 'No previewable index.html, and host Vite preview is not enabled.',
  }
}

export async function stopPreview({ projectId } = {}) {
  const key = String(projectId || '')
  const row = agentPreviews.get(key)
  if (row?.server) {
    await new Promise((resolve) => row.server.close(() => resolve()))
  }
  agentPreviews.delete(key)
  const vite = await stopIsolatedPreview(key)
  return { ok: true, stopped: Boolean(row || vite?.stopped), port: row?.port || vite?.port || null }
}

export function previewStatus({ projectId } = {}) {
  const row = previewRow(projectId)
  if (!row?.url) {
    return { ok: true, running: false, url: null, port: null, kind: null }
  }
  return {
    ok: true,
    running: true,
    url: row.url,
    port: row.port || null,
    kind: row.kind || 'vite',
    host: row.host || '127.0.0.1',
  }
}

export { agentPreviews }
