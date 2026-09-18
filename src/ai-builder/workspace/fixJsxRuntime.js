import fs from 'node:fs/promises'
import path from 'node:path'
import { looksLikeTruncatedSource } from './truncatedSource.js'
import { listCheckpoints } from '../v2/checkpoints.js'

const HOOKS = [
  'useState',
  'useEffect',
  'useMemo',
  'useCallback',
  'useRef',
  'useId',
  'useLayoutEffect',
  'useReducer',
  'useContext',
  'useImperativeHandle',
  'useDeferredValue',
  'useTransition',
]

const HOOK_RE = new RegExp(`(^|[^.\\w$])(${HOOKS.join('|')})\\s*\\(`, 'g')
const REACT_NS_RE = /(^|[^.\\w$])React\s*\./
const REACT_IMPORT_RE = /^[ \t]*import\s+([\s\S]*?)\s+from\s+['"]react['"][ \t]*;?[ \t]*$/m

function parseReactImportSpec(spec) {
  const trimmed = String(spec || '').trim()
  const named = new Set()
  const ns = trimmed.match(/^\*\s+as\s+(\w+)$/)
  if (ns) return { defaultName: null, namespace: ns[1], named }

  const combo = trimmed.match(/^(\w+)\s*,\s*\{([^}]*)\}$/)
  if (combo) {
    for (const part of combo[2].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim()
      if (name) named.add(name)
    }
    return { defaultName: combo[1], namespace: null, named }
  }

  const namedOnly = trimmed.match(/^\{([^}]*)\}$/)
  if (namedOnly) {
    for (const part of namedOnly[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim()
      if (name) named.add(name)
    }
    return { defaultName: null, namespace: null, named }
  }

  if (/^\w+$/.test(trimmed)) return { defaultName: trimmed, namespace: null, named }
  return { defaultName: null, namespace: null, named }
}

function formatReactImport({ defaultName, namespace, named }) {
  const namedList = [...named].sort().join(', ')
  if (namespace) return `import * as ${namespace} from 'react'`
  if (defaultName && namedList) return `import ${defaultName}, { ${namedList} } from 'react'`
  if (defaultName) return `import ${defaultName} from 'react'`
  if (namedList) return `import { ${namedList} } from 'react'`
  return `import React from 'react'`
}

function insertImportLine(source, importLine) {
  const useClient = source.match(/^(['"]use (?:client|server)['"];?\s*\n)/)
  if (useClient) return `${useClient[1]}${importLine}\n${source.slice(useClient[0].length)}`
  return `${importLine}\n${source}`
}

function usedBareHooks(source) {
  const found = new Set()
  HOOK_RE.lastIndex = 0
  let match
  while ((match = HOOK_RE.exec(source))) found.add(match[2])
  return [...found]
}

/**
 * LLM output often uses React.useState without importing React.
 * The automatic JSX runtime does not define a React global.
 */
export function ensureJsxRuntimeImports(source) {
  const text = String(source ?? '')
  if (!text.trim()) return text

  const usesReactNs = REACT_NS_RE.test(text)
  const missingHooks = usedBareHooks(text)
  if (!usesReactNs && !missingHooks.length) return text

  const match = text.match(REACT_IMPORT_RE)
  const parsed = match
    ? parseReactImportSpec(match[1])
    : { defaultName: null, namespace: null, named: new Set() }

  const hasReactIdent = parsed.defaultName === 'React' || parsed.namespace === 'React'
  if (usesReactNs && !hasReactIdent) {
    parsed.defaultName = parsed.defaultName || 'React'
  }
  for (const hook of missingHooks) parsed.named.add(hook)

  const nextImport = formatReactImport(parsed)
  if (match) {
    const replaced = text.replace(REACT_IMPORT_RE, nextImport)
    return replaced === text && usesReactNs && !hasReactIdent ? insertImportLine(text, nextImport) : replaced
  }
  return insertImportLine(text, nextImport)
}

async function listJsxFiles(dir, acc = []) {
  let entries = []
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git' || entry.name === '.getvia') {
      continue
    }
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await listJsxFiles(full, acc)
    else if (/\.(jsx|js)$/.test(entry.name)) acc.push(full)
  }
  return acc
}

async function restoreUntruncatedFile(workspaceDir, rel) {
  const list = await listCheckpoints(workspaceDir)
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const src = path.join(workspaceDir, '.getvia', 'checkpoints', list[i].id, rel)
    try {
      const text = await fs.readFile(src, 'utf8')
      if (looksLikeTruncatedSource(text)) continue
      await fs.mkdir(path.dirname(path.join(workspaceDir, rel)), { recursive: true })
      await fs.writeFile(path.join(workspaceDir, rel), text, 'utf8')
      return true
    } catch {
      /* try older checkpoint */
    }
  }
  return false
}

export async function repairWorkspaceJsx(workspaceDir) {
  if (!workspaceDir) return { repaired: [] }
  const files = await listJsxFiles(workspaceDir)
  const repaired = []
  for (const full of files) {
    let before = ''
    try {
      before = await fs.readFile(full, 'utf8')
    } catch {
      continue
    }
    const rel = path.relative(workspaceDir, full).replace(/\\/g, '/')
    if (looksLikeTruncatedSource(before) && (await restoreUntruncatedFile(workspaceDir, rel))) {
      repaired.push(rel)
      continue
    }
    const after = ensureJsxRuntimeImports(before)
    if (after !== before) {
      await fs.writeFile(full, after, 'utf8')
      repaired.push(rel)
    }
  }
  return { repaired }
}
