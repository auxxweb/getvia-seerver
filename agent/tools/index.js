import { ToolRegistry, createToolRegistry } from './registry.js'
import { registerFileTools } from './fileTools.js'
import { registerExecTools } from './execTools.js'
import { registerGitTools } from './gitTools.js'
import { registerPreviewTools } from './previewTools.js'
import { registerBrowserTools } from './browserTools.js'
import { registerDesignResourceTools } from './designResourceTools.js'
import { toolOk, toolFail } from './result.js'
import { validateToolInput } from './schema.js'

export function createDefaultToolRegistry() {
  const registry = createToolRegistry()
  registerFileTools(registry)
  registerExecTools(registry)
  registerGitTools(registry)
  registerPreviewTools(registry)
  registerBrowserTools(registry)
  registerDesignResourceTools(registry)
  return registry
}

export {
  ToolRegistry,
  createToolRegistry,
  toolOk,
  toolFail,
  validateToolInput,
  registerFileTools,
  registerExecTools,
  registerGitTools,
  registerPreviewTools,
  registerBrowserTools,
  registerDesignResourceTools,
}
