import fs from 'node:fs/promises'
import path from 'node:path'
import { applyWorkspaceFiles } from '../workspace/projectFiles.js'
import { readBusinessJson } from '../agents/codingAgent.js'

function quotedHeading(prompt) {
  const text = String(prompt || '')
  const match =
    text.match(/(?:homepage\s+|home\s+|hero\s+)?(?:h1|heading|title)\s+to:\s*["']([^"']+)["']/i) ||
    text.match(/\bh1\s+to[:\s]+["']([^"']+)["']/i) ||
    text.match(/change only the homepage h1 to\s+["']([^"']+)["']/i)
  return match?.[1]?.trim() || null
}

export async function applyTypedWorkspaceEdit({ workspaceDir, prompt } = {}) {
  const text = String(prompt || '')
  const written = []
  const events = []
  const business = (await readBusinessJson(workspaceDir)) || {}
  let next = structuredClone(business)
  let appPath = path.join(workspaceDir, 'src/App.jsx')
  let app = ''
  try {
    app = await fs.readFile(appPath, 'utf8')
  } catch {
    app = ''
  }
  const originalApp = app

  const heading = quotedHeading(text)
  const wantsGlass = /\bglassmorph/i.test(text)
  const wantsPricing = /\b(add|include|put|new)\b/i.test(text) && /\bpricing\b/i.test(text)
  const wantsDebug = /failed to resolve import|cannot find module|missing\.js/i.test(text)
  const wantsMobile = /\b(mobile (menu|nav|navigation)|hamburger|viewport)\b/i.test(text)
  if (!heading && !wantsGlass && !wantsPricing && !wantsDebug && !wantsMobile) {
    return { ok: true, written: [], events: [], skipped: true, business }
  }

  if (heading) {
    next.hero = { ...(next.hero || {}), title: heading }
    events.push({ type: 'FILE_UPDATED', message: `Set hero.title in src/data/business.json` })
  }

  if (wantsGlass) {
    next.look = 'glassmorphism'
    events.push({ type: 'FILE_UPDATED', message: 'Set look to glassmorphism' })
  }

  if (wantsPricing) {
    next.sections = Array.isArray(next.sections) ? [...next.sections] : []
    if (!next.sections.includes('pricing')) {
      const at = next.sections.indexOf('offers')
      next.sections.splice(at >= 0 ? at + 1 : Math.max(next.sections.length - 2, 0), 0, 'pricing')
    }
    if (!Array.isArray(next.pricing) || !next.pricing.length) {
      next.pricing = (next.treatments || next.services || []).map((row) => ({
        name: row.name,
        description: row.description,
        price: row.price || 'On request',
      }))
    }
    if (app && !/id=["']pricing["']/.test(app)) {
      const block = `
function Pricing() {
  const items = business.pricing || []
  if (!items.length) return null
  return (
    <section id="pricing" className="section">
      <div className="section-head">
        <p className="eyebrow">Investment</p>
        <h2>Pricing</h2>
      </div>
      <div className="grid">
        {items.map((item) => (
          <article key={item.name} className="card glass">
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            {item.price ? <p className="price">{item.price}</p> : null}
          </article>
        ))}
      </div>
    </section>
  )
}
`
      if (!/function Pricing\(/.test(app)) app = app.replace(/export default function App/, `${block}\nexport default function App`)
      if (/<Offers \/>/.test(app) && !/<Pricing \/>/.test(app)) {
        app = app.replace('<Offers />', '<Offers />\n      <Pricing />')
      } else if (/<Contact \/>/.test(app) && !/<Pricing \/>/.test(app)) {
        app = app.replace('<Contact />', '<Pricing />\n      <Contact />')
      }
      events.push({ type: 'FILE_UPDATED', message: 'Added Pricing section to src/App.jsx' })
    }
  }

  if (wantsDebug && app) {
    const nextApp = app.replace(/import ['"]\.\/missing\.js['"]\s*;?\n?/g, '')
    if (nextApp !== app) {
      app = nextApp
      events.push({ type: 'FILE_UPDATED', message: 'Removed broken import from src/App.jsx' })
    }
  }

  let cssOut = null
  if (wantsMobile) {
    const cssPath = path.join(workspaceDir, 'src/index.css')
    let css = ''
    try {
      css = await fs.readFile(cssPath, 'utf8')
    } catch {
      css = ''
    }
    if (css && !/@media \(max-width: 768px\)[\s\S]*\.nav-toggle \{ display: block/.test(css)) {
      cssOut = `${css}
@media (max-width: 768px) {
  .nav-desktop { display: none; }
  .nav-toggle { display: block; }
  .hero, .section { overflow-wrap: anywhere; }
  .actions { flex-wrap: wrap; }
}
`
      events.push({ type: 'FILE_UPDATED', message: 'Fixed mobile navigation CSS' })
    }
    if (app && !/nav-toggle/.test(app)) {
      app = app.replace(
        /<nav className="nav-desktop">/,
        `<details className="nav-toggle"><summary>Menu</summary><nav>{(business.sections || []).map((id) => <a key={id} href={\`#\${id}\`}>{id}</a>)}</nav></details>\n      <nav className="nav-desktop">`,
      )
      events.push({ type: 'FILE_UPDATED', message: 'Added mobile menu toggle' })
    }
  }

  const files = []
  if (JSON.stringify(next) !== JSON.stringify(business)) {
    files.push({ path: 'src/data/business.json', contents: `${JSON.stringify(next, null, 2)}\n` })
  }
  if (app && app !== originalApp) files.push({ path: 'src/App.jsx', contents: app })
  if (cssOut) files.push({ path: 'src/index.css', contents: cssOut })
  const applied = await applyWorkspaceFiles({ workspaceDir, files })
  written.push(...(applied.written || []))
  return { ok: written.length > 0, written, events, heading, business: next }
}
