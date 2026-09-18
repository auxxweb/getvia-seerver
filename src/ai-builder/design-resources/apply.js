import fs from 'node:fs/promises'
import path from 'node:path'
import { assertAllowedResourceUrl } from './allowlist.js'
import { getResourceById } from './catalog.js'

const FONT_MARK = '<!-- getvia:fonts -->'
const ICON_MARK = '<!-- getvia:icons -->'
const CSS_MARK = '<!-- getvia:css-libs -->'
const JS_MARK = '<!-- getvia:js-libs -->'

function linkTag(href) {
  return `    <link rel="stylesheet" href="${href}" />`
}

function scriptTag(src) {
  return `    <script src="${src}" defer></script>`
}

export function shouldInjectCdn(resource) {
  if (!resource) return false
  if (resource.injectCdn === false) return false
  if (resource.category === 'images' || resource.category === 'components') return false
  if (resource.id === 'native-css' || resource.id === 'css-animation') return false
  return Boolean(resource.cdn || resource.js || resource.playCdn)
}

function tagsFor(resource) {
  const head = []
  const body = []
  if (!resource || !shouldInjectCdn(resource)) return { head, body }
  if (resource.category === 'fonts' && resource.cdn) head.push(`${FONT_MARK}\n${linkTag(resource.cdn)}`)
  if (resource.category === 'icons' && resource.cdn?.includes('css')) head.push(`${ICON_MARK}\n${linkTag(resource.cdn)}`)
  if (resource.category === 'icons' && resource.cdn?.includes('.js')) body.push(`${JS_MARK}\n${scriptTag(resource.cdn)}`)
  if (resource.category === 'ui-css' && resource.cdn && resource.id !== 'native-css' && resource.id !== 'tailwind-cdn') {
    head.push(`${CSS_MARK}\n${linkTag(resource.cdn)}`)
  }
  if (resource.id === 'tailwind-cdn' && resource.playCdn) {
    body.push(`${JS_MARK}\n${scriptTag(resource.playCdn)}`)
  }
  if (resource.category === 'animation' && resource.cdn?.endsWith('.css')) head.push(`${CSS_MARK}\n${linkTag(resource.cdn)}`)
  if (resource.js) {
    const allowed = assertAllowedResourceUrl(resource.js)
    if (allowed.ok) body.push(`${JS_MARK}\n${scriptTag(allowed.url)}`)
  } else if (resource.category === 'animation' && resource.cdn?.endsWith('.js')) {
    body.push(`${JS_MARK}\n${scriptTag(resource.cdn)}`)
  }
  return { head, body }
}

export function collectExternalUrls(html) {
  const found = []
  const re = /\b(?:href|src)=["']([^"']+)["']/gi
  let match
  while ((match = re.exec(String(html || '')))) found.push(match[1])
  return found
}

function isLocalAsset(raw) {
  return (
    raw.startsWith('/') ||
    raw.startsWith('./') ||
    raw.startsWith('../') ||
    raw.startsWith('#') ||
    raw.startsWith('mailto:') ||
    raw.startsWith('tel:')
  )
}

export function sanitizeIndexHtmlResources(html) {
  const text = String(html || '')
  const rejected = []
  const next = text.replace(/\b(?:href|src)=["']([^"']+)["']/gi, (full, raw) => {
    if (isLocalAsset(raw)) return full
    if (raw.startsWith('data:')) {
      if (/^data:(?:text\/)?(?:javascript|html)/i.test(raw)) {
        rejected.push({ url: raw.slice(0, 80), code: 'RESOURCE_URL_REJECTED', message: 'Executable data URLs are not allowed.' })
        return full.replace(raw, '')
      }
      return full
    }
    const check = assertAllowedResourceUrl(raw)
    if (!check.ok) {
      rejected.push({ url: raw, code: check.code, message: check.message })
      return full.replace(raw, '')
    }
    return full
  })
  return { html: next, rejected }
}

function stripGetviaBlocks(html) {
  return String(html || '').replace(
    /\s*<!-- getvia:(?:fonts|icons|css-libs|js-libs) -->\s*(?:\n\s*<(?:link|script)[^>]*>\s*(?:<\/script>)?)?/g,
    '',
  )
}

function ensureHeadBody(html) {
  let text = String(html || '').trim()
  if (!text.includes('<html')) {
    text = `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Website</title>\n  </head>\n  <body>\n${text}\n  </body>\n</html>\n`
  }
  if (!text.includes('</head>')) text = text.replace('<body', '  <head></head>\n  <body')
  return text
}

export async function applyDesignResources(workspaceDir, selection, { replace = true } = {}) {
  if (!workspaceDir || !selection) return { ok: false, written: [], used: [] }
  const file = path.join(workspaceDir, 'index.html')
  let html = ''
  try {
    html = await fs.readFile(file, 'utf8')
  } catch {
    return { ok: true, skipped: true, written: [], used: selection.used || [], rejected: [] }
  }
  html = ensureHeadBody(html)
  const preserve = selection.mode === 'PRESERVE' || selection.mode === 'EVOLVE'
  if (replace && !preserve) html = stripGetviaBlocks(html)

  const headBits = []
  const bodyBits = []
  const inject = (row) => {
    const resolved = getResourceById(row?.id || row?.name) || row
    if (!shouldInjectCdn(resolved)) return
    for (const url of [resolved.cdn, resolved.js, resolved.playCdn].filter(Boolean)) {
      const allowed = assertAllowedResourceUrl(url)
      if (!allowed.ok) return
    }
    const tags = tagsFor(resolved)
    headBits.push(...tags.head)
    bodyBits.push(...tags.body)
  }

  if (!preserve || replace) {
    for (const row of selection.selected || []) inject(row)
  }

  if (headBits.length && html.includes('</head>')) {
    html = html.replace('</head>', `${[...new Set(headBits)].join('\n')}\n  </head>`)
  }
  if (bodyBits.length && html.includes('</body>')) {
    html = html.replace('</body>', `${[...new Set(bodyBits)].join('\n')}\n  </body>`)
  }
  const sanitized = sanitizeIndexHtmlResources(html)
  await fs.writeFile(file, sanitized.html.endsWith('\n') ? sanitized.html : `${sanitized.html}\n`, 'utf8')
  const cssFile = await applyFontTokens(workspaceDir, selection.font)
  const used = (selection.used || []).filter((row) => row.source === 'cdn' || row.category === 'fonts' || row.category === 'icons')
  await appendResourceLog(workspaceDir, selection)
  return {
    ok: true,
    written: ['index.html', cssFile].filter(Boolean),
    used,
    rejected: sanitized.rejected,
  }
}

async function applyFontTokens(workspaceDir, font) {
  if (!font?.heading && !font?.body) return null
  const cssPath = path.join(workspaceDir, 'src/index.css')
  try {
    let css = await fs.readFile(cssPath, 'utf8')
    if (font.body) css = css.replace(/--font:\s*[^;]+;/, `--font: ${font.body};`)
    if (font.heading) {
      if (/--heading-font:/.test(css)) {
        css = css.replace(/--heading-font:\s*[^;]+;/, `--heading-font: ${font.heading};`)
      } else {
        css = css.replace(/(--font:\s*[^;]+;)/, `$1\n  --heading-font: ${font.heading};`)
      }
    }
    await fs.writeFile(cssPath, css, 'utf8')
    return 'src/index.css'
  } catch {
    return null
  }
}

async function appendResourceLog(workspaceDir, selection) {
  const rel = path.join(workspaceDir, '.getvia', 'resource-log.json')
  await fs.mkdir(path.dirname(rel), { recursive: true })
  let prev = []
  try {
    prev = JSON.parse(await fs.readFile(rel, 'utf8'))
  } catch {
    prev = []
  }
  const at = new Date().toISOString()
  const rows = (selection.used || []).map((row) => ({
    taskId: selection.mode,
    resource: row.name,
    id: row.id,
    version: row.version,
    source: row.source,
    purpose: row.purpose,
    at,
  }))
  await fs.writeFile(rel, `${JSON.stringify([...prev, ...rows].slice(-80), null, 2)}\n`, 'utf8')
}

export function resourceFromName(name) {
  return getResourceById(name)
}
