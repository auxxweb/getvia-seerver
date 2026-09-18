function withLocalhostAliases(origin) {
  try {
    const url = new URL(origin)
    if (url.hostname === 'localhost') {
      url.hostname = '127.0.0.1'
      return url.origin
    }
    if (url.hostname === '127.0.0.1') {
      url.hostname = 'localhost'
      return url.origin
    }
  } catch {
    /* ignore invalid origin entries */
  }
  return ''
}

export const GETVIA_PRODUCTION_ORIGINS = Object.freeze([
  'https://getvia.in',
  'https://www.getvia.in',
  'https://admin.getvia.in',
  'https://business.getvia.in',
])

function listedClientOrigins() {
  return (process.env.CLIENT_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

/** @returns {string[]} */
export function getClientOrigins() {
  const listed = listedClientOrigins()
  const aliases = listed.map(withLocalhostAliases).filter(Boolean)
  const productionHosts =
    process.env.NODE_ENV === 'production' ||
    Boolean(String(process.env.PUBLIC_API_ORIGIN || '').match(/^https:\/\//i))
      ? GETVIA_PRODUCTION_ORIGINS
      : []
  return [...new Set([...listed, ...aliases, ...productionHosts])]
}

/** Isolated Vite preview tabs (127.0.0.1:4100–4199). Public API only; never with credentials. */
export function isIsolatedPreviewOrigin(origin) {
  try {
    const url = new URL(String(origin || ''))
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return false
    const port = Number(url.port)
    return port >= 4100 && port <= 4199
  } catch {
    return false
  }
}

export function corsAllowsCredentials(origin) {
  return getClientOrigins().includes(String(origin || '').replace(/\/$/, ''))
}

export function isAllowedCorsOrigin(origin) {
  const value = String(origin || '').replace(/\/$/, '')
  if (!value) return false
  return corsAllowsCredentials(value) || isIsolatedPreviewOrigin(value)
}

/** Apply CORS headers on error responses so browsers show real API errors (not masked as CORS). */
export function applyCorsHeaders(req, res) {
  const origin = String(req.headers.origin || '').replace(/\/$/, '')
  if (!origin || !isAllowedCorsOrigin(origin)) return
  res.setHeader('Access-Control-Allow-Origin', origin)
  if (corsAllowsCredentials(origin)) res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key, Accept')
}
