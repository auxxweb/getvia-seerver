import { assertAllowedCommand } from '../../src/ai-builder/security/commandPolicy.js'
import { runWorkspaceCommand } from '../../src/ai-builder/workspace/runCommand.js'
import { inspectWorkspaceBuild } from '../../src/ai-builder/validation/isolatedBuild.js'
import { toolFail, toolOk } from './result.js'

export function registerExecTools(registry) {
  registry.register({
    name: 'run_command',
    description: 'Run an allowlisted workspace command (npm scripts only).',
    permission: 'execute',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['command'],
      properties: { command: { type: 'string' } },
    },
    async executor({ input, ctx }) {
      const allowed = assertAllowedCommand(input.command)
      if (!allowed.ok) {
        return toolFail('run_command', {
          errorType: 'COMMAND_REJECTED',
          message: allowed.message,
          recoverable: false,
        })
      }
      const run = await runWorkspaceCommand({
        cwd: ctx.workspaceDir,
        command: allowed.command,
        signal: ctx.signal,
      })
      if (!run.ok) {
        return toolFail('run_command', {
          errorType: run.code === 'COMMAND_TIMEOUT' ? 'COMMAND_ERROR' : 'COMMAND_ERROR',
          message: run.message || 'Command failed.',
          recoverable: true,
          details: { exitCode: run.exitCode, stdout: run.stdout, stderr: run.stderr, command: run.command },
        })
      }
      return toolOk('run_command', {
        command: run.command,
        exitCode: run.exitCode ?? 0,
        stdout: run.stdout || '',
        stderr: run.stderr || '',
        duration: run.duration,
      })
    },
  })

  registry.register({
    name: 'run_build',
    description: 'Run npm run build in the isolated workspace.',
    permission: 'execute',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    async executor({ ctx }) {
      const allowed = assertAllowedCommand('npm run build')
      if (!allowed.ok) {
        return toolFail('run_build', {
          errorType: 'COMMAND_REJECTED',
          message: allowed.message,
          recoverable: false,
        })
      }
      const build = await inspectWorkspaceBuild({ workspaceDir: ctx.workspaceDir, runBuild: true, signal: ctx.signal })
      if (!build.ok) {
        return toolFail('run_build', {
          errorType: build.code === 'SECURITY_VALIDATION_FAILED' ? 'PERMISSION_DENIED' : 'BUILD_ERROR',
          message: build.message || 'Build failed.',
          recoverable: true,
          details: { exitCode: build.exitCode, stdout: build.stdout, stderr: build.stderr, issues: build.issues },
        })
      }
      return toolOk('run_build', {
        command: 'npm run build',
        exitCode: build.exitCode ?? 0,
        stdout: build.stdout || build.message || '',
        skipped: Boolean(build.skipped),
      })
    },
  })
}
