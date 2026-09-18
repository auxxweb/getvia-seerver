import fs from 'node:fs/promises'
import { indexWorkspace, filesForPrompt } from './projectIndexer.js'
import { assertInsideWorkspace } from '../security/pathPolicy.js'

export async function inspectProject(workspaceDir, prompt = '') {
  const index = await indexWorkspace(workspaceDir)
  const relevant = filesForPrompt(index, prompt)
  const homepage = index.files.includes('src/App.jsx')
    ? 'src/App.jsx'
    : index.components.find((c) => /app|home|page/i.test(c.name))?.path || null
  const h1 = await locateH1(workspaceDir, homepage)
  const headerFile = index.components.find((c) => /header|nav/i.test(c.name))?.path || homepage
  const heroCss = index.files.find((f) => f.endsWith('index.css')) || null
  return {
    homepage,
    h1,
    header: headerFile,
    hero: homepage,
    css: heroCss,
    relevant,
    files: index.files,
    components: index.components,
  }
}

export async function locateH1(workspaceDir, homepage = 'src/App.jsx') {
  const candidates = ['src/data/business.json', homepage, 'src/App.jsx'].filter(Boolean)
  const seen = new Set()
  let binding = null
  for (const rel of candidates) {
    if (seen.has(rel)) continue
    seen.add(rel)
    const inside = assertInsideWorkspace(workspaceDir, rel)
    if (!inside.ok) continue
    let text = ''
    try {
      text = await fs.readFile(inside.path, 'utf8')
    } catch {
      continue
    }
    if (rel.endsWith('business.json')) {
      try {
        const data = JSON.parse(text)
        if (data?.hero?.title) {
          return { file: rel, via: 'hero.title', text: data.hero.title }
        }
      } catch {
        /* ignore */
      }
    }
    const literal = text.match(/<h1[^>]*>([^<{][^<]*)<\/h1>/)
    if (literal?.[1]?.trim()) return { file: rel, via: 'jsx-literal', text: literal[1].trim() }
    if (!binding && (/<h1[\s>]/.test(text) || /hero\.title/.test(text))) {
      binding = { file: rel, via: 'jsx-binding', text: 'hero.title || business.name' }
    }
  }
  return binding || { file: null, via: null, text: null }
}

export async function inspectMobileNav(workspaceDir) {
  const appInside = assertInsideWorkspace(workspaceDir, 'src/App.jsx')
  const cssInside = assertInsideWorkspace(workspaceDir, 'src/index.css')
  let app = ''
  let css = ''
  if (appInside.ok) {
    try {
      app = await fs.readFile(appInside.path, 'utf8')
    } catch {
      app = ''
    }
  }
  if (cssInside.ok) {
    try {
      css = await fs.readFile(cssInside.path, 'utf8')
    } catch {
      css = ''
    }
  }
  const hasToggle = /nav-toggle/.test(app)
  const hasMedia = /@media \(max-width: 768px\)[\s\S]*\.nav-toggle \{ display: block/.test(css)
  return {
    ok: hasToggle && hasMedia,
    hasToggle,
    hasMedia,
    issues: [
      ...(!hasToggle ? [{ severity: 'high', description: 'No mobile menu toggle', target: 'src/App.jsx' }] : []),
      ...(!hasMedia ? [{ severity: 'high', description: 'No mobile nav CSS', target: 'src/index.css' }] : []),
    ],
  }
}

export function selectContext(index, prompt, brain) {
  const files = filesForPrompt(index, prompt)
  return {
    files,
    components: (index.components || []).filter((c) => files.some((f) => f === c.path)).slice(0, 20),
    designSystem: brain?.designSystem || {},
    recentChanges: (brain?.recentChanges || []).slice(-8),
  }
}
