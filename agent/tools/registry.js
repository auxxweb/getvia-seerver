import { validateToolInput } from './schema.js'
import { toolFail } from './result.js'

const RANK = { read: 1, write: 2, execute: 3 }

function permissionOk(required, granted) {
  const need = RANK[required] || RANK.read
  const have = RANK[granted] || RANK.execute
  return have >= need
}

export class ToolRegistry {
  constructor() {
    this.tools = new Map()
  }

  register(definition) {
    if (!definition?.name || typeof definition.executor !== 'function') {
      throw new Error('Tool requires name and executor.')
    }
    this.tools.set(definition.name, {
      name: definition.name,
      description: definition.description || '',
      inputSchema: definition.inputSchema || { type: 'object', additionalProperties: false, properties: {} },
      permission: definition.permission || 'read',
      executor: definition.executor,
    })
    return this
  }

  get(name) {
    return this.tools.get(name) || null
  }

  list() {
    return [...this.tools.values()].map(({ executor, ...meta }) => meta)
  }

  async execute(name, input = {}, ctx = {}) {
    const tool = this.get(name)
    if (!tool) {
      return toolFail(name || 'unknown', {
        errorType: 'TOOL_UNKNOWN',
        message: `Tool "${name}" is not registered.`,
        recoverable: false,
      })
    }
    if (!ctx.userId || !ctx.projectId) {
      return toolFail(tool.name, {
        errorType: 'PERMISSION_DENIED',
        message: 'Tool calls require authenticated project ownership.',
        recoverable: false,
      })
    }
    if (!ctx.workspaceDir) {
      return toolFail(tool.name, {
        errorType: 'PERMISSION_DENIED',
        message: 'Tool calls require an isolated workspace.',
        recoverable: false,
      })
    }
    if (!permissionOk(tool.permission, ctx.permission || 'execute')) {
      return toolFail(tool.name, {
        errorType: 'PERMISSION_DENIED',
        message: `Permission "${ctx.permission}" cannot run ${tool.name}.`,
        recoverable: false,
      })
    }
    const valid = validateToolInput(tool.inputSchema, input)
    if (!valid.ok) {
      return toolFail(tool.name, {
        errorType: valid.errorType,
        message: valid.message,
        recoverable: true,
      })
    }
    try {
      return await tool.executor({ input, ctx, tool })
    } catch (err) {
      return toolFail(tool.name, {
        errorType: err.code || 'TOOL_CRASH',
        message: String(err.message || err),
        recoverable: true,
      })
    }
  }
}

export function createToolRegistry() {
  return new ToolRegistry()
}
