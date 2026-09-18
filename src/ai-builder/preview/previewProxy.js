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
 */
export function stripPreviewPrefix(pathOnly, projectId) {
  const raw = String(pathOnly || '/').split('?')[0] || '/'
  const prefix = publicPreviewBasePath(projectId).replace(/\/$/, '')
  if (raw === prefix || raw === `${prefix}/`) return '/'
  if (raw.startsWith(`${prefix}/`)) {
    const rest = raw.slice(prefix.length)
    return rest.startsWith('/') ? rest : `/${rest}`
  }
  return raw.startsWith('/') ? raw : `/${raw}`
}

function rewriteLocationHeader(location, { port, projectId, publicOrigin }) {
  let loc = String(location || '')
  if (!loc) return loc
  const prefix = publicPreviewBasePath(projectId)
  const prefixNoSlash = prefix.replace(/\/$/, '')

  loc = loc.replace(new RegExp(`https?://(?:127\\.0\\.0\\.1|localhost):${port}`, 'i'), '')
  if (publicOrigin) {
    loc = loc.replace(new RegExp(`^${publicOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), '')
  }

  if (!loc.startsWith('/')) {
    return `${prefixNoSlash}/${loc.replace(/^\.\//, '')}`
  }
  if (loc === prefixNoSlash || loc.startsWith(`${prefixNoSlash}/`)) return loc === prefixNoSlash ? prefix : loc
  if (loc === '/' || loc === '/index.html') return prefix
  return `${prefixNoSlash}${loc}`
}

function isHtmlContentType(value) {
  return /text\/html/i.test(String(value || ''))
}

function isRewritableModuleType(value) {
  const t = String(value || '').toLowerCase()
  return (
    t.includes('javascript') ||
    t.includes('ecmascript') ||
    t.includes('typescript') ||
    t.includes('css') ||
    t.includes('json')
  )
}

/** Prefix root-absolute URLs once (never double-prefix). */
export function prefixRootAbsolutePaths(text, projectId) {
  const prefix = publicPreviewBasePath(projectId).replace(/\/$/, '')
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let out = String(text || '')

  // HTML src/href="/..."
  out = out.replace(/(src|href)=(["'])(\/[^"']*)\2/gi, (full, attr, quote, path) => {
    if (path.startsWith('//')) return full
    if (path === prefix || path.startsWith(`${prefix}/`)) return full
    return `${attr}=${quote}${prefix}${path}${quote}`
  })

  // JS/CSS: from "/...", import("/..."), url("/..."), "/@vite/...", "/node_modules/...", "/src/..."
  out = out.replace(/(["'`])(\/(?:@vite|@id|@fs|@react-refresh|src|node_modules|assets)[^"'`]*)\1/g, (full, quote, path) => {
    if (path.startsWith(`${prefix}/`) || path === prefix) return full
    return `${quote}${prefix}${path}${quote}`
  })

  // Broader: any quoted absolute path that Vite commonly emits
  out = out.replace(/(from\s+|import\s*\(|export\s+\*\s+from\s+)(["'`])(\/[^"'`]+)\2/g, (full, lead, quote, path) => {
    if (path.startsWith('//')) return full
    if (path.startsWith(`${prefix}/`) || path === prefix) return full
    return `${lead}${quote}${prefix}${path}${quote}`
  })

  // url(/...) in CSS
  out = out.replace(/url\(\s*(['"]?)(\/[^)'"]+)\1\s*\)/g, (full, quote, path) => {
    if (path.startsWith('//')) return full
    if (path.startsWith(`${prefix}/`) || path === prefix) return full
    return `url(${quote}${prefix}${path}${quote})`
  })

  // Remove accidentally double-prefixed bases if a previous buggy rewrite ran
  out = out.replace(new RegExp(`${escaped}${escaped}`, 'g'), prefix)
  return out
}

export function rewriteHtmlForPreviewBase(html, projectId) {
  const prefix = publicPreviewBasePath(projectId).replace(/\/$/, '')
  let out = String(html || '')
  // Drop any existing <base> (including doubled ones from older proxy builds)
  out = out.replace(/<base\b[^>]*>/gi, '')
  out = out.replace(/<head([^>]*)>/i, `<head$1><base href="${prefix}/">`)
  out = prefixRootAbsolutePaths(out, projectId)
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

function frameAncestorHeader() {
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
  return `frame-ancestors ${[...new Set(ancestors)].join(' ')}`
}

/**
 * Reverse-proxy isolated Vite previews.
 * Mount at /ai-preview so deep paths (/node_modules/.vite/deps/...) always match.
 */
export function mountIsolatedPreviewProxy(app) {
  app.use(PREVIEW_PREFIX, async (req, res, next) => {
    const pathPart = String(req.path || '/')
    const match = pathPart.match(/^\/([^/]+)(\/.*)?$/)
    if (!match) return next()

    const projectId = decodeURIComponent(match[1] || '')
    if (!projectId || projectId.includes('..')) return next()

    const row = getIsolatedPreview(projectId)
    if (!row?.port) {
      res.status(503)
      res.removeHeader('X-Frame-Options')
      res.type('html').set({
        'cache-control': 'no-store',
        'content-security-policy': frameAncestorHeader(),
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
    const fullPath = `${PREVIEW_PREFIX}${pathPart}`
    const targetPath = stripPreviewPrefix(fullPath, projectId)
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : ''

    const headers = { ...req.headers, host: `127.0.0.1:${row.port}` }
    delete headers['content-length']
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
          outHeaders['content-security-policy'] = frameAncestorHeader()
          outHeaders['cache-control'] = outHeaders['cache-control'] || 'no-store'

          const status = proxyRes.statusCode || 502
          if (status >= 300 && status < 400 && outHeaders.location) {
            const raw = Array.isArray(outHeaders.location) ? outHeaders.location[0] : outHeaders.location
            outHeaders.location = rewriteLocationHeader(raw, { port: row.port, projectId, publicOrigin })
            res.writeHead(status, outHeaders)
            proxyRes.resume()
            res.end()
            return
          }

          const contentType = outHeaders['content-type'] || ''
          const shouldRewrite =
            req.method === 'GET' && (isHtmlContentType(contentType) || isRewritableModuleType(contentType))

          if (shouldRewrite) {
            const raw = await collectBody(proxyRes)
            const decoded = await gunzipMaybe(raw, outHeaders['content-encoding'])
            delete outHeaders['content-encoding']
            let body = decoded.toString('utf8')
            body = isHtmlContentType(contentType)
              ? rewriteHtmlForPreviewBase(body, projectId)
              : prefixRootAbsolutePaths(body, projectId)
            const buf = Buffer.from(body, 'utf8')
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

/** @deprecated use stripPreviewPrefix */
export function proxyTargetPath(originalUrl, projectId) {
  return stripPreviewPrefix(originalUrl, projectId)
}
