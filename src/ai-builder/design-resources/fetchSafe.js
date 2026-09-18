import { assertAllowedResearchUrl } from './allowlist.js'

export function designResearchLiveEnabled(fetchImpl) {
  if (typeof fetchImpl === 'function') return true
  const skip = String(process.env.AI_SKIP_DESIGN_RESEARCH || '').trim()
  if (skip === '1' || skip === 'true') return false
  if (process.env.NODE_TEST_CONTEXT && String(process.env.DESIGN_RESEARCH_LIVE || '').trim() !== '1') return false
  return true
}

export async function fetchAllowlisted({
  url,
  timeoutMs = 4000,
  as = 'text',
  headers = {},
  fetchImpl,
} = {}) {
  const allowed = assertAllowedResearchUrl(url)
  if (!allowed.ok) return { ok: false, ...allowed, status: 0, body: null }
  const fetchFn = fetchImpl || globalThis.fetch
  if (typeof fetchFn !== 'function') {
    return { ok: false, code: 'FETCH_UNAVAILABLE', message: 'fetch is not available.', status: 0, body: null }
  }
  try {
    const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined
    const res = await fetchFn(allowed.url, {
      method: 'GET',
      headers: { 'user-agent': 'GetViaDesignResearch/1.0', ...headers },
      signal,
      redirect: 'follow',
    })
    if (!res.ok) {
      return { ok: false, code: 'FETCH_HTTP', message: `HTTP ${res.status}`, status: res.status, body: null, url: allowed.url }
    }
    const body = as === 'json' ? await res.json() : await res.text()
    return { ok: true, status: res.status, body, url: allowed.url, host: allowed.host }
  } catch (err) {
    return {
      ok: false,
      code: 'FETCH_FAILED',
      message: String(err?.message || err).slice(0, 180),
      status: 0,
      body: null,
      url: allowed.url,
    }
  }
}
