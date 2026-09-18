import fs from 'node:fs/promises'
import path from 'node:path'
import { authorizeTool } from './toolRegistry.js'
import { applyWorkspaceFiles, isAllowedGeneratedPath, listWorkspaceFiles } from '../workspace/projectFiles.js'
import { assertInsideWorkspace } from '../security/pathPolicy.js'
import { runWorkspaceCommand } from '../workspace/runCommand.js'
import { inspectWorkspaceBuild } from '../validation/isolatedBuild.js'
import { createCheckpoint, restoreCheckpoint } from './checkpoints.js'
import { startIsolatedPreviewProcess, stopIsolatedPreview } from '../preview/previewManager.js'
import { executeBrowserTool, closeBrowserSession } from './browserSession.js'
import { DESIGN_RESOURCE_TOOL_NAMES, runDesignResourceTool } from '../design-resources/tools.js'
import { sanitizeIndexHtmlResources } from '../design-resources/apply.js'

function ok(tool, extra = {}) {
  return { success: true, tool, error: null, ...extra }
}

function fail(tool, error, extra = {}) {
  return { success: false, tool, error: String(error || 'TOOL_FAILED'), ...extra }
}

export async function executeTool({
  tool,
  userId,
  projectId,
  workspaceDir,
  relativePath,
  contents,
  query,
  command,
  prompt,
  signal,
  url,
  selector,
  text,
  x,
  y,
  category,
  style,
  framework,
  requirements,
  id,
  name,
  resourceId,
  existing,
  spec,
  package: packageName,
  allowedFiles = null,
} = {}) {
  const auth = authorizeTool({ tool, userId, projectId, workspaceDir, relativePath, command })
  if (!auth.ok) return fail(tool, auth.code || auth.message, { message: auth.message })

  const allowSet =
    Array.isArray(allowedFiles) && allowedFiles.length
      ? new Set(allowedFiles.map((p) => String(p).replace(/^\.\//, '')))
      : null
  const pathAllowed = (rel) => {
    if (!allowSet) return true
    const normalized = String(rel || '').replace(/^\.\//, '')
    return allowSet.has(normalized)
  }

  try {
    if (DESIGN_RESOURCE_TOOL_NAMES.includes(tool)) {
      const payload = await runDesignResourceTool(tool, {
        category,
        query,
        style,
        framework: framework || 'react-vite',
        requirements,
        id,
        name,
        url,
        resourceId,
        existing,
        spec,
        package: packageName,
        prompt: prompt || query,
      })
      if (payload?.ok === false) return fail(tool, payload.error || 'RESOURCE_FAILED', payload)
      return ok(tool, payload)
    }
    if (tool === 'list_files') {
      const files = await listWorkspaceFiles(workspaceDir)
      return ok(tool, { files: files.filter((f) => !f.startsWith('node_modules') && !f.startsWith('dist')) })
    }
    if (tool === 'read_file') {
      const inside = assertInsideWorkspace(workspaceDir, relativePath)
      if (!inside.ok) return fail(tool, inside.code, { message: inside.message })
      const text = await fs.readFile(inside.path, 'utf8')
      return ok(tool, { path: inside.relative, output: text })
    }
    if (tool === 'search_code') {
      const files = await listWorkspaceFiles(workspaceDir)
      const needle = String(query || '').trim()
      if (!needle) return fail(tool, 'QUERY_REQUIRED')
      const hits = []
      const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      for (const rel of files) {
        if (!/\.(jsx?|css|json|html)$/.test(rel)) continue
        const inside = assertInsideWorkspace(workspaceDir, rel)
        if (!inside.ok) continue
        const text = await fs.readFile(inside.path, 'utf8')
        if (!re.test(text)) continue
        const line = text.split('\n').findIndex((row) => re.test(row)) + 1
        hits.push({ path: rel, line })
        if (hits.length >= 40) break
      }
      return ok(tool, { hits })
    }
    if (tool === 'write_file' || tool === 'patch_file') {
      if (!isAllowedGeneratedPath(relativePath)) return fail(tool, 'PATH_REJECTED')
      if (!pathAllowed(relativePath)) {
        return fail(tool, 'OUT_OF_SCOPE', {
          message: `Scoped edit may only write: ${[...allowSet].join(', ')}`,
        })
      }
      let body = String(contents ?? '')
      let rejected = []
      if (/(^|\/)index\.html$/i.test(String(relativePath || ''))) {
        const sanitized = sanitizeIndexHtmlResources(body)
        body = sanitized.html
        rejected = sanitized.rejected
      }
      const result = await applyWorkspaceFiles({
        workspaceDir,
        files: [{ path: relativePath, contents: body }],
      })
      if (!result.written.length) return fail(tool, result.rejected[0]?.reason || 'WRITE_FAILED', result)
      return ok(tool, { written: result.written, rejected })
    }
    if (tool === 'delete_file') {
      if (!isAllowedGeneratedPath(relativePath)) return fail(tool, 'PATH_REJECTED')
      if (!pathAllowed(relativePath)) {
        return fail(tool, 'OUT_OF_SCOPE', {
          message: `Scoped edit may only change: ${[...allowSet].join(', ')}`,
        })
      }
      const inside = assertInsideWorkspace(workspaceDir, relativePath)
      if (!inside.ok) return fail(tool, inside.code)
      await fs.unlink(inside.path).catch(() => {})
      return ok(tool, { deleted: inside.relative })
    }
    if (tool === 'run_build') {
      const build = await inspectWorkspaceBuild({ workspaceDir, runBuild: true })
      return build.ok ? ok(tool, { output: build.message, build }) : fail(tool, build.code || 'BUILD_FAILED', { output: build.message, build })
    }
    if (tool === 'run_command' || tool === 'run_lint' || tool === 'run_tests') {
      const mapped = tool === 'run_lint' ? 'npm run lint' : tool === 'run_tests' ? 'npm test' : command
      const run = await runWorkspaceCommand({ cwd: workspaceDir, command: mapped, signal })
      return run.ok ? ok(tool, { output: run.stdout || run.message }) : fail(tool, run.code || 'COMMAND_FAILED', { output: run.stderr || run.message })
    }
    if (tool.startsWith('browser_') || tool === 'inspect_console' || tool === 'inspect_network') {
      const result = await executeBrowserTool({
        tool,
        projectId,
        workspaceDir,
        url: url || query,
        selector: selector || (tool === 'browser_click' || tool === 'browser_type' ? relativePath : undefined),
        text: text ?? (tool === 'browser_type' ? contents : undefined),
        x,
        y,
      })
      return result.success ? ok(tool, result) : fail(tool, result.error, result)
    }
    if (tool === 'git_diff') {
      return ok(tool, { output: 'Workspace files are not a git repo; use checkpoint metadata.', skipped: true })
    }
    if (tool === 'create_checkpoint') {
      const meta = await createCheckpoint(workspaceDir, { prompt })
      return ok(tool, { output: meta.id, checkpoint: meta })
    }
    if (tool === 'rollback') {
      const restored = await restoreCheckpoint(workspaceDir)
      return restored.ok ? ok(tool, restored) : fail(tool, restored.code, restored)
    }
    if (tool === 'start_preview') {
      const preview = await startIsolatedPreviewProcess({ projectId, workspaceDir })
      return preview.ok ? ok(tool, { output: preview.url, preview }) : fail(tool, preview.code, preview)
    }
    if (tool === 'stop_preview') {
      await closeBrowserSession(projectId)
      const stopped = await stopIsolatedPreview(projectId)
      return ok(tool, stopped)
    }
    return fail(tool, 'TOOL_NOT_IMPLEMENTED', { message: `${tool} is registered but not executable in this runtime.` })
  } catch (err) {
    return fail(tool, err.code || 'TOOL_CRASH', { message: String(err.message || err) })
  }
}

export { path }
