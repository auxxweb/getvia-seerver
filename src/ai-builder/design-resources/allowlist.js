const DEFAULT_DOMAINS = Object.freeze([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'cdn.fontshare.com',
  'api.fontshare.com',
  'images.unsplash.com',
  'images.pexels.com',
  'cdn.pixabay.com',
])

export function trustedResourceDomains() {
  const replace = String(process.env.DESIGN_RESOURCE_ALLOWLIST || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
  if (replace.length) return replace
  const extra = String(process.env.DESIGN_RESOURCE_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
  return [...new Set([...DEFAULT_DOMAINS, ...extra])]
}

export function hostFromUrl(raw) {
  try {
    const url = new URL(String(raw || ''))
    return url.hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function assertAllowedResourceUrl(raw) {
  const text = String(raw || '').trim()
  if (!text) return { ok: false, code: 'RESOURCE_URL_REQUIRED', message: 'Resource URL is empty.' }
  if (/^\s*javascript:/i.test(text) || /^\s*data:(?:text\/)?(?:javascript|html)/i.test(text) || /[\s<>]/.test(text)) {
    return { ok: false, code: 'RESOURCE_URL_REJECTED', message: 'That resource URL is not allowed.' }
  }
  let url
  try {
    url = new URL(text)
  } catch {
    return { ok: false, code: 'RESOURCE_URL_REJECTED', message: 'Resource URL is not valid.' }
  }
  if (url.protocol !== 'https:') {
    return { ok: false, code: 'RESOURCE_URL_REJECTED', message: 'External resources must use https.' }
  }
  const host = url.hostname.toLowerCase()
  const allowed = trustedResourceDomains()
  const ok = allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))
  if (!ok) {
    return { ok: false, code: 'RESOURCE_DOMAIN_REJECTED', message: `Domain "${host}" is not on the design-resource allowlist.` }
  }
  return { ok: true, url: url.toString(), host }
}

export function isTrustedResourceHost(raw) {
  const text = String(raw || '')
  let host = ''
  try {
    host = new URL(text).hostname.toLowerCase()
  } catch {
    host = ''
  }
  const allowed = trustedResourceDomains()
  if (host && allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))) return true
  return allowed.some((domain) => text.includes(domain))
}

export function isBenignExternalResourceFailure(text, url) {
  const blob = `${text || ''} ${url || ''}`
  if (!/Failed to load resource|net::ERR_|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|404 \(Not Found\)|failed /i.test(blob)) {
    return false
  }
  return isTrustedResourceHost(url) || trustedResourceDomains().some((domain) => blob.includes(domain))
}

const DEFAULT_RESEARCH_DOMAINS = Object.freeze([
  'data.jsdelivr.com',
  'api.cdnjs.com',
  'api.duckduckgo.com',
  'html.duckduckgo.com',
  'duckduckgo.com',
  'api.search.brave.com',
  'fonts.google.com',
  'www.googleapis.com',
  'web.dev',
  'developer.mozilla.org',
  'en.wikipedia.org',
])

export function trustedResearchDomains() {
  const extra = String(process.env.DESIGN_RESEARCH_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
  return [...new Set([...DEFAULT_RESEARCH_DOMAINS, ...trustedResourceDomains(), ...extra])]
}

export function assertAllowedResearchUrl(raw) {
  const text = String(raw || '').trim()
  if (!text) return { ok: false, code: 'RESOURCE_URL_REQUIRED', message: 'Research URL is empty.' }
  if (/^\s*javascript:/i.test(text) || /^\s*data:/i.test(text) || /[\s<>]/.test(text)) {
    return { ok: false, code: 'RESOURCE_URL_REJECTED', message: 'That research URL is not allowed.' }
  }
  let url
  try {
    url = new URL(text)
  } catch {
    return { ok: false, code: 'RESOURCE_URL_REJECTED', message: 'Research URL is not valid.' }
  }
  if (url.protocol !== 'https:') {
    return { ok: false, code: 'RESOURCE_URL_REJECTED', message: 'Research fetches must use https.' }
  }
  const host = url.hostname.toLowerCase()
  const allowed = trustedResearchDomains()
  const ok = allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))
  if (!ok) {
    return { ok: false, code: 'RESOURCE_DOMAIN_REJECTED', message: `Domain "${host}" is not on the design-research allowlist.` }
  }
  return { ok: true, url: url.toString(), host }
}
