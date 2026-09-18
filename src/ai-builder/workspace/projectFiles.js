import path from 'node:path'
import fs from 'node:fs/promises'
import { assertInsideWorkspace } from '../security/pathPolicy.js'
import { ensureJsxRuntimeImports } from './fixJsxRuntime.js'
import { looksLikeTruncatedSource } from './truncatedSource.js'

const SRC_FILE =
  /^(src\/[A-Za-z0-9._/-]+\.(js|jsx|css|json)|index\.html|vite\.config\.js|package\.json|AGENTS\.md|website\.config\.json|generation\/[A-Za-z0-9._/-]+\.(md|json)|getvia-spec\.json)$/

export function isAllowedGeneratedPath(relativePath) {
  const rel = String(relativePath || '').replace(/\\/g, '/')
  if (!rel || rel.startsWith('/') || rel.includes('..')) return false
  return SRC_FILE.test(rel)
}

export async function applyWorkspaceFiles({ workspaceDir, files = [] }) {
  const written = []
  const rejected = []
  for (const row of files) {
    const rel = String(row?.path || '').replace(/\\/g, '/')
    if (!isAllowedGeneratedPath(rel)) {
      rejected.push({ path: rel, reason: 'PATH_REJECTED' })
      continue
    }
    const inside = assertInsideWorkspace(workspaceDir, rel)
    if (!inside.ok) {
      rejected.push({ path: rel, reason: inside.code })
      continue
    }
    const contents = String(row.contents ?? '')
    if (contents.length > 200_000) {
      rejected.push({ path: rel, reason: 'FILE_TOO_LARGE' })
      continue
    }
    if (looksLikeTruncatedSource(contents)) {
      rejected.push({ path: rel, reason: 'TRUNCATED_SOURCE' })
      continue
    }
    const next = /\.(jsx|js)$/.test(rel) ? ensureJsxRuntimeImports(contents) : contents
    await fs.mkdir(path.dirname(inside.path), { recursive: true })
    await fs.writeFile(inside.path, next, 'utf8')
    written.push(inside.relative)
  }
  return { ok: written.length > 0 || rejected.length === 0, written, rejected }
}

const SKIP_DIR = new Set(['node_modules', 'dist', '.git', '.vite', 'coverage', '.cache', '.next'])
const MAX_LIST_FILES = 400
const MAX_LIST_DEPTH = 8

export async function listWorkspaceFiles(workspaceDir, dir = workspaceDir, acc = [], depth = 0) {
  if (acc.length >= MAX_LIST_FILES || depth > MAX_LIST_DEPTH) return acc
  let entries = []
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const entry of entries) {
    if (acc.length >= MAX_LIST_FILES) break
    if (SKIP_DIR.has(entry.name)) continue
    if (typeof entry.isSymbolicLink === 'function' && entry.isSymbolicLink()) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await listWorkspaceFiles(workspaceDir, full, acc, depth + 1)
    else acc.push(path.relative(workspaceDir, full).replace(/\\/g, '/'))
  }
  return acc
}
