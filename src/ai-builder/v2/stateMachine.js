export const V2_STATES = [
  'IDLE',
  'ANALYZING',
  'PLANNING',
  'DESIGNING',
  'IMPLEMENTING',
  'BUILDING',
  'DEBUGGING',
  'STARTING_PREVIEW',
  'BROWSER_TESTING',
  'VISUAL_TESTING',
  'REVIEWING',
  'REPAIRING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]

const TRANSITIONS = {
  IDLE: ['ANALYZING', 'CANCELLED'],
  ANALYZING: ['PLANNING', 'COMPLETED', 'FAILED', 'CANCELLED'],
  PLANNING: ['DESIGNING', 'IMPLEMENTING', 'COMPLETED', 'FAILED', 'CANCELLED'],
  DESIGNING: ['IMPLEMENTING', 'FAILED', 'CANCELLED'],
  IMPLEMENTING: ['BUILDING', 'FAILED', 'CANCELLED'],
  BUILDING: ['DEBUGGING', 'STARTING_PREVIEW', 'FAILED', 'CANCELLED'],
  DEBUGGING: ['IMPLEMENTING', 'FAILED', 'CANCELLED'],
  STARTING_PREVIEW: ['BROWSER_TESTING', 'FAILED', 'CANCELLED'],
  BROWSER_TESTING: ['VISUAL_TESTING', 'REPAIRING', 'FAILED', 'CANCELLED'],
  VISUAL_TESTING: ['REVIEWING', 'REPAIRING', 'FAILED', 'CANCELLED'],
  REPAIRING: ['BUILDING', 'FAILED', 'CANCELLED'],
  REVIEWING: ['COMPLETED', 'REPAIRING', 'FAILED', 'CANCELLED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
}

/** Map V2 states onto AIJob.status (Mongo enum). */
export const V2_TO_JOB_STATUS = {
  IDLE: 'QUEUED',
  ANALYZING: 'ANALYZING',
  PLANNING: 'PLANNING',
  DESIGNING: 'DESIGNING',
  IMPLEMENTING: 'IMPLEMENTING',
  BUILDING: 'BUILDING',
  DEBUGGING: 'DEBUGGING',
  STARTING_PREVIEW: 'PREVIEW_READY',
  BROWSER_TESTING: 'BROWSER_TESTING',
  VISUAL_TESTING: 'VISUAL_TESTING',
  REVIEWING: 'REVIEWING',
  REPAIRING: 'REPAIRING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
}

export function canTransition(from, to) {
  if (from === to) return true
  return (TRANSITIONS[from] || []).includes(to)
}

export function assertTransition(from, to) {
  if (!V2_STATES.includes(to)) {
    throw Object.assign(new Error(`Unknown V2 state ${to}`), { code: 'INVALID_STATE' })
  }
  if (!canTransition(from, to)) {
    throw Object.assign(new Error(`Invalid V2 transition ${from} → ${to}`), { code: 'INVALID_TRANSITION' })
  }
  return to
}

export function createStateMachine(initial = 'IDLE') {
  let current = V2_STATES.includes(initial) ? initial : 'IDLE'
  return {
    get state() {
      return current
    },
    transition(to) {
      current = assertTransition(current, to)
      return current
    },
    jobStatus() {
      return V2_TO_JOB_STATUS[current] || 'EXECUTING'
    },
  }
}
