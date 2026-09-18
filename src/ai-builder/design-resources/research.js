import { assertAllowedResourceUrl, assertAllowedResearchUrl } from './allowlist.js'
import { fetchAllowlisted, designResearchLiveEnabled } from './fetchSafe.js'
import { localDesignPractices, researchQueries } from './practices.js'
import { DESIGN_RESOURCES } from './catalog.js'

const NPM_FILES = {
  lucide: 'dist/umd/lucide.min.js',
  gsap: 'dist/gsap.min.js',
  aos: 'dist/aos.js',
  lenis: 'dist/lenis.min.js',
  motion: 'dist/motion.min.js',
  bootstrap: 'dist/js/bootstrap.bundle.min.js',
  bulma: 'css/bulma.min.css',
  uikit: 'dist/js/uikit.min.js',
}

export function stripUnsafeSnippet(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
}

export async function searchWebDesign({ query, fetchImpl } = {}) {
  const q = String(query || '').trim().slice(0, 160)
  if (!q) return { ok: false, error: 'QUERY_REQUIRED', results: [] }
  if (!designResearchLiveEnabled(fetchImpl)) {
    return { ok: true, skipped: true, source: 'offline', query: q, results: [] }
  }
  const brave = await searchBrave(q, fetchImpl)
  if (brave.results.length) return { ok: true, query: q, source: 'brave', results: brave.results }
  const ddg = await searchDuckDuckGo(q, fetchImpl)
  if (ddg.results.length) return { ok: true, query: q, source: ddg.source, results: ddg.results }
  const wiki = await searchWikipedia(q, fetchImpl)
  return { ok: true, query: q, source: wiki.results.length ? 'wikipedia' : 'none', results: wiki.results }
}

async function searchBrave(query, fetchImpl) {
  const key = String(process.env.BRAVE_SEARCH_API_KEY || '').trim()
  if (!key) return { results: [] }
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`
  const res = await fetchAllowlisted({
    url,
    as: 'json',
    fetchImpl,
    headers: { accept: 'application/json', 'X-Subscription-Token': key },
  })
  const web = res.ok ? res.body?.web?.results || [] : []
  return {
    results: web.slice(0, 5).map((row) => ({
      title: stripUnsafeSnippet(row.title),
      url: String(row.url || '').slice(0, 300),
      snippet: stripUnsafeSnippet(row.description),
    })),
  }
}

async function searchDuckDuckGo(query, fetchImpl) {
  const instant = await fetchAllowlisted({
    url: `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
    as: 'json',
    fetchImpl,
  })
  const results = []
  if (instant.ok && instant.body) {
    const heading = stripUnsafeSnippet(instant.body.Heading || instant.body.AbstractText)
    const abstract = stripUnsafeSnippet(instant.body.AbstractText)
    if (abstract) {
      results.push({
        title: heading || query,
        url: String(instant.body.AbstractURL || 'https://duckduckgo.com').slice(0, 300),
        snippet: abstract,
      })
    }
    for (const topic of instant.body.RelatedTopics || []) {
      if (results.length >= 5) break
      const text = stripUnsafeSnippet(topic.Text || topic.Name)
      const url = topic.FirstURL || topic.URL
      if (text && url) results.push({ title: text.slice(0, 80), url: String(url).slice(0, 300), snippet: text })
    }
  }
  if (results.length) return { source: 'duckduckgo', results: results.slice(0, 5) }

  const html = await fetchAllowlisted({
    url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    as: 'text',
    fetchImpl,
  })
  if (!html.ok) return { source: 'duckduckgo', results: [] }
  return { source: 'duckduckgo-html', results: parseDuckDuckGoHtml(html.body) }
}

function parseDuckDuckGoHtml(html) {
  const results = []
  const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = re.exec(String(html || ''))) && results.length < 5) {
    const rawHref = decodeHtml(match[1])
    const url = unwrapDuckHref(rawHref)
    const title = stripUnsafeSnippet(match[2])
    if (url && title) results.push({ title, url: url.slice(0, 300), snippet: title })
  }
  return results
}

function unwrapDuckHref(href) {
  try {
    const url = new URL(href, 'https://html.duckduckgo.com')
    const uddg = url.searchParams.get('uddg')
    if (uddg) return decodeURIComponent(uddg)
    if (url.protocol === 'https:') return url.toString()
  } catch {
    /* ignore */
  }
  return ''
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '')
    .replace(/&gt;/g, '')
}

async function searchWikipedia(query, fetchImpl) {
  const res = await fetchAllowlisted({
    url: `https://en.wikipedia.org/w/api.php?action=opensearch&limit=3&namespace=0&format=json&search=${encodeURIComponent(query)}`,
    as: 'json',
    fetchImpl,
  })
  if (!res.ok || !Array.isArray(res.body)) return { results: [] }
  const [, titles = [], , urls = []] = res.body
  return {
    results: titles.slice(0, 3).map((title, i) => ({
      title: stripUnsafeSnippet(title),
      url: String(urls[i] || '').slice(0, 300),
      snippet: stripUnsafeSnippet(title),
    })),
  }
}

export async function searchCdnLibraries({ query, package: pkg, fetchImpl } = {}) {
  const q = String(pkg || query || '').trim().slice(0, 80)
  if (!q) return { ok: false, error: 'QUERY_REQUIRED', results: [] }
  const local = DESIGN_RESOURCES.filter(
    (row) =>
      row.cdn &&
      `${row.id} ${row.name} ${(row.tags || []).join(' ')}`.toLowerCase().includes(q.toLowerCase()),
  ).slice(0, 6)
  const localRows = local.map((row) => ({
    name: row.name,
    id: row.id,
    version: row.version || null,
    cdn: row.cdn,
    allowed: row.cdn ? assertAllowedResourceUrl(row.cdn).ok : false,
    source: 'registry',
    package: row.id,
  }))
  if (!designResearchLiveEnabled(fetchImpl)) {
    return { ok: true, skipped: true, query: q, results: localRows }
  }
  const [jsdelivr, cdnjs] = await Promise.all([searchJsdelivr(q, fetchImpl), searchCdnjs(q, fetchImpl)])
  const merged = dedupeCdn([...localRows, ...jsdelivr, ...cdnjs]).slice(0, 8)
  return { ok: true, query: q, results: merged }
}

function isRegistryPackage(name) {
  const key = String(name || '').toLowerCase()
  if (!key) return false
  return DESIGN_RESOURCES.some(
    (row) =>
      row.id === key ||
      row.name.toLowerCase() === key ||
      String(row.cdn || '').toLowerCase().includes(`/npm/${key}@`) ||
      String(row.js || '').toLowerCase().includes(`/npm/${key}@`) ||
      String(row.cdn || '').toLowerCase().includes(`/libs/${key}/`),
  )
}

async function searchJsdelivr(query, fetchImpl) {
  const res = await fetchAllowlisted({
    url: `https://data.jsdelivr.com/v1/search?type=npm&limit=5&query=${encodeURIComponent(query)}`,
    as: 'json',
    fetchImpl,
  })
  const hits = res.ok ? res.body?.hits || res.body?.results || [] : []
  const rows = Array.isArray(hits) ? hits : []
  return rows.slice(0, 5).map((hit) => {
    const name = hit.name || hit.package?.name || query
    const version = hit.version || hit.tags?.latest || hit.package?.version || null
    const file = NPM_FILES[name] || hit.file || ''
    const cdn = version
      ? `https://cdn.jsdelivr.net/npm/${name}@${version}${file ? `/${file}` : '/'}`
      : null
    const allowed = Boolean(cdn && assertAllowedResourceUrl(cdn).ok && isRegistryPackage(name))
    return { name, id: name, version, cdn, allowed, source: 'jsdelivr', package: name }
  })
}

async function searchCdnjs(query, fetchImpl) {
  const res = await fetchAllowlisted({
    url: `https://api.cdnjs.com/libraries?search=${encodeURIComponent(query)}&fields=version,description,filename&limit=5`,
    as: 'json',
    fetchImpl,
  })
  const libs = res.ok ? res.body?.results || [] : []
  return libs.slice(0, 5).map((lib) => {
    const version = lib.version || null
    const file = lib.latest || lib.filename || ''
    const cdn = version && file ? `https://cdnjs.cloudflare.com/ajax/libs/${lib.name}/${version}/${file}` : null
    const allowed = Boolean(cdn && assertAllowedResourceUrl(cdn).ok && isRegistryPackage(lib.name))
    return {
      name: lib.name,
      id: lib.name,
      version,
      cdn,
      allowed,
      source: 'cdnjs',
      package: lib.name,
      description: stripUnsafeSnippet(lib.description),
    }
  })
}

function dedupeCdn(rows) {
  const seen = new Set()
  return rows.filter((row) => {
    const key = `${row.source}:${row.package || row.id}:${row.version || ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function pinLiveCdnVersion(resource, fetchImpl) {
  if (!resource?.cdn || !designResearchLiveEnabled(fetchImpl)) return resource
  const npm = parseNpmCdn(resource.cdn) || parseNpmCdn(resource.js)
  if (!npm) return resource
  const res = await fetchAllowlisted({
    url: `https://data.jsdelivr.com/v1/packages/npm/${encodeURIComponent(npm.name)}`,
    as: 'json',
    fetchImpl,
  })
  const version = res.ok ? res.body?.tags?.latest || res.body?.version : null
  if (!version || version === npm.version) return resource
  const nextCdn = resource.cdn?.replace(`@${npm.version}`, `@${version}`)
  const nextJs = resource.js?.replace(`@${npm.version}`, `@${version}`)
  if (nextCdn && !assertAllowedResourceUrl(nextCdn).ok) return resource
  if (nextJs && !assertAllowedResourceUrl(nextJs).ok) return resource
  return { ...resource, version, cdn: nextCdn || resource.cdn, js: nextJs || resource.js, pinnedFrom: npm.version }
}

function parseNpmCdn(url) {
  const match = String(url || '').match(/cdn\.jsdelivr\.net\/npm\/(@?[^@/]+)@([^/]+)/)
  if (!match) return null
  return { name: match[1], version: match[2] }
}

export async function verifyFontCdn(resource, fetchImpl) {
  if (!resource?.cdn || resource.category !== 'fonts' || !designResearchLiveEnabled(fetchImpl)) return resource
  const check = assertAllowedResourceUrl(resource.cdn)
  if (!check.ok) return resource
  const res = await fetchAllowlisted({ url: check.url, as: 'text', fetchImpl, timeoutMs: 3500 })
  return res.ok ? { ...resource, fontVerified: true } : resource
}

export async function researchDesign({ prompt, style, category, selection, fetchImpl } = {}) {
  const queries = researchQueries({ prompt, style, category })
  const practices = localDesignPractices({ prompt, style, category })
  const web = []
  const libraries = []
  const pins = []
  const errors = []
  const live = designResearchLiveEnabled(fetchImpl)

  if (live) {
    const webList = await Promise.all(queries.slice(0, 2).map((query) => searchWebDesign({ query, fetchImpl })))
    for (const item of webList) {
      for (const row of item.results || []) {
        web.push({ ...row, query: item.query, source: item.source })
      }
      if (item.ok === false) errors.push(item.message || item.error)
    }
    const libQuery = libraryQuery({ prompt, style, selection })
    if (libQuery) {
      const found = await searchCdnLibraries({ query: libQuery, fetchImpl })
      libraries.push(...(found.results || []))
    }
    for (const row of (selection?.selected || []).filter((item) => item?.cdn && item.category !== 'images').slice(0, 4)) {
      const next = row.category === 'fonts' ? await verifyFontCdn(row, fetchImpl) : await pinLiveCdnVersion(row, fetchImpl)
      if (next && (next.version !== row.version || next.fontVerified || next.pinnedFrom)) pins.push(next)
    }
  }

  return {
    ok: true,
    live,
    queries,
    practices,
    web: web.slice(0, 8),
    libraries: libraries.filter((row) => row.allowed).slice(0, 6),
    rejectedLibraries: libraries.filter((row) => row.cdn && !row.allowed).slice(0, 4),
    pins,
    errors: errors.slice(0, 4),
    at: new Date().toISOString(),
  }
}

function libraryQuery({ prompt, style, selection }) {
  const asked = String(prompt || '').toLowerCase()
  if (/gsap/.test(asked)) return 'gsap'
  if (/lenis/.test(asked)) return 'lenis'
  if (/aos/.test(asked)) return 'aos'
  if (/bootstrap/.test(asked) && !/bootstrap icons/.test(asked)) return 'bootstrap'
  if (/lucide|icon/.test(asked) || selection?.icons?.id === 'lucide') return 'lucide'
  if (/font/.test(asked)) return null
  return selection?.icons?.id || selection?.animation?.id || null
}

export function applyResearchToSelection(selection, research) {
  if (!selection || !research) return selection
  const pins = new Map((research.pins || []).map((row) => [row.id, row]))
  const selected = (selection.selected || []).map((row) => (pins.get(row.id) ? { ...row, ...pins.get(row.id) } : row))
  const used = (selection.used || []).map((row) => {
    const pin = pins.get(row.id)
    return pin ? { ...row, version: pin.version || row.version, cdn: pin.cdn || row.cdn } : row
  })
  const font = pins.get(selection.font?.id) ? { ...selection.font, ...pins.get(selection.font.id) } : selection.font
  return { ...selection, selected, used, font, research }
}

export function formatResearchBrief(research) {
  if (!research) return ''
  const lines = [
    'DESIGN RESEARCH (inspiration only — compose an original React + Vite page, never a template or a standalone HTML/CSS site):',
    research.live ? 'Live web/CDN lookup ran before coding.' : 'Offline practice set (live lookup skipped).',
  ]
  for (const row of research.practices || []) {
    lines.push(`- practice: ${row.title}. ${row.advice}`)
  }
  for (const row of (research.web || []).slice(0, 5)) {
    const snippet = stripUnsafeSnippet(row.snippet || row.title)
    if (snippet) lines.push(`- web: ${snippet}${row.url ? ` (${row.url})` : ''}`)
  }
  for (const row of research.pins || []) {
    lines.push(`- pinned ${row.name || row.id} @${row.version}${row.fontVerified ? ' (font CSS verified)' : ''}`)
  }
  if (research.rejectedLibraries?.length) {
    lines.push('- untrusted CDN hits were ignored; only allowlisted hosts can be injected.')
  }
  return lines.join('\n')
}

export async function researchDesignPractices(input = {}) {
  const research = await researchDesign(input)
  return { ok: true, ...research }
}

export { assertAllowedResearchUrl }
