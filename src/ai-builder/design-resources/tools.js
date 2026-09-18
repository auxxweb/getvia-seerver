import { COMPONENT_REFERENCES, getResourceById, listResources } from './catalog.js'
import { assertAllowedResourceUrl } from './allowlist.js'
import { selectDesignResources } from './selector.js'
import { researchDesign, searchCdnLibraries, searchWebDesign } from './research.js'

function scoreResource(row, { query, style, category } = {}) {
  const blob = `${query || ''} ${style || ''} ${category || ''}`.toLowerCase()
  const hay = `${row.id} ${row.name} ${(row.tags || []).join(' ')} ${row.kind || ''} ${row.usage || ''}`.toLowerCase()
  let score = 0
  for (const token of blob.split(/[^\w]+/).filter((t) => t.length > 2)) {
    if (hay.includes(token)) score += 2
  }
  if (row.weight === 'none') score += 1
  if (row.weight === 'large') score -= 1
  if (row.category === 'ui-css' && row.id !== 'native-css' && !blob.includes(row.id) && !blob.includes(row.name.toLowerCase())) {
    score -= 4
  }
  return score
}

export function searchDesignResources({ category, query, style, framework, requirements } = {}) {
  const pool = listResources(category)
  const ranked = pool
    .map((row) => ({ row, score: scoreResource(row, { query, style, category: requirements }) }))
    .sort((a, b) => b.score - a.score)
  const top = (ranked[0]?.score > 0 ? ranked.filter((r) => r.score > 0) : ranked).slice(0, 8)
  return {
    query: query || '',
    style: style || '',
    framework: framework || 'react-vite',
    results: top.map(({ row, score }) => summarize(row, score)),
  }
}

function summarize(row, score) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    version: row.version || null,
    cdn: row.cdn || row.js || null,
    documentation: row.documentation || null,
    usage: row.usage || row.adapt || '',
    license: row.license || null,
    compatibleWith: row.compatibleWith || ['react', 'vite', 'jsx', 'css'],
    weight: row.weight || 'reference',
    score,
  }
}

export function inspectDesignResource({ id, name, resourceId } = {}) {
  const row = getResourceById(id || name || resourceId)
  if (!row) return { ok: false, error: 'RESOURCE_NOT_FOUND', message: 'Unknown design resource.' }
  const urls = [row.cdn, row.js, row.playCdn].filter(Boolean)
  const blocked = urls.map((url) => ({ url, ...assertAllowedResourceUrl(url) })).filter((u) => !u.ok)
  return {
    ok: true,
    id: row.id,
    name: row.name,
    category: row.category,
    version: row.version || null,
    cdn: row.cdn || null,
    javascript: row.js || null,
    documentation: row.documentation || null,
    usage: row.usage || row.adapt || '',
    license: row.license || null,
    compatibleWith: row.compatibleWith || ['react', 'vite', 'jsx', 'css'],
    accessibility: row.a11y || row.adapt || '',
    mobile: row.mobile !== false,
    customization: 'Adapt to DesignSpec colors, type, and spacing. Do not paste as a stock template.',
    structure: row.structure || null,
    cssIdeas: row.cssIdeas || null,
    js: row.js || row.kind && row.js,
    allowed: urls.every((url) => assertAllowedResourceUrl(url).ok),
    blocked,
  }
}

export function getComponentReference({ query, style, id } = {}) {
  if (id) {
    const row = COMPONENT_REFERENCES.find((c) => c.id === id)
    return row ? { ok: true, results: [row] } : { ok: false, error: 'RESOURCE_NOT_FOUND', results: [] }
  }
  const found = searchDesignResources({ category: 'components', query, style })
  return { ok: true, results: found.results }
}

export function getIconReference({ style, query, existing } = {}) {
  const picked = selectDesignResources({ prompt: query, style, existing, intent: 'CREATE' }).icons
  return inspectDesignResource({ id: picked?.id || 'lucide' })
}

export function getFontReference({ style, query, spec } = {}) {
  const picked = selectDesignResources({ prompt: query, style, spec, intent: 'CREATE' }).font
  return inspectDesignResource({ id: picked?.id || 'font-editorial-fashion' })
}

export function getAnimationReference({ query, style } = {}) {
  const picked = selectDesignResources({ prompt: query, style, intent: 'CREATE' }).animation
  return inspectDesignResource({ id: picked?.id || 'css-animation' })
}

export function getCdnResource({ id, name, url } = {}) {
  if (url) {
    const allowed = assertAllowedResourceUrl(url)
    return { ok: allowed.ok, ...allowed, id: id || null, name: name || null }
  }
  return inspectDesignResource({ id, name })
}

export async function runDesignResourceTool(tool, input = {}) {
  switch (tool) {
    case 'search_design_resources':
      return { ok: true, ...searchDesignResources(input) }
    case 'inspect_design_resource':
      return inspectDesignResource(input)
    case 'get_component_reference':
      return getComponentReference(input)
    case 'get_icon_reference':
      return getIconReference(input)
    case 'get_font_reference':
      return getFontReference(input)
    case 'get_animation_reference':
      return getAnimationReference(input)
    case 'get_cdn_resource':
      return getCdnResource(input)
    case 'research_design_practices':
      return researchDesign({ ...input, prompt: input.prompt || input.query })
    case 'search_cdn_libraries':
      return searchCdnLibraries(input)
    case 'search_web_design':
      return searchWebDesign(input)
    default:
      return { ok: false, error: 'TOOL_UNKNOWN' }
  }
}

export const DESIGN_RESOURCE_TOOL_NAMES = [
  'search_design_resources',
  'inspect_design_resource',
  'get_component_reference',
  'get_icon_reference',
  'get_font_reference',
  'get_animation_reference',
  'get_cdn_resource',
  'research_design_practices',
  'search_cdn_libraries',
  'search_web_design',
]
