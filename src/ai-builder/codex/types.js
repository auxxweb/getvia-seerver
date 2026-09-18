export const CODEX_TASK_STATES = Object.freeze([
  'queued',
  'planning',
  'coding',
  'testing',
  'fixing',
  'validating',
  'preview_ready',
  'completed',
  'failed',
  'cancelled',
])

export const CODEX_EVENT_TYPES = Object.freeze([
  'THREAD_STARTED',
  'TURN_STARTED',
  'ITEM_STARTED',
  'ITEM_COMPLETED',
  'FILE_UPDATED',
  'COMMAND_RUN',
  'TURN_COMPLETED',
  'TURN_FAILED',
  'USAGE',
])

export function emptyCodexRun() {
  return {
    ok: false,
    skipped: true,
    coder: 'codex-sdk',
    threadId: null,
    written: [],
    items: [],
    events: [],
    summary: '',
    usage: null,
    error: null,
    code: 'CODEX_SKIPPED',
  }
}
