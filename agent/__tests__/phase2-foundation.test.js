import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { createAgentRuntime } from '../runtime.js'
import { createLLMRouter, FakeProvider, LLMProvider } from '../llm/index.js'
import { createDefaultToolRegistry } from '../tools/index.js'

const execFileAsync = promisify(execFile)

function ctx(dir, extra = {}) {
  return { userId: 'user1', projectId: 'site1', workspaceDir: dir, permission: 'execute', ...extra }
}

async function tempWorkspace() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-agent-'))
  await fs.mkdir(path.join(dir, 'src'), { recursive: true })
  await fs.writeFile(path.join(dir, 'src/App.jsx'), 'export default function App(){return <h1>Hello</h1>}\n')
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'gv-agent-test',
      private: true,
      scripts: { build: 'node -e "console.log(\'built\')"', lint: 'node -e "console.log(\'lint\')"' },
    }),
  )
  return dir
}

function runtimeWithFake() {
  return createAgentRuntime({
    llm: createLLMRouter({ providers: [new FakeProvider({ replies: { coding: 'code-ok', classification: 'class-ok' } })] }),
  })
}

test('LLMProvider is an interface and FakeProvider implements it', async () => {
  const fake = new FakeProvider({ replies: { generate: 'hello' } })
  assert.equal(fake instanceof LLMProvider, true)
  const generated = await fake.generate({ user: 'hi' })
  assert.equal(generated.success, true)
  assert.equal(generated.provider, 'fake')
  const structured = await fake.structured({ schemaName: 'x' })
  assert.equal(structured.success, true)
  assert.equal(structured.data.ok, true)
  const code = await fake.generateCode({ user: 'button' })
  assert.equal(code.success, true)
})

test('LLMRouter routes by task and never exposes a vendor SDK', async () => {
  const router = createLLMRouter({ providers: [new FakeProvider()] })
  const coding = router.route('coding')
  assert.equal(coding.provider, 'fake')
  assert.equal(coding.tier, 'complex')
  const classification = router.route('classification')
  assert.equal(classification.tier, 'simple')
  const result = await router.generateCode({ user: 'Add CTA' })
  assert.equal(result.success, true)
  assert.equal(result.provider, 'fake')
  assert.ok(!('client' in result))
})

test('tool registry lists the Phase 2 tools', () => {
  const names = createDefaultToolRegistry()
    .list()
    .map((t) => t.name)
    .sort()
  assert.deepEqual(names, [
    'browser_click',
    'browser_close',
    'browser_console',
    'browser_network',
    'browser_open',
    'browser_screenshot',
    'browser_scroll',
    'browser_select',
    'browser_type',
    'delete_file',
    'get_animation_reference',
    'get_cdn_resource',
    'get_component_reference',
    'get_font_reference',
    'get_icon_reference',
    'git_checkpoint',
    'git_diff',
    'git_restore',
    'git_status',
    'inspect_design_resource',
    'list_files',
    'patch_file',
    'preview_status',
    'read_file',
    'research_design_practices',
    'run_build',
    'run_command',
    'search_cdn_libraries',
    'search_code',
    'search_design_resources',
    'search_web_design',
    'start_preview',
    'stop_preview',
    'write_file',
  ])
})

test('unknown tool and invalid arguments are rejected', async () => {
  const runtime = runtimeWithFake()
  const dir = await tempWorkspace()
  const unknown = await runtime.callTool('rm_rf', {}, ctx(dir))
  assert.equal(unknown.success, false)
  assert.equal(unknown.errorType, 'TOOL_UNKNOWN')
  const missing = await runtime.callTool('read_file', {}, ctx(dir))
  assert.equal(missing.success, false)
  assert.equal(missing.errorType, 'VALIDATION_ERROR')
  const extra = await runtime.callTool('read_file', { path: 'src/App.jsx', hack: true }, ctx(dir))
  assert.equal(extra.success, false)
  assert.equal(extra.errorType, 'VALIDATION_ERROR')
})

test('permission rejection and missing workspace ownership', async () => {
  const runtime = runtimeWithFake()
  const dir = await tempWorkspace()
  const denied = await runtime.callTool(
    'write_file',
    { path: 'src/App.jsx', contents: 'x' },
    ctx(dir, { permission: 'read' }),
  )
  assert.equal(denied.success, false)
  assert.equal(denied.errorType, 'PERMISSION_DENIED')
  const anon = await runtime.callTool('list_files', {}, { workspaceDir: dir })
  assert.equal(anon.success, false)
  assert.equal(anon.errorType, 'PERMISSION_DENIED')
})

test('file reading, writing, search, patch, and delete', async () => {
  const runtime = runtimeWithFake()
  const dir = await tempWorkspace()
  const listed = await runtime.callTool('list_files', {}, ctx(dir))
  assert.equal(listed.success, true)
  assert.ok(listed.data.files.includes('src/App.jsx'))

  const read = await runtime.callTool('read_file', { path: 'src/App.jsx' }, ctx(dir))
  assert.equal(read.success, true)
  assert.match(read.data.contents, /Hello/)

  const search = await runtime.callTool('search_code', { query: 'Hello' }, ctx(dir))
  assert.equal(search.success, true)
  assert.equal(search.data.hits[0].path, 'src/App.jsx')

  const written = await runtime.callTool(
    'write_file',
    { path: 'src/App.jsx', contents: 'export default function App(){return <h1>Patched</h1>}\n' },
    ctx(dir),
  )
  assert.equal(written.success, true)

  const patched = await runtime.callTool(
    'patch_file',
    { path: 'src/App.jsx', oldText: 'Patched', newText: 'Updated' },
    ctx(dir),
  )
  assert.equal(patched.success, true)
  const after = await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8')
  assert.match(after, /Updated/)

  const escaped = await runtime.callTool('write_file', { path: '../secret.js', contents: 'nope' }, ctx(dir))
  assert.equal(escaped.success, false)
  assert.equal(escaped.errorType, 'PATH_REJECTED')

  const deleted = await runtime.callTool('delete_file', { path: 'src/App.jsx' }, ctx(dir))
  assert.equal(deleted.success, true)
})

test('command execution rejects unsafe shells and runs allowlisted npm', async () => {
  const runtime = runtimeWithFake()
  const dir = await tempWorkspace()
  const blocked = await runtime.callTool('run_command', { command: 'rm -rf /' }, ctx(dir))
  assert.equal(blocked.success, false)
  assert.equal(blocked.errorType, 'COMMAND_REJECTED')

  const previous = process.env.AI_ISOLATED_RUNTIME
  process.env.AI_ISOLATED_RUNTIME = '1'
  delete process.env.AI_SKIP_WORKSPACE_NPM
  try {
    const ran = await runtime.callTool('run_command', { command: 'npm run lint' }, ctx(dir))
    assert.equal(ran.success, true, ran.message)
    assert.match(String(ran.data.stdout), /lint/)
  } finally {
    if (previous == null) delete process.env.AI_ISOLATED_RUNTIME
    else process.env.AI_ISOLATED_RUNTIME = previous
  }
})

test('build execution uses npm run build in the workspace', async () => {
  const runtime = runtimeWithFake()
  const dir = await tempWorkspace()
  const previous = process.env.AI_ISOLATED_RUNTIME
  process.env.AI_ISOLATED_RUNTIME = '1'
  delete process.env.AI_SKIP_WORKSPACE_NPM
  try {
    const build = await runtime.callTool('run_build', {}, ctx(dir))
    assert.equal(build.success, true, build.message)
    assert.match(String(build.data.stdout), /built/)
  } finally {
    if (previous == null) delete process.env.AI_ISOLATED_RUNTIME
    else process.env.AI_ISOLATED_RUNTIME = previous
  }
})

test('git_status and git_diff work only inside a workspace git repo', async () => {
  const runtime = runtimeWithFake()
  const dir = await tempWorkspace()
  const missing = await runtime.callTool('git_status', {}, ctx(dir))
  assert.equal(missing.success, false)
  assert.equal(missing.errorType, 'GIT_UNAVAILABLE')

  const gitRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp')
  await fs.mkdir(gitRoot, { recursive: true })
  const gitDir = await fs.mkdtemp(path.join(gitRoot, 'git-'))
  await fs.mkdir(path.join(gitDir, 'src'), { recursive: true })
  await fs.writeFile(path.join(gitDir, 'src/App.jsx'), 'export default function App(){return <h1>Hello</h1>}\n')
  try {
    try {
      await execFileAsync('git', ['init', '--template='], { cwd: gitDir })
    } catch (err) {
      if (/not permitted/i.test(String(err?.stderr || err?.message || ''))) return
      throw err
    }
    await execFileAsync('git', ['config', 'user.email', 'agent@test'], { cwd: gitDir })
    await execFileAsync('git', ['config', 'user.name', 'Agent'], { cwd: gitDir })
    await execFileAsync('git', ['add', 'src/App.jsx'], { cwd: gitDir })
    await execFileAsync('git', ['-c', 'commit.gpgsign=false', 'commit', '-m', 'init'], { cwd: gitDir })
    await fs.writeFile(path.join(gitDir, 'src/App.jsx'), 'export default function App(){return <h1>Diff</h1>}\n')

    const status = await runtime.callTool('git_status', {}, ctx(gitDir))
    assert.equal(status.success, true, status.message)
    assert.match(status.data.porcelain, /App\.jsx/)

    const diff = await runtime.callTool('git_diff', { path: 'src/App.jsx' }, ctx(gitDir))
    assert.equal(diff.success, true, diff.message)
    assert.match(diff.data.diff, /Diff/)

    const escaped = await runtime.callTool('git_diff', { path: '../outside' }, ctx(gitDir))
    assert.equal(escaped.success, false)
    assert.equal(escaped.errorType, 'PATH_REJECTED')
  } finally {
    await fs.rm(gitDir, { recursive: true, force: true })
  }
})

test('LLM can request a tool through the runtime', async () => {
  const runtime = runtimeWithFake()
  const dir = await tempWorkspace()
  const plan = await runtime.complete('coding', { user: 'Read App.jsx then list files' })
  assert.equal(plan.success, true)
  const request = { name: 'list_files', arguments: {} }
  const result = await runtime.callTool(request.name, request.arguments, ctx(dir))
  assert.equal(result.success, true)
  assert.ok(Array.isArray(result.data.files))
})
