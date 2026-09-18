/**
 * GetVia agent runtime boundary.
 *
 * Phase 8: real-time task events, admin AI UI, cancel, stuck recovery, undo.
 * Isolated jobs use this runtime when `AI_AGENT_RUNTIME=1`.
 */

import { isAgentRuntimeEnabled } from '../src/ai-builder/runtimeFlags.js'

export const AGENT_RUNTIME_PHASE = 8
export const AGENT_RUNTIME_MOUNTED = isAgentRuntimeEnabled()
export { isAgentRuntimeEnabled }

export const AGENT_LAYOUT = Object.freeze({
  core: 'intent, design mode, novelty',
  orchestrator: 'task lifecycle',
  llm: 'provider router + adapters',
  brain: 'project brain + indexer',
  context: 'task-specific LLM context',
  tools: 'registry + permissioned executor',
  workspace: 'isolated project files (wraps existing workspaceManager)',
  execution: 'build / test loops',
  validation: 'build + runtime gates',
  browser: 'Playwright agent',
  visual: 'screenshot / visual gates',
  repair: 'bounded repair loop',
  review: 'completion reviewer',
  events: 'real TASK_* events + SSE',
  state: 'persisted state machine',
  getvia: 'BusinessDataAdapter → BusinessProfile',
})

export { createAgentRuntime } from './runtime.js'
export { createLLMRouter, LLMRouter, LLMProvider, FakeProvider } from './llm/index.js'
export { createDefaultToolRegistry, ToolRegistry } from './tools/index.js'
export {
  indexProject,
  refreshProjectBrain,
  readProjectBrain,
  writeProjectBrain,
  emptyBrain,
  BRAIN_REL,
} from './brain/index.js'
export { buildContext, locate, classifyTask } from './context/index.js'
export { runAgentTask, createOrchestrator } from './orchestrator/index.js'
export { classifyIntent, INTENTS, classifyDesignMode, DESIGN_MODES, noveltyFor } from './core/index.js'
export { TASK_STATES } from './state/index.js'
export { MAX_BUILD_REPAIRS, MAX_BROWSER_REPAIRS, MAX_DESIGN_ITERS } from './execution/index.js'
export { runBrowserValidation, SKIPPED_MESSAGE, PASSED_MESSAGE } from './browser/index.js'
export { startPreview, stopPreview, previewStatus } from './preview/index.js'
export { exploreDirections, applyDesignToWorkspace, DIRECTION_IDS } from './visual/design-explorer/index.js'
export { screenshotSimilarity, isSameComposition } from './visual/similarity.js'
export { TASK_EVENTS, subscribeTaskEvents, publishTaskEvent } from './events/index.js'
export {
  loadBusinessProfile,
  fromGetviaToolResult,
  normalizeBusinessProfile,
  runGetviaWebsiteJob,
  assertProductionGuards,
} from './getvia/index.js'
