import fs from 'node:fs/promises'
import { assertInsideWorkspace } from '../../src/ai-builder/security/pathPolicy.js'
import { applyWorkspaceFiles, isAllowedGeneratedPath, listWorkspaceFiles } from '../../src/ai-builder/workspace/projectFiles.js'
import { toolFail, toolOk } from './result.js'
import { sanitizeIndexHtmlResources } from '../../src/ai-builder/design-resources/apply.js'

const SECRET_NAME = /(?:^|\/)(\.env(?:\..+)?|id_rsa|id_ed25519|credentials\.json|serviceAccount.*\.json)$/i

function filePath(input) {
  return String(input.path || input.relativePath || '').replace(/\\/g, '/')
}

function rejectSecret(rel) {
  if (SECRET_NAME.test(rel) || rel.includes('.git/')) {
    return toolFail('read_file', {
      errorType: 'PERMISSION_DENIED',
      message: 'Secret or VCS files cannot be sent to the agent.',
      recoverable: false,
    })
  }
  return null
}

export function registerFileTools(registry) {
  registry.register({
    name: 'list_files',
    description: 'List source files in the isolated workspace.',
    permission: 'read',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    async executor({ ctx }) {
      const files = await listWorkspaceFiles(ctx.workspaceDir)
      return toolOk('list_files', {
        files: files.filter((f) => !f.startsWith('node_modules') && !f.startsWith('dist') && !SECRET_NAME.test(f)),
      })
    },
  })

  registry.register({
    name: 'read_file',
    description: 'Read a workspace file.',
    permission: 'read',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: { path: { type: 'string' } },
    },
    async executor({ input, ctx }) {
      const rel = filePath(input)
      const secret = rejectSecret(rel)
      if (secret) return { ...secret, tool: 'read_file' }
      const inside = assertInsideWorkspace(ctx.workspaceDir, rel)
      if (!inside.ok) {
        return toolFail('read_file', { errorType: 'PATH_REJECTED', message: inside.message, recoverable: false })
      }
      try {
        const text = await fs.readFile(inside.path, 'utf8')
        return toolOk('read_file', { path: inside.relative.replace(/\\/g, '/'), contents: text.slice(0, 80_000) })
      } catch {
        return toolFail('read_file', { errorType: 'FILE_NOT_FOUND', message: `File not found: ${rel}`, recoverable: true })
      }
    },
  })

  registry.register({
    name: 'search_code',
    description: 'Search workspace source files for a literal string.',
    permission: 'read',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: { query: { type: 'string' } },
    },
    async executor({ input, ctx }) {
      const needle = String(input.query || '').trim()
      const files = await listWorkspaceFiles(ctx.workspaceDir)
      const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      const hits = []
      for (const rel of files) {
        if (!/\.(jsx?|css|json|html)$/.test(rel) || SECRET_NAME.test(rel)) continue
        const inside = assertInsideWorkspace(ctx.workspaceDir, rel)
        if (!inside.ok) continue
        let text = ''
        try {
          text = await fs.readFile(inside.path, 'utf8')
        } catch {
          continue
        }
        if (!re.test(text)) continue
        hits.push({ path: rel, line: text.split('\n').findIndex((row) => re.test(row)) + 1 })
        if (hits.length >= 40) break
      }
      return toolOk('search_code', { hits, query: needle })
    },
  })

  registry.register({
    name: 'write_file',
    description: 'Write an allowlisted generated file inside the workspace.',
    permission: 'write',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'contents'],
      properties: { path: { type: 'string' }, contents: { type: 'string' } },
    },
    async executor({ input, ctx }) {
      const rel = filePath(input)
      if (!isAllowedGeneratedPath(rel)) {
        return toolFail('write_file', { errorType: 'PATH_REJECTED', message: 'That path is not writable.', recoverable: false })
      }
      let body = String(input.contents ?? '')
      if (/(^|\/)index\.html$/i.test(rel)) body = sanitizeIndexHtmlResources(body).html
      const result = await applyWorkspaceFiles({
        workspaceDir: ctx.workspaceDir,
        files: [{ path: rel, contents: body }],
      })
      if (!result.written.length) {
        return toolFail('write_file', {
          errorType: 'PATH_REJECTED',
          message: result.rejected[0]?.reason || 'Write failed.',
          details: result.rejected,
          recoverable: false,
        })
      }
      return toolOk('write_file', { written: result.written })
    },
  })

  registry.register({
    name: 'patch_file',
    description: 'Replace text in an allowlisted file, or overwrite contents.',
    permission: 'write',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: { type: 'string' },
        contents: { type: 'string' },
        oldText: { type: 'string' },
        newText: { type: 'string' },
      },
    },
    async executor({ input, ctx }) {
      const rel = filePath(input)
      if (!isAllowedGeneratedPath(rel)) {
        return toolFail('patch_file', { errorType: 'PATH_REJECTED', message: 'That path is not writable.', recoverable: false })
      }
      let next = input.contents
      if (next == null) {
        const inside = assertInsideWorkspace(ctx.workspaceDir, rel)
        if (!inside.ok) {
          return toolFail('patch_file', { errorType: 'PATH_REJECTED', message: inside.message, recoverable: false })
        }
        let current = ''
        try {
          current = await fs.readFile(inside.path, 'utf8')
        } catch {
          return toolFail('patch_file', { errorType: 'FILE_NOT_FOUND', message: `File not found: ${rel}`, recoverable: true })
        }
        if (input.oldText == null || input.newText == null) {
          return toolFail('patch_file', {
            errorType: 'VALIDATION_ERROR',
            message: 'patch_file requires contents or oldText+newText.',
            recoverable: true,
          })
        }
        if (!current.includes(input.oldText)) {
          return toolFail('patch_file', {
            errorType: 'VALIDATION_ERROR',
            message: 'oldText was not found in the file.',
            recoverable: true,
          })
        }
        next = current.replace(input.oldText, input.newText)
      }
      if (/(^|\/)index\.html$/i.test(rel)) next = sanitizeIndexHtmlResources(String(next)).html
      const result = await applyWorkspaceFiles({
        workspaceDir: ctx.workspaceDir,
        files: [{ path: rel, contents: String(next) }],
      })
      if (!result.written.length) {
        return toolFail('patch_file', {
          errorType: 'PATH_REJECTED',
          message: result.rejected[0]?.reason || 'Patch failed.',
          recoverable: false,
        })
      }
      return toolOk('patch_file', { written: result.written })
    },
  })

  registry.register({
    name: 'delete_file',
    description: 'Delete an allowlisted generated file.',
    permission: 'write',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: { path: { type: 'string' } },
    },
    async executor({ input, ctx }) {
      const rel = filePath(input)
      if (!isAllowedGeneratedPath(rel)) {
        return toolFail('delete_file', { errorType: 'PATH_REJECTED', message: 'That path is not deletable.', recoverable: false })
      }
      const inside = assertInsideWorkspace(ctx.workspaceDir, rel)
      if (!inside.ok) {
        return toolFail('delete_file', { errorType: 'PATH_REJECTED', message: inside.message, recoverable: false })
      }
      await fs.unlink(inside.path).catch(() => {})
      return toolOk('delete_file', { deleted: inside.relative.replace(/\\/g, '/') })
    },
  })
}
