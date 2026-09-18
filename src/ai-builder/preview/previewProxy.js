import http from 'node:http'
import zlib from 'node:zlib'
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

/**
 * Strip /ai-preview/:id so Vite (base "/") can serve without redirecting.
 * Public browser URL stays /ai-preview/:id/...; Vite sees /...
 */
export function stripPreviewPrefix(originalUrl, projectId) {
  const pathOnly = String(originalUrl || '/').split('?')[0] || '/'
  const prefix = publicPreviewBasePath(projectId).replace(/\/$/, '')
  if (pathOnly === prefix || pathOnly === `${prefix}/`) return '/'
  if (pathOnly.startsWith(`${prefix}/`)) {
    const rest = pathOnly.slice(prefix.length)
    return rest.startsWith('/') ? rest : `/${rest}`
  }
  // Express mount remainder (already stripped)
  return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`
}

function rewriteLocationHeader(location, { port, projectId, publicOrigin }) {
  let loc = String(location || '')
  if (!loc) return loc
  const prefix = publicPreviewBasePath(projectId)
  const prefixNoSlash = prefix.replace(/\/$/, '')

  // Absolute loopback → path only
  loc = loc.replace(new RegExp(`https?://(?:127\\.0\\.0\\.1|localhost):${port}`, 'i'), '')

  // Absolute public API origin → path only
  if (publicOrigin) {
    loc = loc.replace(new RegExp(`^${publicOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), '')
  }

  if (!loc.startsWith('/')) {
    // Relative redirect — keep under preview base
    return `${prefixNoSlash}/${loc.replace(/^\.\//, '')}`
  }

  // Already under preview base
  if (loc === prefixNoSlash || loc.startsWith(`${prefixNoSlash}/`)) return loc === prefixNoSlash ? prefix : loc

  // Vite root redirects (/ or /index.html) map to preview root — never bounce back to same URL incorrectly
  if (loc === '/' || loc === '/index.html') return prefix

  // Absolute site paths (/@vite/client, /src/...) must stay under the public preview prefix
  return `${prefixNoSlash}${loc}`
}

function isHtmlContentType(value) {
  return /text\/html/i.test(String(value || ''))
}

function rewriteHtmlForPreviewBase(html, projectId) {
  const prefix = publicPreviewBasePath(projectId).replace(/\/$/, '')
  let out = String(html || '')
  // Ensure relative resolution under the public preview path
  if (!/<base\s/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1><base href="${prefix}/">`)
  }
  // Vite injects absolute root paths — rewrite them under the proxy prefix
  out = out.replace(/(src|href)=(["'])\/(?!\/)/gi, `$1=$2${prefix}/`)
  return out
}

function gunzipMaybe(buf, encoding) {
  const enc = String(encoding || '').toLowerCase()
  return new Promise((resolve, reject) => {
    if (enc.includes('gzip')) {
      zlib.gunzip(buf, (err, out) => (err ? reject(err) : resolve(out)))
      return
    }
    if (enc.includes('deflate')) {
      zlib.inflate(buf, (err, out) => (err ? reject(err) : resolve(out)))
      return
    }
    resolve(buf)
  })
}

function collectBody(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (c) => chunks.push(c))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

/**
 * Reverse-proxy isolated Vite previews so remote browsers (and iframes) can load them.
 * Vite always runs with base "/" on loopback; this proxy strips/re-adds /ai-preview/:id
 * so we never hit Vite's subpath redirect loop (ERR_TOO_MANY_REDIRECTS).
 */
export function mountIsolatedPreviewProxy(app) {
  app.use(`${PREVIEW_PREFIX}/:projectId`, async (req, res) => {
    const projectId = String(req.params.projectId || '')
    const row = getIsolatedPreview(projectId)
    if (!row?.port) {
      res.status(503)
      res.removeHeader('X-Frame-Options')
      res.type('html').set({
        'cache-control': 'no-store',
        'content-security-policy':
          "frame-ancestors 'self' https://business.getvia.in https://admin.getvia.in http://localhost:5175 http://127.0.0.1:5175",
      }).send(
        `<!doctype html><html><body style="font-family:system-ui;padding:2rem">
          <h1>Preview offline</h1>
          <p>This AI website preview is not running. Open AI Builder and start or rebuild the preview.</p>
        </body></html>`,
      )
      return
    }

    const publicOrigin = String(
      process.env.PUBLIC_API_ORIGIN || process.env.GETVIA_API_ORIGIN || '',
    ).replace(/\/$/, '')
    const targetPath = stripPreviewPrefix(req.originalUrl, projectId)
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : ''

    const headers = { ...req.headers, host: `127.0.0.1:${row.port}` }
    delete headers['content-length']
    // Avoid compressed HTML we can't rewrite when needed
    headers['accept-encoding'] = 'identity'

    const proxyReq = http.request(
      {
        hostname: '127.0.0.1',
        port: row.port,
        path: `${targetPath}${qs}`,
        method: req.method,
        headers,
      },
      async (proxyRes) => {
        try {
          const outHeaders = { ...proxyRes.headers }
          delete outHeaders['x-frame-options']
          delete outHeaders['content-security-policy']
          delete outHeaders['content-length']
          delete outHeaders['transfer-encoding']

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
          outHeaders['cache-control'] = outHeaders['cache-control'] || 'no-store'

          // Never leak redirect loops to the browser — rewrite Location once.
          const status = proxyRes.statusCode || 502
          if (status >= 300 && status < 400 && outHeaders.location) {
            const raw = Array.isArray(outHeaders.location) ? outHeaders.location[0] : outHeaders.location
            const next = rewriteLocationHeader(raw, { port: row.port, projectId, publicOrigin })
            const self = publicPreviewBasePath(projectId)
            // Same-URL redirect → serve as 200 by re-fetching target once without Location
            if (next === self || next === self.replace(/\/$/, '')) {
              outHeaders.location = self
            } else {
              outHeaders.location = next
            }
            // Cap redirect chains: convert loopback-style redirects into a single public Location
            res.writeHead(status, outHeaders)
            proxyRes.resume()
            res.end()
            return
          }

          const contentType = outHeaders['content-type'] || ''
          if (isHtmlContentType(contentType) && req.method === 'GET') {
            const raw = await collectBody(proxyRes)
            const decoded = await gunzipMaybe(raw, outHeaders['content-encoding'])
            delete outHeaders['content-encoding']
            const html = rewriteHtmlForPreviewBase(decoded.toString('utf8'), projectId)
            const buf = Buffer.from(html, 'utf8')
            outHeaders['content-length'] = String(buf.length)
            res.writeHead(status, outHeaders)
            res.end(buf)
            return
          }

          res.writeHead(status, outHeaders)
          proxyRes.pipe(res)
        } catch {
          if (!res.headersSent) {
            res.status(502).json({ ok: false, error: 'Preview proxy failed.', code: 'PREVIEW_PROXY_ERROR' })
          }
        }
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

/** @deprecated use stripPreviewPrefix — kept for tests that imported the old name */
export function proxyTargetPath(originalUrl, projectId) {
  return stripPreviewPrefix(originalUrl, projectId)
}
