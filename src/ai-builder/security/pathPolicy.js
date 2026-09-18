import path from 'node:path'
import { isAbsolute } from 'node:path'

const NUL = /\0/
const TRAVERSAL = /(^|[\\/])\.\.([\\/]|$)/
const WINDOWS_DRIVE = /^[a-zA-Z]:[\\/]/
const UNC = /^\\\\/
const ENCODED_DOTS = /%2e%2e|%252e|%c0%ae/i

/**
 * Resolve a child path inside workspaceRoot. Rejects traversal, absolute
 * client paths, null bytes, and symlink-escape candidates that leave the root.
 */
export function assertInsideWorkspace(workspaceRoot, candidate) {
  if (workspaceRoot == null || candidate == null) {
    return { ok: false, code: 'PATH_REJECTED', message: 'Path is required.' }
  }
  const root = path.resolve(String(workspaceRoot))
  const raw = String(candidate)
  if (NUL.test(raw) || NUL.test(root)) {
    return { ok: false, code: 'PATH_REJECTED', message: 'Null byte in path.' }
  }
  if (ENCODED_DOTS.test(raw)) {
    return { ok: false, code: 'PATH_REJECTED', message: 'Encoded path traversal is not allowed.' }
  }
  if (TRAVERSAL.test(raw) || raw.includes('..')) {
    return { ok: false, code: 'PATH_REJECTED', message: 'Path traversal is not allowed.' }
  }
  if (isAbsolute(raw) || WINDOWS_DRIVE.test(raw) || UNC.test(raw) || raw.startsWith('/')) {
    return { ok: false, code: 'PATH_REJECTED', message: 'Absolute paths from the client are not allowed.' }
  }
  const resolved = path.resolve(root, raw)
  const rel = path.relative(root, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, code: 'PATH_REJECTED', message: 'Path is outside the project workspace.' }
  }
  return { ok: true, path: resolved, relative: rel || '.' }
}

export function isWorkspaceRootSafe(workspaceRoot, repoRoot) {
  const root = path.resolve(String(workspaceRoot || ''))
  const repo = repoRoot ? path.resolve(repoRoot) : null
  if (!root || root === path.parse(root).root || root === '/') {
    return { ok: false, code: 'WORKSPACE_UNSAFE', message: 'Workspace root cannot be the filesystem root.' }
  }
  const home = process.env.HOME || process.env.USERPROFILE
  if (home && root === path.resolve(home)) {
    return { ok: false, code: 'WORKSPACE_UNSAFE', message: 'Workspace root cannot be the user home directory.' }
  }
  if (repo && (root === repo || root.startsWith(`${repo}${path.sep}`))) {
    return { ok: false, code: 'WORKSPACE_UNSAFE', message: 'Workspace root cannot be the GetVia repository.' }
  }
  return { ok: true, path: root }
}
