import fs from 'node:fs/promises'
import path from 'node:path'
import { listWorkspaceFiles } from '../workspace/projectFiles.js'

const IMPORT_RE = /from\s+['"]([^'"]+)['"]/g

export async function indexWorkspace(workspaceDir) {
  const names = await listWorkspaceFiles(workspaceDir)
  const files = names.filter((n) => !n.startsWith('node_modules') && !n.startsWith('dist') && !n.startsWith('.getvia'))
  const map = {}
  for (const rel of files) {
    if (!/\.(jsx?|css|json|html)$/.test(rel)) continue
    let contents = ''
    try {
      contents = await fs.readFile(path.join(workspaceDir, rel), 'utf8')
    } catch {
      continue
    }
    const imports = []
    for (const match of contents.matchAll(IMPORT_RE)) imports.push(match[1])
    map[rel] = {
      path: rel,
      imports,
      kind: rel.endsWith('.css') ? 'style' : rel.includes('/data/') ? 'data' : rel.endsWith('.jsx') ? 'component' : 'file',
      bytes: contents.length,
    }
  }
  const components = files
    .filter((n) => n.startsWith('src/') && n.endsWith('.jsx'))
    .map((n) => ({
      name: path.basename(n, path.extname(n)),
      path: n,
      purpose: n.includes('App') ? 'root' : 'ui',
      usageCount: Object.values(map).filter((row) => row.imports.some((i) => i.includes(path.basename(n, '.jsx')))).length,
    }))
  return { files, map, components, indexedAt: new Date().toISOString() }
}

export function filesForPrompt(index, prompt) {
  const lower = String(prompt || '').toLowerCase()
  const hits = []
  const add = (rel) => {
    if (rel && !hits.includes(rel)) hits.push(rel)
  }
  add('src/data/business.json')
  add('src/App.jsx')
  add('src/index.css')
  if (/hero|button|cta|booking|whatsapp/.test(lower)) add('src/App.jsx')
  if (/theme|look|glass|luxury|color|colour|font/.test(lower)) {
    add('src/design-system/tokens.js')
    add('src/index.css')
  }
  if (/nav|menu|header/.test(lower)) add('src/App.jsx')
  for (const [rel] of Object.entries(index?.map || {})) {
    const base = rel.toLowerCase()
    if (/hero/.test(lower) && /hero/.test(base)) add(rel)
  }
  return hits
}
