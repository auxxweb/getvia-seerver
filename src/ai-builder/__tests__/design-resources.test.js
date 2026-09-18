import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import {
  assertAllowedResourceUrl,
  trustedResourceDomains,
  isBenignExternalResourceFailure,
  selectDesignResources,
  resourceMode,
  applyDesignResources,
  sanitizeIndexHtmlResources,
  searchDesignResources,
  inspectDesignResource,
  getCdnResource,
  runDesignResourceTool,
  selectAndApplyDesignResources,
  getResourceById,
  researchDesign,
  searchCdnLibraries,
  searchWebDesign,
  assertAllowedResearchUrl,
  localDesignPractices,
} from '../design-resources/index.js'
import { executeTool } from '../v2/toolExecutor.js'

const GOSSIP = 'Create an ultra-modern premium clothing website for Gossip Girls.'

test('Gossip Girls CREATE uses editorial type, Lucide, native CSS, and no extra libraries', () => {
  const selection = selectDesignResources({ prompt: GOSSIP, intent: 'CREATE' })
  assert.equal(selection.mode, 'REDESIGN')
  assert.equal(selection.font.id, 'font-editorial-fashion')
  assert.equal(selection.icons.id, 'lucide')
  assert.equal(selection.animation.id, 'css-animation')
  assert.equal(selection.cssLibrary.id, 'native-css')
  assert.equal(selection.used.some((row) => row.id === 'bootstrap'), false)
  assert.equal(selection.used.some((row) => row.id === 'gsap'), false)
  assert.equal(selection.used.some((row) => row.id === 'tailwind-cdn'), false)
  assert.equal(selection.framework, 'react-vite')
  assert.ok(selection.components.some((row) => row.id === 'immersive-hero'))
  assert.ok(selection.components.some((row) => row.id === 'product-grid'))
})

test('PRESERVE keeps Lucide instead of introducing Font Awesome', () => {
  const selection = selectDesignResources({
    prompt: 'Add a bag icon to the nav',
    intent: 'EDIT',
    hasSite: true,
    existing: [
      { id: 'lucide', category: 'icons' },
      { id: 'font-editorial-fashion', category: 'fonts' },
    ],
  })
  assert.equal(selection.mode, 'PRESERVE')
  assert.equal(selection.icons.id, 'lucide')
  assert.equal(selection.used.some((row) => row.id === 'font-awesome'), false)
})

test('resource mode maps redesign vs preserve', () => {
  assert.equal(resourceMode({ intent: 'CREATE', prompt: GOSSIP }), 'REDESIGN')
  assert.equal(resourceMode({ intent: 'EDIT', hasSite: true, prompt: 'Tweak the footer copy' }), 'PRESERVE')
  assert.equal(resourceMode({ intent: 'EDIT', hasSite: true, prompt: 'Redesign the look' }), 'REDESIGN')
  assert.equal(resourceMode({ intent: 'CREATE', prompt: 'Reimagine the brand from scratch' }), 'REIMAGINE')
})

test('CDN allowlist rejects javascript and unknown hosts', () => {
  assert.equal(assertAllowedResourceUrl('javascript:alert(1)').ok, false)
  assert.equal(assertAllowedResourceUrl('http://cdn.jsdelivr.net/npm/x').ok, false)
  assert.equal(assertAllowedResourceUrl('https://evil.example/x.js').ok, false)
  assert.equal(assertAllowedResourceUrl('https://fonts.googleapis.com/css2?family=Inter').ok, true)
  assert.equal(
    isBenignExternalResourceFailure('failed', 'https://fonts.googleapis.com/css2?family=Inter'),
    true,
  )
  assert.equal(isBenignExternalResourceFailure('failed', 'http://127.0.0.1:4173/missing.js'), false)
  const previous = process.env.DESIGN_RESOURCE_ALLOWLIST
  process.env.DESIGN_RESOURCE_ALLOWLIST = 'fonts.googleapis.com'
  try {
    assert.ok(trustedResourceDomains().includes('fonts.googleapis.com'))
    assert.equal(assertAllowedResourceUrl('https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js').ok, false)
  } finally {
    if (previous == null) delete process.env.DESIGN_RESOURCE_ALLOWLIST
    else process.env.DESIGN_RESOURCE_ALLOWLIST = previous
  }
})

test('sanitize strips untrusted scripts from index.html', () => {
  const html = `<html><head>
    <script src="https://evil.example/x.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet" />
  </head><body>
    <script type="module" src="/src/main.jsx"></script>
  </body></html>`
  const sanitized = sanitizeIndexHtmlResources(html)
  assert.ok(sanitized.rejected.length)
  assert.equal(sanitized.html.includes('evil.example'), false)
  assert.ok(sanitized.html.includes('fonts.googleapis.com'))
  assert.ok(sanitized.html.includes('/src/main.jsx'))
})

test('Gossip Girls apply injects Google Fonts and skips Lucide/GSAP CDNs', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-resources-'))
  await fs.mkdir(path.join(dir, 'src'), { recursive: true })
  await fs.writeFile(
    path.join(dir, 'index.html'),
    `<!doctype html><html><head><title>Site</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>\n`,
  )
  await fs.writeFile(path.join(dir, 'src/index.css'), ':root { --font: Georgia, serif; }\n')
  const selection = selectDesignResources({ prompt: GOSSIP, intent: 'CREATE' })
  const applied = await applyDesignResources(dir, selection, { replace: true })
  assert.equal(applied.ok, true)
  const html = await fs.readFile(path.join(dir, 'index.html'), 'utf8')
  assert.match(html, /fonts\.googleapis\.com/)
  assert.match(html, /Playfair/)
  assert.equal(html.includes('lucide'), false)
  assert.equal(html.includes('bootstrap'), false)
  assert.equal(html.includes('gsap'), false)
  const css = await fs.readFile(path.join(dir, 'src/index.css'), 'utf8')
  assert.match(css, /Playfair Display/)
  const log = JSON.parse(await fs.readFile(path.join(dir, '.getvia/resource-log.json'), 'utf8'))
  assert.ok(log.some((row) => row.id === 'font-editorial-fashion'))
})

test('design resource tools return structured registry results', async () => {
  const search = searchDesignResources({
    category: 'components',
    query: 'fashion ecommerce hero',
    style: 'editorial luxury',
    framework: 'react-vite',
  })
  assert.equal(search.framework, 'react-vite')
  assert.ok(search.results.length)
  assert.ok(search.results.some((row) => row.id === 'immersive-hero' || row.category === 'components'))
  const lucide = inspectDesignResource({ id: 'lucide' })
  assert.equal(lucide.ok, true)
  assert.equal(lucide.allowed, true)
  assert.equal(lucide.blocked.length, 0)
  const blocked = getCdnResource({ url: 'https://evil.example/app.js' })
  assert.equal(blocked.ok, false)
  const ran = await runDesignResourceTool('get_font_reference', { query: GOSSIP, style: 'editorial luxury' })
  assert.equal(ran.id, 'font-editorial-fashion')
})

test('selectAndApply picks a fashion-industry direction and records brain-ready used list', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-engine-'))
  await fs.mkdir(path.join(dir, 'src'), { recursive: true })
  await fs.writeFile(
    path.join(dir, 'index.html'),
    `<!doctype html><html><head><title>Site</title></head><body><div id="root"></div></body></html>\n`,
  )
  await fs.writeFile(path.join(dir, 'src/index.css'), ':root { --font: Georgia, serif; }\n')
  const prepared = await selectAndApplyDesignResources({
    workspaceDir: dir,
    prompt: GOSSIP,
    intent: 'CREATE',
    projectId: 'gossip-1',
    business: { category: 'Boutique', name: 'Gossip Girls' },
  })
  const fashionPool = ['editorial', 'magazine', 'image-first', 'neo-minimal', 'brutalist', 'asymmetric']
  assert.ok(fashionPool.includes(prepared.explore.pinned) || fashionPool.includes(prepared.explore.chosen?.direction))
  assert.ok(prepared.composition?.industry?.id === 'fashion_retail' || fashionPool.includes(prepared.explore.chosen?.direction))
  assert.ok(prepared.selection.used.some((row) => row.category === 'fonts'))
  assert.ok(getResourceById('font-fontshare-satoshi'))
  assert.equal(/\b(drop|remove|delete)\b/i.test(prepared.brief), false)
  assert.match(prepared.brief, /DESIGN RESEARCH|UNIVERSAL DESIGN LIBRARY|PRODUCT CONTRACT/)
})

test('V2 executor runs search_design_resources without a workspace path', async () => {
  const result = await executeTool({
    tool: 'search_design_resources',
    userId: 'owner1',
    projectId: 'site1',
    query: 'fashion hero',
    category: 'components',
    style: 'editorial luxury',
  })
  assert.equal(result.success, true)
  assert.ok(Array.isArray(result.results))
})

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

function mockDesignFetch(url) {
  const href = String(url)
  if (href.includes('data.jsdelivr.com/v1/packages/npm/lucide')) {
    return jsonResponse({ tags: { latest: '0.469.0' }, version: '0.469.0' })
  }
  if (href.includes('data.jsdelivr.com/v1/search')) {
    return jsonResponse({ hits: [{ name: 'lucide', version: '0.469.0' }] })
  }
  if (href.includes('api.cdnjs.com')) return jsonResponse({ results: [] })
  if (href.includes('api.duckduckgo.com')) {
    return jsonResponse({
      Heading: 'Editorial design',
      AbstractText: 'Editorial fashion layouts use serif display type and generous whitespace.',
      AbstractURL: 'https://en.wikipedia.org/wiki/Editorial_design',
    })
  }
  if (href.includes('fonts.googleapis.com')) {
    return { ok: true, status: 200, json: async () => ({}), text: async () => '@font-face { font-family: Playfair; }' }
  }
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' }
}

test('live research searches the web and CDNs then still refuses untrusted hosts', async () => {
  assert.equal(assertAllowedResearchUrl('https://evil.example/x').ok, false)
  assert.equal(assertAllowedResearchUrl('https://data.jsdelivr.com/v1/search?q=lucide').ok, true)
  const practices = localDesignPractices({ prompt: GOSSIP, style: 'Editorial' })
  assert.ok(practices.some((row) => row.id === 'editorial-fashion'))

  const selection = selectDesignResources({ prompt: GOSSIP, intent: 'CREATE' })
  const research = await researchDesign({
    prompt: GOSSIP,
    style: 'Editorial',
    category: 'fashion',
    selection,
    fetchImpl: mockDesignFetch,
  })
  assert.equal(research.live, true)
  assert.ok(research.web.some((row) => /serif display/i.test(row.snippet)))
  assert.ok(research.pins.some((row) => row.id === 'lucide' && row.version === '0.469.0'))
  assert.ok(research.practices.some((row) => row.id === 'native-first'))

  const cdn = await searchCdnLibraries({ query: 'evil-malware', fetchImpl: async () => jsonResponse({ hits: [{ name: 'evil-malware', version: '1.0.0' }] }) })
  assert.ok(cdn.results.every((row) => row.allowed === false || row.source === 'registry'))
  const web = await searchWebDesign({ query: 'editorial fashion website typography', fetchImpl: mockDesignFetch })
  assert.ok(web.results.length)
})

test('research_design_practices tool is executable without a workspace path', async () => {
  const result = await executeTool({
    tool: 'research_design_practices',
    userId: 'owner1',
    projectId: 'site1',
    query: GOSSIP,
    style: 'editorial luxury',
  })
  assert.equal(result.success, true)
  assert.ok(Array.isArray(result.practices))
})

