import fs from 'node:fs/promises'
import path from 'node:path'
import { completeJson } from '../openai/structuredOutput.js'
import { resolveVisionModel } from '../openai/modelRouter.js'
import { AI_SECTION_TYPES } from '../constants.js'

const LAYOUTS = ['split-columns', 'centered', 'dark-bar', 'newsletter', 'link-grid', 'stacked']

export function sanitizeReferenceImageUrl(raw) {
  const value = String(raw || '').trim().slice(0, 2000)
  if (!value) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return ''
    const host = url.hostname.toLowerCase()
    if (host === 'res.cloudinary.com' || host.endsWith('.cloudinary.com')) return url.toString()
    return ''
  } catch {
    return ''
  }
}

export function isReferenceDesignPrompt(prompt, imageUrl = '') {
  if (sanitizeReferenceImageUrl(imageUrl)) return true
  return /\b(like (this|the) image|similar to (this|the) (image|photo|picture|screenshot)|match this|inspired by|design like)\b/i.test(
    String(prompt || ''),
  )
}

export function sectionFromPrompt(prompt, selectedElement = null) {
  const lower = String(prompt || '').toLowerCase()
  const named = AI_SECTION_TYPES.find((id) => new RegExp(`\\b${id}\\b`, 'i').test(lower))
  if (named) return named
  if (/\b(banner|header)\b/.test(lower)) return 'hero'
  if (/\b(nav|navigation|menu)\b/.test(lower)) return 'nav'
  if (/\b(footer|colophon)\b/.test(lower)) return 'footer'
  const fromEl = selectedElement?.sectionId
  if (fromEl && fromEl !== 'site' && (AI_SECTION_TYPES.includes(fromEl) || fromEl === 'nav' || fromEl === 'pricing')) {
    return fromEl
  }
  return 'site'
}

function hexOr(value, fallback) {
  const raw = String(value || '').trim()
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw) ? raw : fallback
}

export function heuristicReferenceSpec({ prompt, section = 'footer' } = {}) {
  const text = String(prompt || '').toLowerCase()
  let layout = 'split-columns'
  if (/\b(center|centred|centered|minimal)\b/.test(text)) layout = 'centered'
  else if (/\bnewsletter\b/.test(text)) layout = 'newsletter'
  else if (/\b(bar|strip|thin)\b/.test(text)) layout = 'dark-bar'
  else if (/\b(grid|columns|links)\b/.test(text)) layout = 'link-grid'
  let background = '#111111'
  let textColor = '#f5f5f5'
  let accent = '#c9a227'
  if (/\b(white|light|ivory|cream)\b/.test(text) && !/\bdark\b/.test(text)) {
    background = '#f6f1ea'
    textColor = '#1a1a1a'
    accent = '#111111'
  }
  if (/\b(gold|luxury|champagne)\b/.test(text)) accent = '#c9a227'
  if (/\b(pink|blush|rose)\b/.test(text)) accent = '#c45c7a'
  if (/\b(green|emerald)\b/.test(text)) accent = '#0f6b3c'
  if (/\b(blue|navy)\b/.test(text)) {
    background = '#0b1c33'
    accent = '#8ab4ff'
  }
  return {
    section,
    layout,
    background,
    text: textColor,
    accent,
    muted: textColor === '#f5f5f5' ? '#cfcfcf' : '#5c5c5c',
    columns: layout === 'centered' || layout === 'dark-bar' ? 1 : 3,
    hasSocial: true,
    hasNewsletter: layout === 'newsletter',
    notes: 'Heuristic fallback used because vision analysis was unavailable.',
    source: 'heuristic',
  }
}

const REFERENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    section: { type: 'string' },
    layout: { type: 'string' },
    background: { type: 'string' },
    text: { type: 'string' },
    accent: { type: 'string' },
    muted: { type: 'string' },
    columns: { type: 'number' },
    hasSocial: { type: 'boolean' },
    hasNewsletter: { type: 'boolean' },
    notes: { type: 'string' },
  },
  required: ['layout', 'background', 'text', 'accent'],
}

export async function analyzeReferenceImage({
  imageUrl,
  prompt,
  section = 'footer',
  signal,
} = {}) {
  const url = sanitizeReferenceImageUrl(imageUrl)
  const fallback = heuristicReferenceSpec({ prompt, section })
  if (!url) return { ok: false, skipped: true, spec: fallback, message: 'No reference image URL.' }
  const result = await completeJson({
    tier: 'medium',
    model: resolveVisionModel(),
    schemaName: 'reference_section_design',
    schema: REFERENCE_SCHEMA,
    images: [url],
    system:
      'You extract visual design from a reference screenshot for one website section. Return JSON only. Match layout, color, density, and typography mood. Do not copy competitor business names, addresses, or phone numbers. Prefer hex colors you can actually see.',
    user: JSON.stringify({
      prompt: String(prompt || '').slice(0, 1500),
      section,
      allowedLayouts: LAYOUTS,
      rule: 'Describe the visual system of the requested section so a React+Vite one-page can reproduce a similar look using the owner business data.',
    }),
    signal,
    soft: true,
  })
  if (!result.ok || !result.data) {
    return {
      ok: false,
      skipped: Boolean(result.skipped),
      spec: fallback,
      message: result.error || result.code || 'Vision analysis unavailable; used a prompt-based layout instead.',
    }
  }
  const data = result.data
  const layout = LAYOUTS.includes(data.layout) ? data.layout : fallback.layout
  return {
    ok: true,
    skipped: false,
    spec: {
      section,
      layout,
      background: hexOr(data.background, fallback.background),
      text: hexOr(data.text, fallback.text),
      accent: hexOr(data.accent, fallback.accent),
      muted: hexOr(data.muted, fallback.muted),
      columns: Number(data.columns) > 0 ? Math.min(4, Math.floor(data.columns)) : fallback.columns,
      hasSocial: Boolean(data.hasSocial),
      hasNewsletter: Boolean(data.hasNewsletter),
      notes: String(data.notes || '').slice(0, 400),
      source: 'vision',
    },
    message: `Matched ${section} design from the uploaded image (${layout}).`,
  }
}

function footerElement(spec) {
  const layout = spec.layout || 'split-columns'
  return `<footer id="footer" className="footer footer-ref footer-${layout}">
              <div className="footer-grid">
                <div>
                  <p className="brand">{business.name}</p>
                  {business.about?.body ? <p>{String(business.about.body).slice(0, 160)}</p> : null}
                </div>
                <nav className="footer-links">
                  {(business.sections || []).filter((sid) => !['hero', 'footer', 'cta'].includes(sid)).slice(0, 6).map((sid) => (
                    <a key={sid} href={'#' + sid}>{sid}</a>
                  ))}
                </nav>
                <div>
                  {business.phone ? <p>{business.phone}</p> : null}
                  {business.email ? <p>{business.email}</p> : null}
                  {business.whatsapp ? <p><a href={business.whatsapp}>WhatsApp</a></p> : null}
                </div>
              </div>
              <p className="footer-copy">© {new Date().getFullYear()} {business.name}</p>
            </footer>`
}

export function cssForReferenceSpec(spec) {
  const section = spec.section || 'footer'
  const bg = spec.background
  const fg = spec.text
  const accent = spec.accent
  const layout = spec.layout || 'split-columns'
  if (section === 'hero') {
    return `
.hero {
  background: ${bg};
  color: ${fg};
}
.hero h1, .hero .lede, .hero .eyebrow { color: ${fg}; }
.hero .btn.primary { background: ${accent}; color: ${bg === '#111111' ? '#fff' : fg}; }
`
  }
  if (section !== 'footer' && section !== 'site') {
    return `
#${section}.section {
  background: ${bg};
  color: ${fg};
}
#${section}.section h2 { color: ${accent}; }
`
  }
  return `
.footer.footer-ref {
  background: ${bg};
  color: ${fg};
  padding: ${layout === 'dark-bar' ? '1.4rem 6vw' : '4.5rem 6vw 2rem'};
}
.footer.footer-ref a { color: inherit; text-decoration: none; }
.footer.footer-ref .footer-grid {
  display: grid;
  grid-template-columns: ${layout === 'centered' || layout === 'dark-bar' ? '1fr' : 'repeat(auto-fit, minmax(160px, 1fr))'};
  gap: 2rem;
  align-items: start;
  text-align: ${layout === 'centered' ? 'center' : 'left'};
}
.footer.footer-ref .footer-links { display: flex; flex-direction: column; gap: .45rem; }
.footer.footer-ref .brand { margin: 0 0 .6rem; font-size: 1.15rem; font-weight: 700; color: ${accent}; }
.footer.footer-ref .footer-copy { margin: 2rem 0 0; opacity: .72; font-size: .85rem; }
@media (max-width: 768px) {
  .footer.footer-ref .footer-grid { grid-template-columns: 1fr; }
}
`
}

export async function applyReferenceSection({ workspaceDir, spec } = {}) {
  if (!workspaceDir || !spec) return { ok: false, written: [], message: 'workspace and spec required.' }
  const written = []
  const section = spec.section || 'footer'
  if (section === 'footer' || section === 'site') {
    const appPath = path.join(workspaceDir, 'src/App.jsx')
    try {
      let app = await fs.readFile(appPath, 'utf8')
      const nextFooter = footerElement(spec)
      if (/<footer[^>]*id=["']footer["']/.test(app)) {
        app = app.replace(/<footer[^>]*id=["']footer["'][\s\S]*?<\/footer>/, nextFooter)
      } else {
        app = app.replace(
          /if \(id === ['"]footer['"]\) \{[\s\S]*?return \([\s\S]*?<\/footer>[\s\S]*?\)/,
          `if (id === 'footer') {\n          return (\n            ${nextFooter}\n          )`,
        )
      }
      await fs.writeFile(appPath, app, 'utf8')
      written.push('src/App.jsx')
    } catch {
      /* App.jsx may not exist yet */
    }
  }
  const cssPath = path.join(workspaceDir, 'src/index.css')
  try {
    let css = await fs.readFile(cssPath, 'utf8')
    const block = cssForReferenceSpec(spec)
    const marker = `/* getvia-ref-${section} */`
    if (css.includes(marker)) {
      css = css.replace(new RegExp(`/\\* getvia-ref-${section} \\*/[\\s\\S]*?(?=/\\* getvia-ref-|$)`), `${marker}\n${block}\n`)
    } else {
      css = `${css.trim()}\n\n${marker}\n${block}\n`
    }
    await fs.writeFile(cssPath, css, 'utf8')
    written.push('src/index.css')
  } catch {
    /* css optional */
  }
  return {
    ok: written.length > 0,
    written: [...new Set(written)],
    spec,
    message: `Applied ${section} look from the reference image.`,
  }
}

export function referencePromptAppendix(spec) {
  if (!spec) return ''
  return [
    '',
    `REFERENCE IMAGE DESIGN for the ${spec.section} section only.`,
    `Layout ${spec.layout}. Background ${spec.background}. Text ${spec.text}. Accent ${spec.accent}.`,
    'Keep existing business copy. Do not invent another brand. Restyle this section to feel like the uploaded image.',
    spec.notes || '',
  ].join('\n')
}
