const DEFAULT_TIMEOUT_MS = 4 * 60 * 1000

export function assertProductionGuards({ userId, projectId, businessId, workspaceDir, timeoutMs } = {}) {
  const issues = []
  if (!userId) issues.push({ type: 'authentication', message: 'Sign in required.' })
  if (!businessId) issues.push({ type: 'permissions', message: 'businessId is required.' })
  if (!projectId) issues.push({ type: 'permissions', message: 'projectId is required.' })
  if (workspaceDir && (workspaceDir === '/' || workspaceDir === process.env.HOME)) {
    issues.push({ type: 'permissions', message: 'Workspace path is not an isolated project directory.' })
  }
  if (timeoutMs != null && Number(timeoutMs) < 1_000) {
    issues.push({ type: 'timeouts', message: 'Job timeout is too short.' })
  }
  return { ok: issues.length === 0, issues }
}

export function withTimeout(promise, timeoutMs = DEFAULT_TIMEOUT_MS, signal) {
  const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error('The website job timed out.')
      err.code = 'TIMEOUT'
      reject(err)
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      const err = new Error('Cancelled.')
      err.code = 'CANCELLED'
      reject(err)
    }
    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

export { DEFAULT_TIMEOUT_MS }
