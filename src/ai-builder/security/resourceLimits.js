function num(name, fallback) {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

export function getResourceLimits() {
  return {
    maxRuntimeMs: num('AI_MAX_RUNTIME_MS', 10 * 60 * 1000),
    maxRetries: num('AI_MAX_ITERATIONS', 5),
    maxFiles: num('AI_MAX_FILES', 1000),
    maxWorkspaceMb: num('AI_MAX_WORKSPACE_MB', 500),
    maxConcurrentPerUser: num('AI_MAX_CONCURRENT_TASKS', 2),
    maxOutputBytes: num('AI_MAX_OUTPUT_BYTES', 2 * 1024 * 1024),
  }
}

export function assertWithinLimits({ elapsedMs = 0, iteration = 0, fileCount = 0, workspaceBytes = 0 } = {}) {
  const limits = getResourceLimits()
  if (elapsedMs > limits.maxRuntimeMs) {
    return { ok: false, code: 'RESOURCE_LIMIT', message: 'Agent runtime limit reached.' }
  }
  if (iteration > limits.maxRetries) {
    return { ok: false, code: 'RESOURCE_LIMIT', message: 'Maximum agent iterations reached.' }
  }
  if (fileCount > limits.maxFiles) {
    return { ok: false, code: 'RESOURCE_LIMIT', message: 'Workspace file count limit reached.' }
  }
  if (workspaceBytes > limits.maxWorkspaceMb * 1024 * 1024) {
    return { ok: false, code: 'RESOURCE_LIMIT', message: 'Workspace size limit reached.' }
  }
  return { ok: true, limits }
}
