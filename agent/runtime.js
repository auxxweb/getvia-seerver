import { createLLMRouter } from './llm/index.js'
import { createDefaultToolRegistry } from './tools/index.js'

/**
 * Agent runtime foundation (Phase 2).
 * LLM requests tools through callTool — never via a raw shell.
 */
export function createAgentRuntime({ llm, tools } = {}) {
  const router = llm || createLLMRouter()
  const registry = tools || createDefaultToolRegistry()
  return {
    llm: router,
    tools: registry,
    async complete(task, args) {
      return router.complete(task, args)
    },
    async callTool(name, input, ctx) {
      const emit = ctx?.emit
      const rel = input?.path || null
      if (name === 'read_file' && emit) emit('FILE_READ', `Read ${rel}`, { path: rel })
      if ((name === 'run_command' || name === 'run_build') && emit) {
        emit('COMMAND_STARTED', name === 'run_build' ? 'Running npm run build.' : `Running ${input?.command || name}.`)
      }
      const result = await registry.execute(name, input, ctx)
      if (result.success && ['write_file', 'patch_file', 'delete_file', 'git_restore'].includes(name) && emit) {
        emit('FILE_CHANGED', rel ? `Changed ${rel}` : 'Changed workspace files.', { path: rel })
      }
      if ((name === 'run_command' || name === 'run_build') && emit) {
        emit('COMMAND_FINISHED', result.success ? 'Command finished.' : result.message || 'Command failed.')
      }
      if (name === 'start_preview' && result.success && emit) {
        emit('PREVIEW_STARTED', result.data?.url ? `Preview ${result.data.url}` : 'Preview started.')
      }
      if (name === 'browser_open' && result.success && !result.skipped && emit) {
        emit('BROWSER_STARTED', 'Opened the preview in the browser.')
      }
      return result
    },
  }
}
