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

/** @returns {string[]} */
export function getClientOrigins() {
  const listed = (process.env.CLIENT_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const aliases = listed.map(withLocalhostAliases).filter(Boolean)
  return [...new Set([...listed, ...aliases])]
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
  return getClientOrigins().includes(String(origin || ''))
}

export function isAllowedCorsOrigin(origin) {
  const value = String(origin || '')
  if (!value) return false
  return corsAllowsCredentials(value) || isIsolatedPreviewOrigin(value)
}

/** Apply CORS headers on error responses so browsers show real API errors (not masked as CORS). */
export function applyCorsHeaders(req, res) {
  const origin = req.headers.origin
  if (!origin || !isAllowedCorsOrigin(origin)) return
  res.setHeader('Access-Control-Allow-Origin', origin)
  if (corsAllowsCredentials(origin)) res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Vary', 'Origin')
}
