import http from 'node:http'
import { getIsolatedPreview } from '../preview/previewManager.js'

const PREVIEW_PREFIX = '/ai-preview'

export function publicPreviewBasePath(projectId) {
  return `${PREVIEW_PREFIX}/${encodeURIComponent(String(projectId || ''))}/`
}

export function shouldUsePublicPreviewProxy() {
  const apiOrigin = String(
    process.env.PUBLIC_API_ORIGIN || process.env.GETVIA_API_ORIGIN || process.env.GETVIA_PUBLIC_API_ORIGIN || '',
  ).replace(/\/$/, '')
  const originIsPublic = Boolean(apiOrigin && !/127\.0\.0\.1|localhost/i.test(apiOrigin))
  return (
    process.env.AI_PREVIEW_PUBLIC === '1' ||
    (process.env.AI_PREVIEW_PUBLIC !== '0' && (process.env.NODE_ENV === 'production' || originIsPublic))
  )
}

/**
 * Browser-reachable preview URL. In production this is the API origin + /ai-preview/:id/
 * (proxied to 127.0.0.1:4100–4199). Locally it can stay on loopback.
 */
export function publicIsolatedPreviewUrl(projectId, { port, localUrl } = {}) {
  const id = String(projectId || '')
  const apiOrigin = String(
    process.env.PUBLIC_API_ORIGIN ||
      process.env.GETVIA_API_ORIGIN ||
      process.env.GETVIA_PUBLIC_API_ORIGIN ||
      '',
  ).replace(/\/$/, '')
  if (apiOrigin && shouldUsePublicPreviewProxy()) {
    return `${apiOrigin}${publicPreviewBasePath(id)}`
  }
  if (localUrl) return localUrl.endsWith('/') ? localUrl : `${localUrl}/`
  if (port) return `http://127.0.0.1:${port}/`
  return null
}

function rewritePath(reqPath, projectId) {
  const prefix = publicPreviewBasePath(projectId).replace(/\/$/, '')
  let rest = String(reqPath || '/')
  if (rest === prefix || rest.startsWith(`${prefix}/`)) {
    rest = rest.slice(prefix.length) || '/'
  }
  return rest.startsWith('/') ? rest : `/${rest}`
}

/**
 * Reverse-proxy isolated Vite previews so remote browsers (and iframes) can load them.
 * Mount before the JSON 404 handler.
 */
export function mountIsolatedPreviewProxy(app) {
  app.use(`${PREVIEW_PREFIX}/:projectId`, (req, res) => {
    const projectId = String(req.params.projectId || '')
    const row = getIsolatedPreview(projectId)
    if (!row?.port) {
      res.status(503).type('html').send(
        `<!doctype html><html><body style="font-family:system-ui;padding:2rem">
          <h1>Preview offline</h1>
          <p>This AI website preview is not running. Open AI Builder and start or rebuild the preview.</p>
        </body></html>`,
      )
      return
    }

    const targetPath = rewritePath(req.originalUrl.split('?')[0], projectId)
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
    const headers = { ...req.headers, host: `127.0.0.1:${row.port}` }
    delete headers['content-length']

    const proxyReq = http.request(
      {
        hostname: '127.0.0.1',
        port: row.port,
        path: `${targetPath}${qs}`,
        method: req.method,
        headers,
      },
      (proxyRes) => {
        const outHeaders = { ...proxyRes.headers }
        // Allow business admin iframe embedding (admin origins from CLIENT_ORIGINS + defaults).
        delete outHeaders['x-frame-options']
        delete outHeaders['content-security-policy']
        const extra = String(process.env.CLIENT_ORIGINS || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        const ancestors = [
          "'self'",
          'http://localhost:5175',
          'http://127.0.0.1:5175',
          'https://business.getvia.in',
          'https://admin.getvia.in',
          ...extra,
        ]
        outHeaders['content-security-policy'] = `frame-ancestors ${[...new Set(ancestors)].join(' ')}`
        res.writeHead(proxyRes.statusCode || 502, outHeaders)
        proxyRes.pipe(res)
      },
    )

    proxyReq.on('error', () => {
      if (!res.headersSent) {
        res.status(502).json({ ok: false, error: 'Preview proxy failed.', code: 'PREVIEW_PROXY_ERROR' })
      }
    })

    req.pipe(proxyReq)
  })
}

export { PREVIEW_PREFIX }
