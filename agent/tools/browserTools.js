import { executeBrowserTool, closeBrowserSession } from '../browser/session.js'
import { toolFail, toolOk } from './result.js'

const TOOLS = [
  { name: 'browser_open', required: ['url'], properties: { url: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' } } },
  { name: 'browser_click', required: ['selector'], properties: { selector: { type: 'string' } } },
  { name: 'browser_type', required: ['selector'], properties: { selector: { type: 'string' }, text: { type: 'string' } } },
  { name: 'browser_select', required: ['selector'], properties: { selector: { type: 'string' }, value: { type: 'string' } } },
  { name: 'browser_scroll', required: [], properties: { x: { type: 'number' }, y: { type: 'number' } } },
  { name: 'browser_screenshot', required: [], properties: { name: { type: 'string' } } },
  { name: 'browser_console', required: [], properties: {} },
  { name: 'browser_network', required: [], properties: {} },
  { name: 'browser_close', required: [], properties: {} },
]

export function registerBrowserTools(registry) {
  for (const spec of TOOLS) {
    registry.register({
      name: spec.name,
      description: `Playwright ${spec.name} against the isolated preview.`,
      permission: spec.name === 'browser_screenshot' || spec.name.startsWith('browser_') ? 'execute' : 'execute',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: spec.required,
        properties: spec.properties,
      },
      async executor({ input, ctx, tool }) {
        if (tool.name === 'browser_close') {
          const closed = await closeBrowserSession(ctx.projectId)
          return toolOk(tool.name, closed)
        }
        const result = await executeBrowserTool({
          tool: tool.name,
          projectId: ctx.projectId,
          workspaceDir: ctx.workspaceDir,
          ...input,
        })
        if (result.skipped) {
          return {
            success: false,
            skipped: true,
            tool: tool.name,
            errorType: result.errorType || 'BROWSER_SKIPPED',
            message: result.message,
            data: result.data || null,
            recoverable: true,
          }
        }
        if (!result.success) {
          return toolFail(tool.name, {
            errorType: result.errorType || 'BROWSER_TOOL_FAILED',
            message: result.message,
            recoverable: true,
            data: result.data || null,
          })
        }
        return toolOk(tool.name, result.data || {}, { message: result.message, ...result })
      },
    })
  }
}
