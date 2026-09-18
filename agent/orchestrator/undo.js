import { failTask, TERMINAL_STATES } from '../state/machine.js'
import { emitTaskEvent } from '../events/index.js'

export async function undoLastChange({ runtime, ctx, brain, task, go, runBuild }) {
  const sha = brain?.undoSha || task.checkpoints.find((row) => row.sha)?.sha || null
  if (!sha) {
    const failed = failTask(task, 'Nothing to undo.')
    emitTaskEvent(task, 'TASK_FAILED', failed.message)
    return { ok: false, task: failed }
  }
  if (!go('IMPLEMENTING', { phase: 'ACT', role: 'coder', message: 'Restoring checkpoint.' })) {
    return { ok: false, task }
  }
  emitTaskEvent(task, 'REPAIR_STARTED', `Restoring checkpoint ${sha}.`)
  const restored = await runtime.callTool('git_restore', { sha }, ctx)
  if (!restored.success) {
    const failed = failTask(task, restored.message || 'Could not restore the previous checkpoint.')
    emitTaskEvent(task, 'TASK_FAILED', failed.message)
    return { ok: false, task: failed }
  }
  task.filesChanged = ['(restored workspace)']
  emitTaskEvent(task, 'REPAIR_COMPLETED', `Restored ${sha}.`)
  if (!go('BUILDING', { phase: 'OBSERVE', role: 'debugger', message: 'Building after undo.' })) {
    return { ok: false, task }
  }
  const build = await runBuild(runtime, ctx)
  task.build = build
  if (!build.ok) {
    const failed = failTask(task, `Undo restored files but the build failed: ${build.message}`, { build })
    emitTaskEvent(task, 'TASK_FAILED', failed.message)
    return { ok: false, task: failed }
  }
  if (!go('REVIEWING', { phase: 'VERIFY', role: 'reviewer', message: 'Undo restored.' })) {
    return { ok: false, task }
  }
  if (TERMINAL_STATES.includes(task.state) && task.state !== 'REVIEWING') {
    return { ok: false, task }
  }
  task.review = { ok: true, message: `Restored checkpoint ${sha}.` }
  return { ok: true, sha, build, restored }
}
