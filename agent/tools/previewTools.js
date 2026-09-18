import { startPreview, stopPreview, previewStatus } from '../preview/index.js'
import { toolFail, toolOk } from './result.js'

export function registerPreviewTools(registry) {
  registry.register({
    name: 'start_preview',
    description: 'Start an isolated 127.0.0.1 preview for the workspace. Clients cannot choose the port.',
    permission: 'execute',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    async executor({ ctx }) {
      const result = await startPreview({ projectId: ctx.projectId, workspaceDir: ctx.workspaceDir })
      if (result.skipped && !result.ok) {
        return {
          success: false,
          skipped: true,
          tool: 'start_preview',
          errorType: result.code || 'PREVIEW_NOT_READY',
          message: result.message,
          data: result,
        }
      }
      if (!result.ok) {
        return toolFail('start_preview', {
          errorType: result.code || 'PREVIEW_ERROR',
          message: result.message,
          recoverable: true,
          data: result,
        })
      }
      return toolOk('start_preview', result)
    },
  })

  registry.register({
    name: 'stop_preview',
    description: 'Stop the isolated preview for this project.',
    permission: 'execute',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    async executor({ ctx }) {
      const result = await stopPreview({ projectId: ctx.projectId })
      return toolOk('stop_preview', result)
    },
  })

  registry.register({
    name: 'preview_status',
    description: 'Read whether the isolated preview is running and its URL.',
    permission: 'read',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    async executor({ ctx }) {
      return toolOk('preview_status', previewStatus({ projectId: ctx.projectId }))
    },
  })
}
