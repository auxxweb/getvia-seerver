import fs from 'node:fs/promises'
import path from 'node:path'
import { indexProject } from '../brain/indexer/index.js'
import { readProjectBrain, refreshProjectBrain } from '../brain/index.js'

const MAX_FILES = 8
const MIN_SCORE = 10
const MAX_SNIPPET = 12

const PATTERNS = {
  homepage: /export default function App|<div[\s\S]*id=["']top["']/,
  navbar: /function Nav\b|className=["']nav["']|<header/,
  'mobile-menu': /nav-toggle|summary>\s*Menu/,
  cta: /primaryCta|btn[.\s]primary|\.btn\.primary/,
  hero: /function Hero\b|<h1|hero\.title/,
}

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
}

export function classifyTask(task) {
  const lower = String(task || '').toLowerCase()
  const tags = []
  if (/homepage|home page|\blanding\b|\bhome\b/.test(lower)) tags.push('homepage')
  if (/nav-?bar|navigation|\bheader\b/.test(lower)) tags.push('navbar')
  if (/mobile menu|hamburger|nav-toggle/.test(lower)) tags.push('mobile-menu')
  if (/primary cta|\bcta\b|call to action|hero button|book appointment|contact us|whatsapp/.test(lower)) tags.push('cta')
  if (/hero|\bh1\b|heading/.test(lower)) tags.push('hero')
  if (/color|theme|\bcss\b|style|look|tailwind/.test(lower)) tags.push('style')
  const kind = tags.includes('cta') ? 'cta' : tags.includes('mobile-menu') ? 'mobile-menu' : tags[0] || 'generic'
  return { kind, tags, lower }
}

function haystack(fileMeta, index) {
  const comps = (index.components || []).filter((c) => c.path === fileMeta.path).map((c) => c.name)
  return [fileMeta.path, fileMeta.kind, ...(fileMeta.components || []), ...comps, ...(fileMeta.classes || [])]
    .join(' ')
    .toLowerCase()
}

export function scoreFile(fileMeta, { task, kind, tags = [], index, brain, content = '' }) {
  const lower = String(task || '').toLowerCase()
  const tagSet = new Set(tags.length ? tags : [kind])
  const base = haystack(fileMeta, index)
  const blob = `${base}\n${content}`
  let score = 0
  const reasons = []

  if (fileMeta.path === index.homepage || fileMeta.path === 'src/App.jsx') {
    score += tagSet.has('style') && tagSet.size === 1 ? 8 : 28
    reasons.push('homepage')
  }
  if (fileMeta.path === 'src/main.jsx') score += 4
  if (fileMeta.path === 'src/data/business.json') {
    score += tagSet.has('cta') || tagSet.has('hero') || /cta|hero|heading|content|copy|button/.test(lower) ? 36 : 8
    reasons.push('business-data')
  }
  if (fileMeta.kind === 'style' || fileMeta.path.endsWith('.css')) {
    score += tagSet.has('style') || tagSet.has('mobile-menu') || tagSet.has('navbar') || tagSet.has('cta') ? 24 : 6
    reasons.push('styles')
  }

  const nameHits = ['nav', 'hero', 'cta', 'header', 'menu', 'home', 'app', 'button']
  for (const word of nameHits) {
    if (lower.includes(word) && (base.includes(word) || fileMeta.path.toLowerCase().includes(word))) {
      score += 18
      reasons.push(`filename:${word}`)
    }
  }

  if (tagSet.has('navbar') && /function Nav\b|className=["']nav["']|\.nav\b|<header/.test(blob)) {
    score += 30
    reasons.push('navbar-symbol')
  }
  if (tagSet.has('mobile-menu') && /nav-toggle|hamburger|summary>\s*Menu/.test(blob)) {
    score += 34
    reasons.push('mobile-menu')
  }
  if (tagSet.has('cta') && /primaryCta|btn[.\s]primary|\.btn\.primary|className=["']section cta["']/.test(blob)) {
    score += 34
    reasons.push('cta')
  }
  if (tagSet.has('homepage') && /export default function App|id=["']top["']/.test(content)) {
    score += 20
    reasons.push('app-root')
  }
  if (tagSet.has('hero') && /function Hero\b|<h1/.test(content)) {
    score += 22
    reasons.push('hero')
  }

  for (const token of tokens(task)) {
    if (token.length < 4) continue
    if (base.includes(token) || content.toLowerCase().includes(token)) score += 4
  }

  const recent = (brain?.recentChanges || []).some((c) => String(c.path || c.file || c).replace(/\\/g, '/') === fileMeta.path)
  if (recent) {
    score += 10
    reasons.push('recent')
  }

  const importedByHot = Object.values(index.fileMap || {}).some((other) => {
    if (other.path === fileMeta.path) return false
    const hot = other.path === index.homepage || other.path === 'src/App.jsx'
    return hot && other.imports?.some((imp) => imp.includes(path.basename(fileMeta.path, path.extname(fileMeta.path))))
  })
  if (importedByHot) {
    score += 12
    reasons.push('imported-by-homepage')
  }

  return { score, reasons }
}

async function readSafe(workspaceDir, rel) {
  try {
    return await fs.readFile(path.join(workspaceDir, rel), 'utf8')
  } catch {
    return ''
  }
}

function snippetAround(text, re) {
  const match = text.match(re)
  if (!match) return null
  const idx = match.index ?? text.indexOf(match[0])
  const lines = text.split('\n')
  const line = text.slice(0, idx).split('\n').length
  const start = Math.max(0, line - 3)
  const slice = lines.slice(start, start + MAX_SNIPPET).join('\n')
  return { line, text: slice.slice(0, 600) }
}

function pickComponents(index, tags) {
  const all = index.components || []
  const wanted = []
  if (tags.includes('homepage') || tags.includes('generic')) wanted.push(...all.filter((c) => c.name === 'App'))
  if (tags.includes('navbar') || tags.includes('mobile-menu')) wanted.push(...all.filter((c) => c.name === 'Nav'))
  if (tags.includes('cta') || tags.includes('hero')) wanted.push(...all.filter((c) => c.name === 'Hero'))
  return [...new Map(wanted.map((c) => [`${c.name}:${c.path}`, c])).values()]
}

export async function locate(workspaceDir, question, { index, brain } = {}) {
  const idx = index || (await indexProject(workspaceDir))
  const { kind, tags } = classifyTask(question)
  const files = []
  for (const meta of Object.values(idx.fileMap || {})) {
    const content = await readSafe(workspaceDir, meta.path)
    const { score, reasons } = scoreFile(meta, { task: question, kind, tags, index: idx, brain, content })
    files.push({ path: meta.path, kind: meta.kind, score, reasons, components: meta.components || [] })
  }
  files.sort((a, b) => b.score - a.score)
  const ranked = files.filter((f) => f.score >= MIN_SCORE).slice(0, MAX_FILES)
  const top = ranked.length ? ranked : files.slice(0, 3)

  const evidence = []
  const pattern = PATTERNS[kind] || (tags.includes('homepage') ? PATTERNS.homepage : null)
  for (const row of top.slice(0, 4)) {
    const content = await readSafe(workspaceDir, row.path)
    const hit = pattern ? snippetAround(content, pattern) : null
    if (hit) evidence.push({ path: row.path, line: hit.line, snippet: hit.text })
  }

  return {
    question,
    kind,
    tags,
    files: top.map((f) => f.path),
    ranked: top,
    components: pickComponents(idx, tags.length ? tags : [kind]),
    evidence,
    homepage: idx.homepage,
  }
}

export async function buildContext({ workspaceDir, task, brain, refresh = false } = {}) {
  const refreshed = refresh ? await refreshProjectBrain(workspaceDir) : null
  const idx = refreshed?.index || (await indexProject(workspaceDir))
  const memory = brain || refreshed?.brain || (await readProjectBrain(workspaceDir))
  const located = await locate(workspaceDir, task, { index: idx, brain: memory })
  const relatedStyles = (idx.styles || [])
    .map((s) => s.path)
    .filter((p) => p.endsWith('.css') && (located.files.includes(p) || p === 'src/index.css'))
    .filter((p, i, all) => all.indexOf(p) === i)
    .slice(0, 3)
  const relatedImports = []
  for (const rel of located.files.slice(0, 4)) {
    const meta = idx.fileMap?.[rel]
    for (const imp of meta?.imports || []) {
      if (imp.startsWith('.') || imp === 'react') relatedImports.push({ from: rel, import: imp })
    }
  }
  const ctaFiles = located.ranked.filter((f) => f.reasons.includes('cta') || f.path.includes('business.json')).map((f) => f.path)
  return {
    task,
    kind: located.kind,
    tags: located.tags,
    framework: memory.framework,
    homepage: located.homepage,
    files: located.files.slice(0, MAX_FILES),
    components: located.components,
    cta: located.tags.includes('cta')
      ? {
          files: ctaFiles.length ? ctaFiles : located.files.filter((p) => p === 'src/App.jsx' || p.endsWith('business.json')),
          components: located.components.filter((c) => c.name === 'Hero'),
        }
      : null,
    styles: relatedStyles,
    imports: relatedImports.slice(0, 12),
    ranked: located.ranked,
    evidence: located.evidence,
    designDNA: memory.designDNA,
    recentChanges: (memory.recentChanges || []).slice(-8),
  }
}
