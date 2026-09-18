import fs from 'node:fs/promises'
import path from 'node:path'
import { assertInsideWorkspace } from '../security/pathPolicy.js'
import { assertAllowedCommand } from '../security/commandPolicy.js'
import { runWorkspaceCommand } from '../workspace/runCommand.js'
import { shouldRunWorkspaceNpm } from '../runtimeFlags.js'

const SECRET_FILE_NAMES = new Set(['.env', '.env.local', '.env.production', '.env.development', 'id_rsa', 'id_ed25519'])

export async function inspectWorkspaceBuild({ workspaceDir, runBuild = false, signal } = {}) {
  if (!workspaceDir) return { ok: false, code: 'WORKSPACE_REQUIRED', message: 'Workspace is required.' }
  const pkgPath = path.join(workspaceDir, 'package.json')
  let pkg
  try {
    pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'))
  } catch {
    return {
      ok: false,
      code: 'BUILD_NOT_READY',
      message: 'No package.json in the isolated workspace. GetVia live sites do not need a per-tenant build.',
    }
  }
  const issues = []
  for (const name of SECRET_FILE_NAMES) {
    const check = assertInsideWorkspace(workspaceDir, name)
    if (!check.ok) continue
    try {
      await fs.access(check.path)
      issues.push({ type: 'SECRET_FILE', file: name })
    } catch {
      /* absent is good */
    }
  }
  if (issues.length) {
    return { ok: false, code: 'SECURITY_VALIDATION_FAILED', issues, message: 'Workspace contains secret files.' }
  }
  if (!runBuild) {
    return { ok: true, skipped: true, packageName: pkg.name, message: 'Structural checks passed. Host npm build was not started.' }
  }
  const allowed = assertAllowedCommand('npm run build')
  if (!allowed.ok) return allowed
  if (!shouldRunWorkspaceNpm()) {
    return {
      ok: false,
      code: 'BUILD_SANDBOX_REQUIRED',
      message: 'npm run build for generated workspaces is off unless AI_ISOLATED_RUNTIME=1 (and AI_SKIP_WORKSPACE_NPM is unset).',
    }
  }
  const result = await runWorkspaceCommand({
    cwd: workspaceDir,
    command: 'npm run build',
    timeoutMs: 4 * 60 * 1000,
    signal,
  })
  return { ...result, packageName: pkg.name }
}
