export const TASK_STATES = Object.freeze([
  'IDLE',
  'ANALYZING',
  'INSPECTING',
  'PLANNING',
  'IMPLEMENTING',
  'BUILDING',
  'DEBUGGING',
  'REPAIRING',
  'REVIEWING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
])

export const TERMINAL_STATES = Object.freeze(['COMPLETED', 'FAILED', 'CANCELLED'])

const TRANSITIONS = Object.freeze({
  IDLE: ['ANALYZING', 'CANCELLED', 'FAILED'],
  ANALYZING: ['INSPECTING', 'CANCELLED', 'FAILED'],
  INSPECTING: ['PLANNING', 'CANCELLED', 'FAILED'],
  PLANNING: ['IMPLEMENTING', 'REVIEWING', 'CANCELLED', 'FAILED'],
  IMPLEMENTING: ['BUILDING', 'REVIEWING', 'CANCELLED', 'FAILED'],
  BUILDING: ['REVIEWING', 'DEBUGGING', 'CANCELLED', 'FAILED'],
  DEBUGGING: ['REPAIRING', 'CANCELLED', 'FAILED'],
  REPAIRING: ['BUILDING', 'CANCELLED', 'FAILED'],
  REVIEWING: ['COMPLETED', 'REPAIRING', 'CANCELLED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
})

export function createTaskRecord({ prompt, userId, projectId, workspaceDir } = {}) {
  return {
    id: `task_${Date.now().toString(36)}`,
    prompt: String(prompt || ''),
    userId: String(userId || ''),
    projectId: String(projectId || ''),
    workspaceDir: workspaceDir || '',
    state: 'IDLE',
    intent: null,
    events: [],
    phases: [],
    filesChanged: [],
    repairAttempts: 0,
    checkpoints: [],
    plan: null,
    build: null,
    review: null,
    browser: null,
    preview: null,
    design: null,
    success: false,
    message: '',
    startedAt: new Date().toISOString(),
    finishedAt: null,
  }
}

export function canTransition(from, to) {
  if (from === to) return true
  return (TRANSITIONS[from] || []).includes(to)
}

export function transition(task, next, event = {}) {
  const from = task.state
  if (!canTransition(from, next)) {
    return { ok: false, from, to: next, message: `Illegal state ${from} → ${next}.` }
  }
  task.state = next
  const row = {
    at: new Date().toISOString(),
    from,
    state: next,
    phase: event.phase || null,
    role: event.role || null,
    message: event.message || '',
    detail: event.detail || null,
  }
  task.events.push(row)
  if (event.phase && task.phases[task.phases.length - 1] !== event.phase) task.phases.push(event.phase)
  return { ok: true, task, event: row }
}

export function failTask(task, message, extra = {}) {
  task.success = false
  task.message = message || 'Task failed.'
  task.finishedAt = new Date().toISOString()
  if (extra.build) task.build = extra.build
  if (extra.browser) task.browser = extra.browser
  if (task.state !== 'FAILED' && task.state !== 'CANCELLED') {
    transition(task, 'FAILED', { phase: extra.phase || 'VERIFY', message: task.message, detail: extra.detail || null })
  }
  return task
}

export function completeTask(task, message, extra = {}) {
  if (extra.build && extra.build.ok === false) {
    return failTask(task, 'Build is failing; cannot complete.', { build: extra.build, browser: extra.browser })
  }
  if (extra.browser?.ran && extra.browser.passed === false) {
    return failTask(task, extra.browser.message || 'Browser QA failed.', extra)
  }
  task.success = true
  task.message = message || 'Task completed.'
  task.finishedAt = new Date().toISOString()
  if (extra.review) task.review = extra.review
  if (extra.build) task.build = extra.build
  if (extra.browser) task.browser = extra.browser
  if (extra.design) task.design = extra.design
  if (task.state !== 'COMPLETED') {
    const moved = transition(task, 'COMPLETED', { phase: 'VERIFY', role: 'reviewer', message: task.message })
    if (!moved.ok) return failTask(task, moved.message, extra)
  }
  return task
}
