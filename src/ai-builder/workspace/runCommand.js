import { spawn } from 'node:child_process'
import { assertAllowedCommand } from '../security/commandPolicy.js'
import { getResourceLimits } from '../security/resourceLimits.js'
import { sanitizedWorkspaceEnv } from '../security/workspaceEnv.js'
import { extractCompilerMessage } from '../validation/buildError.js'

export function runWorkspaceCommand({ cwd, command, extraEnv = {}, timeoutMs, signal } = {}) {
  const allowed = assertAllowedCommand(command, { production: false })
  if (!allowed.ok) return Promise.resolve(allowed)
  const limits = getResourceLimits()
  const maxMs = timeoutMs || Math.min(limits.maxRuntimeMs, 8 * 60 * 1000)
  const env = { ...sanitizedWorkspaceEnv(), ...extraEnv, npm_config_update_notifier: 'false' }
  return new Promise((resolve) => {
    const child = spawn(allowed.argv[0], allowed.argv.slice(1), {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ ok: false, code: 'COMMAND_TIMEOUT', command, stdout, stderr, message: `Timed out: ${command}` })
    }, maxMs)
    const onAbort = () => child.kill('SIGKILL')
    if (signal?.aborted) {
      onAbort()
    } else {
      signal?.addEventListener('abort', onAbort, { once: true })
    }
    child.stdout.on('data', (c) => {
      stdout += String(c)
      if (stdout.length > limits.maxOutputBytes) child.kill('SIGKILL')
    })
    child.stderr.on('data', (c) => {
      stderr += String(c)
      if (stderr.length > limits.maxOutputBytes) child.kill('SIGKILL')
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ ok: false, code: 'COMMAND_FAILED', command, message: String(err.message || err), stdout, stderr })
    })
    child.on('close', (exitCode) => {
      clearTimeout(timer)
      resolve({
        ok: exitCode === 0,
        code: exitCode === 0 ? undefined : 'COMMAND_FAILED',
        command,
        exitCode,
        stdout,
        stderr,
        message: exitCode === 0 ? `OK ${command}` : extractCompilerMessage(`${stderr}\n${stdout}`) || `${command} exited ${exitCode}`,
      })
    })
  })
}
