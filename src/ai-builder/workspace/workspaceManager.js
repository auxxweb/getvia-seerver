import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { isWorkspaceRootSafe, assertInsideWorkspace } from '../security/pathPolicy.js'
import { ensureJsxRuntimeImports } from './fixJsxRuntime.js'

function sanitizeId(value, label) {
  const id = String(value || '').trim()
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) {
    throw Object.assign(new Error(`Invalid ${label}.`), { code: 'PATH_REJECTED' })
  }
  return id
}

export function getWorkspaceRoot({ repoRoot } = {}) {
  const configured = process.env.AI_WORKSPACE_ROOT
  const root = configured
    ? path.resolve(configured)
    : path.resolve(os.tmpdir(), 'getvia-ai-workspaces')
  const check = isWorkspaceRootSafe(root, repoRoot)
  if (!check.ok) {
    const err = new Error(check.message)
    err.code = check.code
    throw err
  }
  return check.path
}

/**
 * Workspace paths are derived from auth + project ids. Never from the browser.
 */
export function workspacePathFor({ userId, projectId, repoRoot } = {}) {
  const root = getWorkspaceRoot({ repoRoot })
  const user = sanitizeId(userId, 'user id')
  const project = sanitizeId(projectId, 'project id')
  return {
    root,
    dir: path.join(root, `user_${user}`, `project_${project}`),
    userId: user,
    projectId: project,
  }
}

export async function ensureWorkspace(ids, { repoRoot } = {}) {
  const loc = workspacePathFor({ ...ids, repoRoot })
  await fs.mkdir(loc.dir, { recursive: true, mode: 0o700 })
  return loc
}

export async function writeWorkspaceFile({ userId, projectId, relativePath, contents, repoRoot }) {
  const loc = await ensureWorkspace({ userId, projectId }, { repoRoot })
  const inside = assertInsideWorkspace(loc.dir, relativePath)
  if (!inside.ok) return inside
  await fs.mkdir(path.dirname(inside.path), { recursive: true, mode: 0o700 })
  const rel = String(relativePath || '').replace(/\\/g, '/')
  const body = /\.(jsx|js)$/.test(rel) ? ensureJsxRuntimeImports(contents) : contents
  await fs.writeFile(inside.path, body, { encoding: 'utf8', flag: 'w' })
  return { ok: true, path: inside.relative }
}

export async function readWorkspaceFile({ userId, projectId, relativePath, repoRoot }) {
  const loc = workspacePathFor({ userId, projectId, repoRoot })
  const inside = assertInsideWorkspace(loc.dir, relativePath)
  if (!inside.ok) return inside
  const text = await fs.readFile(inside.path, 'utf8')
  return { ok: true, contents: text, path: inside.relative }
}

/**
 * Permanently remove one tenant project under AI_WORKSPACE_ROOT.
 * Path is derived from auth ids only — never from a client-supplied folder.
 */
export async function deleteWorkspaceProject({ userId, projectId, repoRoot } = {}) {
  const loc = workspacePathFor({ userId, projectId, repoRoot })
  const rel = path.relative(loc.root, loc.dir)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    const err = new Error('Workspace path is outside the project workspace.')
    err.code = 'PATH_REJECTED'
    throw err
  }
  await fs.rm(loc.dir, { recursive: true, force: true })
  const userDir = path.join(loc.root, `user_${loc.userId}`)
  try {
    const leftover = await fs.readdir(userDir)
    if (!leftover.length) await fs.rmdir(userDir)
  } catch {
    /* user folder may already be gone */
  }
  return { ok: true, dir: loc.dir }
}
