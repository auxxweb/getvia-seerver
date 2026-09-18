export const TERMINAL_JOB_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED']
export const IDLE_JOB_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED', 'WAITING_APPROVAL']

export function isMutatingStatus(status) {
  return !IDLE_JOB_STATUSES.includes(status)
}

export function markStepsDone(steps) {
  if (!Array.isArray(steps)) return []
  return steps.map((step) => {
    const row = step && typeof step.toObject === 'function' ? step.toObject() : { ...step }
    return { ...row, status: 'done' }
  })
}

export function markJobStopped(job, { message = 'This AI update was stopped.', code = 'AI_JOB_CANCELLED' } = {}) {
  if (!job) return job
  job.cancelRequested = true
  job.status = 'CANCELLED'
  job.completedAt = job.completedAt || new Date()
  job.currentStep = ''
  job.userFacingSteps = markStepsDone(job.userFacingSteps)
  job.error = job.error || { code, message }
  return job
}

export function markJobStarted(job, { status = 'ANALYZING', currentStep = 'understanding', steps } = {}) {
  if (!job) return job
  job.status = status
  job.currentStep = currentStep
  job.startedAt = job.startedAt || new Date()
  if (Array.isArray(steps) && steps.length) {
    job.userFacingSteps = steps.map((step, index) => ({
      ...step,
      status: index === 0 ? 'active' : 'pending',
    }))
  }
  return job
}

/**
 * Decide what to do with a job that has no in-process runner.
 * QUEUED jobs can be resumed. In-flight jobs cannot; they were lost on restart.
 */
export function orphanAction(job, { hasRunner = false } = {}) {
  if (!job || !isMutatingStatus(job.status)) return 'ignore'
  if (hasRunner) return 'running'
  if (job.status === 'QUEUED') return 'resume'
  return 'cancel'
}

const FINAL_PROGRESS_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED', 'WAITING_APPROVAL']

/** Live progress must not flip the job to a terminal status before the queue writes written/saved/message. */
export function sanitizeProgressPatch(patch = {}, jobType = '') {
  const next = { ...patch }
  if (next.status === 'PREVIEW_READY' && jobType !== 'ISOLATED_WEBSITE') delete next.status
  if (FINAL_PROGRESS_STATUSES.includes(next.status)) delete next.status
  return next
}

export function jobHasSavedChanges(result = {}) {
  return Boolean(
    result.saved ||
      result.isolatedPreviewUrl ||
      (Array.isArray(result.written) && result.written.length) ||
      (Array.isArray(result.applied) && result.applied.length) ||
      result.revision ||
      result.v2,
  )
}
