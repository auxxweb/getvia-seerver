import { promisify } from 'node:util'
import { execFile as execFileCb } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { assertInsideWorkspace } from '../../src/ai-builder/security/pathPolicy.js'
import { toolFail, toolOk } from './result.js'

const execFile = promisify(execFileCb)

async function git(workspaceDir, args) {
  return execFile('git', args, {
    cwd: workspaceDir,
    timeout: 15_000,
    env: {
      PATH: process.env.PATH,
      GIT_TERMINAL_PROMPT: '0',
      GIT_OPTIONAL_LOCKS: '0',
    },
  })
}

async function isGitRepo(workspaceDir) {
  try {
    await fs.access(path.join(workspaceDir, '.git'))
    return true
  } catch {
    return false
  }
}

export function registerGitTools(registry) {
  registry.register({
    name: 'git_status',
    description: 'Read git status in the workspace. Does not run a shell.',
    permission: 'read',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    async executor({ ctx }) {
      if (!(await isGitRepo(ctx.workspaceDir))) {
        return toolFail('git_status', {
          errorType: 'GIT_UNAVAILABLE',
          message: 'Workspace is not a git repository.',
          recoverable: true,
        })
      }
      try {
        const { stdout } = await git(ctx.workspaceDir, ['status', '--porcelain=v1', '-b'])
        return toolOk('git_status', { porcelain: stdout, initialized: true })
      } catch (err) {
        return toolFail('git_status', {
          errorType: 'GIT_ERROR',
          message: String(err?.stderr || err?.message || err).slice(0, 500),
          recoverable: true,
        })
      }
    },
  })

  registry.register({
    name: 'git_diff',
    description: 'Read git diff for the workspace or one allowlisted file.',
    permission: 'read',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { path: { type: 'string' } },
    },
    async executor({ input, ctx }) {
      if (!(await isGitRepo(ctx.workspaceDir))) {
        return toolFail('git_diff', {
          errorType: 'GIT_UNAVAILABLE',
          message: 'Workspace is not a git repository.',
          recoverable: true,
        })
      }
      const args = ['diff']
      if (input.path) {
        const inside = assertInsideWorkspace(ctx.workspaceDir, input.path)
        if (!inside.ok) {
          return toolFail('git_diff', { errorType: 'PATH_REJECTED', message: inside.message, recoverable: false })
        }
        args.push('--', inside.relative)
      }
      try {
        const { stdout } = await git(ctx.workspaceDir, args)
        return toolOk('git_diff', { diff: stdout })
      } catch (err) {
        return toolFail('git_diff', {
          errorType: 'GIT_ERROR',
          message: String(err?.stderr || err?.message || err).slice(0, 500),
          recoverable: true,
        })
      }
    },
  })

  registry.register({
    name: 'git_checkpoint',
    description: 'Create a git commit checkpoint of the isolated workspace.',
    permission: 'write',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { message: { type: 'string' } },
    },
    async executor({ input, ctx }) {
      const message = String(input.message || 'checkpoint').slice(0, 200)
      try {
        if (!(await isGitRepo(ctx.workspaceDir))) {
          await git(ctx.workspaceDir, ['init', '--template='])
          const ignore = path.join(ctx.workspaceDir, '.gitignore')
          try {
            await fs.access(ignore)
          } catch {
            await fs.writeFile(ignore, 'node_modules\ndist\n.vite\n.DS_Store\n', 'utf8')
          }
        }
        await git(ctx.workspaceDir, ['add', '-A'])
        try {
          const { stdout } = await git(ctx.workspaceDir, [
            '-c',
            'user.email=agent@getvia.local',
            '-c',
            'user.name=GetViaAgent',
            '-c',
            'commit.gpgsign=false',
            'commit',
            '-m',
            message,
          ])
          const sha = await git(ctx.workspaceDir, ['rev-parse', '--short', 'HEAD']).then((r) => String(r.stdout || '').trim()).catch(() => '')
          return toolOk('git_checkpoint', { message, sha, output: String(stdout || '').slice(0, 400) })
        } catch (err) {
          const text = String(err?.stderr || err?.message || err)
          if (/nothing to commit/i.test(text)) {
            const sha = await git(ctx.workspaceDir, ['rev-parse', '--short', 'HEAD']).then((r) => String(r.stdout || '').trim()).catch(() => '')
            return toolOk('git_checkpoint', { message, sha, skipped: true })
          }
          throw err
        }
      } catch (err) {
        const text = String(err?.stderr || err?.message || err)
        if (/not permitted/i.test(text)) {
          return toolFail('git_checkpoint', {
            errorType: 'GIT_UNAVAILABLE',
            message: 'Git checkpoint is not permitted in this environment.',
            recoverable: true,
          })
        }
        return toolFail('git_checkpoint', {
          errorType: 'GIT_ERROR',
          message: text.slice(0, 500),
          recoverable: true,
        })
      }
    },
  })

  registry.register({
    name: 'git_restore',
    description: 'Restore the isolated workspace to a previous git checkpoint SHA.',
    permission: 'write',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['sha'],
      properties: { sha: { type: 'string' } },
    },
    async executor({ input, ctx }) {
      const sha = String(input.sha || '').trim()
      if (!/^[0-9a-f]{4,40}$/i.test(sha)) {
        return toolFail('git_restore', {
          errorType: 'VALIDATION_ERROR',
          message: 'Checkpoint SHA is invalid.',
          recoverable: false,
        })
      }
      if (!(await isGitRepo(ctx.workspaceDir))) {
        return toolFail('git_restore', {
          errorType: 'GIT_UNAVAILABLE',
          message: 'Workspace is not a git repository.',
          recoverable: true,
        })
      }
      try {
        await git(ctx.workspaceDir, ['rev-parse', '--verify', sha])
        await git(ctx.workspaceDir, ['reset', '--hard', sha])
        return toolOk('git_restore', { sha })
      } catch (err) {
        return toolFail('git_restore', {
          errorType: 'GIT_ERROR',
          message: String(err?.stderr || err?.message || err).slice(0, 500),
          recoverable: true,
        })
      }
    },
  })
}
