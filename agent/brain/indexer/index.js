import fs from 'node:fs/promises'
import path from 'node:path'
import { listWorkspaceFiles } from '../../../src/ai-builder/workspace/projectFiles.js'

const SKIP_PREFIX = /^(node_modules|dist|\.getvia|\.git|\.vite)(\/|$)/
const IMPORT_FROM = /(?:import|export)\s+(?:[^'"\n]+from\s+)?['"]([^'"]+)['"]/g
const REQUIRE_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/g
const FN_COMPONENT = /(?:export\s+)?(?:default\s+)?function\s+([A-Z][A-Za-z0-9]*)/g
const CONST_COMPONENT = /(?:export\s+)?(?:default\s+)?const\s+([A-Z][A-Za-z0-9]*)\s*=/g
const EXPORT_NAME = /export\s+(?:default\s+)?(?:function|const|class)\s+([A-Za-z0-9_]+)/g
const HOOK_RE = /\buse[A-Z][A-Za-z0-9]*\s*\(/g
const CLASS_RE = /class(?:Name)?=["'`]([^"'`]+)["'`]/g
const CSS_CLASS_RE = /\.([a-zA-Z][a-zA-Z0-9_-]*)/g
const HREF_RE = /\b(?:href|to|path)=["'`]([^"'`]+)["'`]/g
const FETCH_RE = /\b(?:fetch|axios(?:\.\w+)?)\s*\(\s*['"`]([^'"`]+)['"`]/g
const ENV_RE = /\b(?:import\.meta\.env|process\.env)\.([A-Z0-9_]+)/g
const TAILWIND_RE =
  /\b(?:sm:|md:|lg:|xl:|2xl:)?(?:flex|grid|hidden|block|inline-flex|items-\S+|justify-\S+|gap-\S+|p[xytblr]?-\S+|m[xytblr]?-\S+|text-\S+|bg-\S+|rounded\S*|w-\S+|h-\S+|min-\S+|max-\S+|border\S*|shadow\S*|font-\S+|overflow-\S+|relative|absolute|sticky|fixed|z-\S+)\b/g
const ASSET_RE = /\.(?:png|jpe?g|gif|svg|webp|avif|ico|woff2?)$/i

function lineOf(text, index) {
  if (index < 0) return 1
  return text.slice(0, index).split('\n').length
}

function unique(list) {
  return [...new Set((list || []).filter(Boolean))]
}

function kindFor(rel) {
  if (rel === 'package.json' || rel.endsWith('.config.js') || rel === 'index.html' || rel === 'vite.config.js') return 'config'
  if (rel.endsWith('.css')) return 'style'
  if (rel.includes('/data/') && rel.endsWith('.json')) return 'data'
  if (rel.endsWith('.jsx') || rel.endsWith('.tsx')) return 'component'
  if (ASSET_RE.test(rel)) return 'asset'
  return 'file'
}

function collect(re, text, pick = (m) => m[1]) {
  const out = []
  re.lastIndex = 0
  let match
  while ((match = re.exec(text))) out.push(pick(match))
  return unique(out)
}

function collectComponents(rel, text) {
  const rows = []
  for (const re of [FN_COMPONENT, CONST_COMPONENT]) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(text))) {
      rows.push({
        name: match[1],
        path: rel,
        line: lineOf(text, match.index),
      })
    }
  }
  return rows
}

export async function indexProject(workspaceDir) {
  const names = (await listWorkspaceFiles(workspaceDir)).filter((n) => !SKIP_PREFIX.test(n))
  const directories = unique(names.map((n) => path.posix.dirname(n.replace(/\\/g, '/'))).filter((d) => d && d !== '.'))
  const files = []
  const components = []
  const routes = []
  const styles = []
  const tailwind = []
  const assets = []
  const apiCalls = []
  const envRefs = []
  const config = []

  for (const rel of names) {
    const posix = rel.replace(/\\/g, '/')
    const kind = kindFor(posix)
    if (ASSET_RE.test(posix)) assets.push(posix)
    if (kind === 'config') config.push(posix)
    if (!/\.(jsx?|tsx?|css|json|html)$/.test(posix)) continue
    let text = ''
    try {
      text = await fs.readFile(path.join(workspaceDir, posix), 'utf8')
    } catch {
      continue
    }
    const imports = [...collect(IMPORT_FROM, text), ...collect(REQUIRE_RE, text)]
    const exports = collect(EXPORT_NAME, text)
    const fileComponents = collectComponents(posix, text)
    components.push(...fileComponents)
    const classes = posix.endsWith('.css') ? collect(CSS_CLASS_RE, text) : collect(CLASS_RE, text, (m) => m[1])
    const tw = unique((text.match(TAILWIND_RE) || []).slice(0, 80))
    if (tw.length) tailwind.push({ path: posix, classes: tw })
    if (posix.endsWith('.css') || classes.length) styles.push({ path: posix, classes: classes.slice(0, 80) })
    for (const href of collect(HREF_RE, text)) {
      routes.push({ path: href, file: posix, via: href.startsWith('/') ? 'route' : href.startsWith('#') ? 'anchor' : 'href' })
    }
    for (const url of collect(FETCH_RE, text)) {
      apiCalls.push({ path: posix, url })
    }
    for (const name of collect(ENV_RE, text)) {
      envRefs.push({ path: posix, name })
    }
    if (posix.endsWith('.json')) {
      for (const match of text.matchAll(/https?:\/\/[^\s"']+/g)) {
        if (/\.(png|jpe?g|gif|svg|webp)/i.test(match[0])) assets.push(match[0])
      }
    }
    files.push({
      path: posix,
      kind,
      bytes: text.length,
      imports,
      exports,
      components: fileComponents.map((c) => c.name),
      classes: classes.slice(0, 40),
      hooks: unique(text.match(HOOK_RE) || []).slice(0, 20),
    })
  }

  let dependencies = []
  let packageManager = 'npm'
  let framework = 'unknown'
  let bundler = 'unknown'
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(workspaceDir, 'package.json'), 'utf8'))
    dependencies = unique([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})])
    if (dependencies.includes('react')) framework = 'React'
    if (dependencies.includes('vite') || names.includes('vite.config.js')) bundler = 'Vite'
  } catch {
    /* no package.json */
  }
  try {
    await fs.access(path.join(workspaceDir, 'package-lock.json'))
    packageManager = 'npm'
  } catch {
    try {
      await fs.access(path.join(workspaceDir, 'pnpm-lock.yaml'))
      packageManager = 'pnpm'
    } catch {
      try {
        await fs.access(path.join(workspaceDir, 'yarn.lock'))
        packageManager = 'yarn'
      } catch {
        /* default npm */
      }
    }
  }

  const homepage =
    names.includes('src/App.jsx')
      ? 'src/App.jsx'
      : names.includes('src/main.jsx')
        ? 'src/main.jsx'
        : components.find((c) => /app|home|page/i.test(c.name))?.path || null

  return {
    files: names,
    fileMap: Object.fromEntries(files.map((f) => [f.path, f])),
    directories,
    components,
    routes: unique(routes.map((r) => JSON.stringify(r))).map((s) => JSON.parse(s)),
    styles,
    tailwind,
    assets: unique(assets).slice(0, 80),
    apiCalls,
    envRefs: unique(envRefs.map((e) => JSON.stringify(e))).map((s) => JSON.parse(s)),
    dependencies,
    config,
    framework,
    bundler,
    packageManager,
    homepage,
    entry: names.includes('src/main.jsx') ? 'src/main.jsx' : homepage,
    indexedAt: new Date().toISOString(),
  }
}

export { unique }
