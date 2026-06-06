/** @returns {string[]} */
export function getClientOrigins() {
  return (process.env.CLIENT_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Apply CORS headers on error responses so browsers show real API errors (not masked as CORS). */
export function applyCorsHeaders(req, res) {
  const origin = req.headers.origin
  if (!origin) return
  const allowed = getClientOrigins()
  if (!allowed.includes(origin)) return
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Vary', 'Origin')
}
