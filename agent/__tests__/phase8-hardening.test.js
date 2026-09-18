import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createAgentRuntime } from '../runtime.js'
import { createLLMRouter, FakeProvider } from '../llm/index.js'
import { createOrchestrator, runAgentTask } from '../orchestrator/index.js'
import { AGENT_RUNTIME_PHASE, TASK_EVENTS } from '../index.js'
import { TASK_EVENT_SET } from '../events/types.js'
import { subscribeTaskEvents, publishTaskEvent } from '../events/bus.js'
import { startStuckWatchdog, isStuckState } from '../watchdog.js'
import { runGetviaWebsiteJob } from '../getvia/job.js'
import { assertInsideWorkspace } from '../../src/ai-builder/security/pathPolicy.js'
import { assertAllowedCommand } from '../../src/ai-builder/security/commandPolicy.js'
import { assertWithinLimits } from '../../src/ai-builder/security/resourceLimits.js'
import { startPreview, stopPreview } from '../preview/index.js'
import { runBrowserValidation, closeBrowserSession, PASSED_MESSAGE } from '../browser/index.js'
import { repairBrowserFailure } from '../repair/index.js'

const TMP = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp')
const HTML = `<!doctype html>
<html>
  <body style="margin:0;background:#fff;color:#111">
    <header class="nav">
      <details class="nav-toggle"><summary>Menu</summary><nav><a href="#about">About</a></nav></details>
      <a href="#about">About</a>
    </header>
    <h1>Studio</h1>
    <a class="btn primary" href="#contact">Book</a>
    <section id="about"><form><input id="name" /><select id="city"><option value="goa">Goa</option></select></form></section>
    <section id="contact">Contact</section>
  </body>
</html>`

function orch() {
  return createOrchestrator({
    runtime: createAgentRuntime({
      llm: createLLMRouter({ providers: [new FakeProvider()] }),
    }),
  })
}

async function withIsolatedNpm(fn) {
  const previous = process.env.AI_ISOLATED_RUNTIME
  const skip = process.env.AI_SKIP_WORKSPACE_NPM
  process.env.AI_ISOLATED_RUNTIME = '1'
  delete process.env.AI_SKIP_WORKSPACE_NPM
  try {
    return await fn()
  } finally {
    if (previous == null) delete process.env.AI_ISOLATED_RUNTIME
    else process.env.AI_ISOLATED_RUNTIME = previous
    if (skip == null) delete process.env.AI_SKIP_WORKSPACE_NPM
    else process.env.AI_SKIP_WORKSPACE_NPM = skip
  }
}

async function siteWorkspace({ broken = false } = {}) {
  await fs.mkdir(TMP, { recursive: true })
  const dir = await fs.mkdtemp(path.join(TMP, 'p8-'))
  await fs.mkdir(path.join(dir, 'src/data'), { recursive: true })
  await fs.mkdir(path.join(dir, 'scripts'), { recursive: true })
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'salon-site',
      private: true,
      type: 'module',
      scripts: { build: 'node ./scripts/build-check.cjs' },
    }),
  )
  await fs.writeFile(
    path.join(dir, 'scripts/build-check.cjs'),
    `const fs = require('fs')
const app = fs.readFileSync('src/App.jsx', 'utf8')
if (app.includes('BROKEN')) { console.error('BROKEN'); process.exit(1) }
console.log('built')
`,
  )
  await fs.writeFile(
    path.join(dir, 'src/data/business.json'),
    JSON.stringify({
      name: 'LaFemina',
      hours: 'Tue–Sun 10–20',
      hero: { title: 'Color that lasts', primaryCta: { label: 'Book', href: '#contact' } },
      sections: ['hero', 'about', 'contact', 'footer'],
    }, null, 2),
  )
  await fs.writeFile(
    path.join(dir, 'src/App.jsx'),
    `import business from './data/business.json'
function Nav(){return <header className="nav"><a href="#top">{business.name}</a></header>}
function Hero(){const hero=business.hero||{};return <section id="hero" className="hero"><h1>{hero.title}</h1><a className="btn primary" href={hero.primaryCta.href}>{hero.primaryCta.label}</a></section>}
export default function App(){return <div id="top" className="site"><Nav /><Hero />${broken ? '// BROKEN' : ''}</div>}
`,
  )
  await fs.writeFile(path.join(dir, 'src/index.css'), '.btn { padding: 1rem; }\n.hero { min-height: 40vh; }\n')
  await fs.writeFile(path.join(dir, 'src/main.jsx'), "import App from './App.jsx'\n")
  await fs.writeFile(path.join(dir, 'index.html'), '<!doctype html><html><body><div id="root"></div></body></html>\n')
  return dir
}

function ids(dir, projectId = 'site1') {
  return { userId: 'user1', projectId, workspaceDir: dir }
}

function types(task) {
  return (task.ops || []).map((row) => row.type)
}

test('Phase 8 event catalog is complete and never invented', () => {
  assert.equal(AGENT_RUNTIME_PHASE, 8)
  assert.equal(TASK_EVENTS.length, 19)
  for (const name of TASK_EVENTS) assert.equal(TASK_EVENT_SET.has(name), true)
})

test('TEST 1 Read homepage', async () => {
  const dir = await siteWorkspace()
  const result = await withIsolatedNpm(() => orch().runTask('Where is the homepage?', ids(dir, 'read1')))
  assert.equal(result.success, true, result.message)
  assert.equal(result.intent, 'ANALYZE')
  assert.ok(types(result).includes('TASK_STARTED'))
  assert.ok(types(result).includes('PROJECT_INSPECTED'))
  assert.ok(types(result).includes('PLAN_CREATED'))
  assert.ok(types(result).includes('FILE_READ'))
  assert.ok(types(result).includes('TASK_COMPLETED'))
  assert.ok(!types(result).includes('FILE_CHANGED'))
  assert.ok(!types(result).includes('BUILD_PASSED'))
})

test('TEST 2 Change H1', async () => {
  const dir = await siteWorkspace()
  const result = await withIsolatedNpm(() =>
    orch().runTask("Change the homepage H1 to 'Gossip Girls'.", ids(dir, 'h1')),
  )
  assert.equal(result.success, true, result.message)
  const data = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
  assert.equal(data.hero.title, 'Gossip Girls')
  const seq = types(result)
  assert.ok(seq.indexOf('TASK_STARTED') < seq.indexOf('PLAN_CREATED'))
  assert.ok(seq.indexOf('FILE_CHANGED') < seq.indexOf('BUILD_PASSED'))
  assert.ok(seq.includes('TASK_COMPLETED'))
})

test('TEST 3 Add component', async () => {
  const dir = await siteWorkspace()
  const result = await withIsolatedNpm(() => orch().runTask('Add a Hours section.', ids(dir, 'hours')))
  assert.equal(result.success, true, result.message)
  const app = await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8')
  assert.match(app, /id="hours"/)
  assert.match(app, /Hours/)
})

test('TEST 4 Modify CSS', async () => {
  const dir = await siteWorkspace()
  const result = await withIsolatedNpm(() => orch().runTask('Make the hero background navy.', ids(dir, 'css')))
  assert.equal(result.success, true, result.message)
  const css = await fs.readFile(path.join(dir, 'src/index.css'), 'utf8')
  assert.match(css, /#0f172a/)
})

test('TEST 5 Multi-file feature', async () => {
  const dir = await siteWorkspace()
  const result = await withIsolatedNpm(() =>
    orch().runTask('Add a booking note to the hero and footer.', ids(dir, 'multi')),
  )
  assert.equal(result.success, true, result.message)
  const app = await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8')
  const css = await fs.readFile(path.join(dir, 'src/index.css'), 'utf8')
  assert.match(app, /booking-note/)
  assert.match(css, /booking-note/)
  assert.ok(result.filesChanged.includes('src/App.jsx'))
  assert.ok(result.filesChanged.includes('src/index.css'))
})

test('TEST 6 Broken code → automatic repair', async () => {
  const dir = await siteWorkspace({ broken: true })
  const result = await withIsolatedNpm(() =>
    orch().runTask("Change the homepage H1 to 'Gossip Girls'.", ids(dir, 'repair')),
  )
  assert.equal(result.success, true, result.message)
  assert.ok(result.repairAttempts >= 1)
  assert.ok(types(result).includes('REPAIR_STARTED'))
  assert.ok(types(result).includes('REPAIR_COMPLETED'))
  const app = await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8')
  assert.ok(!app.includes('BROKEN'))
})

test('TEST 7 Runtime failure → automatic repair', async () => {
  const dir = await fs.mkdtemp(path.join(TMP, 'p8-runtime-'))
  await fs.writeFile(path.join(dir, 'index.html'), HTML.replace('</body>', '<script>throw new Error("boom-console")</script></body>'))
  const projectId = `runtime-${Date.now()}`
  const rt = createAgentRuntime({ llm: createLLMRouter({ providers: [new FakeProvider()] }) })
  const ctx = { userId: 'user1', projectId, workspaceDir: dir, permission: 'execute' }
  const preview = await startPreview({ projectId, workspaceDir: dir })
  try {
    const qa = await runBrowserValidation({ runtime: rt, ctx, projectId, workspaceDir: dir, url: preview.url })
    if (!qa.ran) {
      assert.equal(qa.skipped, true)
      return
    }
    assert.equal(qa.passed, false)
    const repaired = await repairBrowserFailure({ runtime: rt, ctx, qa, files: ['index.html'] })
    assert.equal(repaired.ok, true)
    const html = await fs.readFile(path.join(dir, 'index.html'), 'utf8')
    assert.doesNotMatch(html, /throw new Error/)
  } finally {
    await closeBrowserSession(projectId)
    await stopPreview({ projectId })
  }
})

test('TEST 8 Browser interaction', async () => {
  const dir = await fs.mkdtemp(path.join(TMP, 'p8-browser-'))
  await fs.writeFile(path.join(dir, 'index.html'), HTML)
  const projectId = `interact-${Date.now()}`
  const preview = await startPreview({ projectId, workspaceDir: dir })
  try {
    const qa = await runBrowserValidation({ projectId, workspaceDir: dir, url: preview.url })
    if (!qa.ran) {
      assert.equal(qa.skipped, true)
      assert.notEqual(qa.message, PASSED_MESSAGE)
      return
    }
    assert.equal(qa.passed, true, qa.message)
  } finally {
    await closeBrowserSession(projectId)
    await stopPreview({ projectId })
  }
})

test('TEST 9 Undo', async () => {
  const dir = await siteWorkspace()
  const ctx = ids(dir, 'undo1')
  await withIsolatedNpm(() => orch().runTask("Change the homepage H1 to 'Gossip Girls'.", ctx))
  const beforeUndo = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
  assert.equal(beforeUndo.hero.title, 'Gossip Girls')
  const undone = await withIsolatedNpm(() => orch().runTask('Undo that', ctx))
  assert.equal(undone.intent, 'UNDO')
  if (undone.success) {
    const after = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
    assert.equal(after.hero.title, 'Color that lasts')
    assert.ok(types(undone).includes('REPAIR_STARTED'))
    assert.ok(types(undone).includes('TASK_COMPLETED'))
  } else {
    assert.match(undone.message, /undo|checkpoint|git|permitted/i)
  }
})

test('TEST 10 Getvia integration', async () => {
  const dir = await fs.mkdtemp(path.join(TMP, 'p8-getvia-'))
  const result = await withIsolatedNpm(() =>
    runGetviaWebsiteJob({
      userId: 'user1',
      projectId: 'getvia1',
      businessId: 'biz1',
      workspaceDir: dir,
      keepPreview: false,
      runtime: createAgentRuntime({ llm: createLLMRouter({ providers: [new FakeProvider()] }) }),
      profile: {
        identity: { name: 'Gossip Girls', description: 'Salon in Bengaluru' },
        contact: { phone: '+91 98765 43210' },
        content: { coreServices: [{ title: 'Color' }] },
        reviews: { recent: [] },
        assets: { images: [] },
        raw: { business: { secret: 'nope' } },
      },
      prompt: 'Create a modern website for Gossip Girls using the Getvia business profile.',
    }),
  )
  assert.equal(result.ok, true, result.message)
  assert.equal(result.profile.raw, undefined)
  const json = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
  assert.equal(json.name, 'Gossip Girls')
  assert.equal(json.phone, '+91 98765 43210')
})

test('TEST 11 REDESIGN', async () => {
  const dir = await siteWorkspace()
  const result = await withIsolatedNpm(() => orch().runTask('Redesign the homepage', ids(dir, 'redesign')))
  assert.equal(result.success, true, result.message)
  assert.equal(result.intent, 'REDESIGN')
  const design = JSON.parse(await fs.readFile(path.join(dir, 'src/data/design.json'), 'utf8'))
  assert.ok(design.direction)
  const json = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
  assert.equal(json.name, 'LaFemina')
})

test('TEST 12 REIMAGINE', async () => {
  const dir = await siteWorkspace()
  const result = await withIsolatedNpm(() => orch().runTask('Reimagine the website', ids(dir, 'reimagine')))
  assert.equal(result.success, true, result.message)
  assert.equal(result.intent, 'REIMAGINE')
  assert.equal(result.design?.novelty, 5)
})

test('TEST 13 Cancellation', async () => {
  const dir = await siteWorkspace()
  const runtime = createAgentRuntime({ llm: createLLMRouter({ providers: [new FakeProvider()] }) })
  const orig = runtime.callTool.bind(runtime)
  runtime.callTool = async (name, input, ctx) => {
    if (name === 'patch_file' || name === 'write_file') {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return orig(name, input, ctx)
  }
  const ctrl = new AbortController()
  const pending = withIsolatedNpm(() =>
    runAgentTask({
      prompt: "Change the homepage H1 to 'Gossip Girls'.",
      runtime,
      signal: ctrl.signal,
      ...ids(dir, 'cancel1'),
    }),
  )
  setTimeout(() => ctrl.abort(), 20)
  const result = await pending
  assert.equal(result.success, false)
  assert.ok(result.state === 'CANCELLED' || /cancel/i.test(result.message))
  assert.ok((result.ops || []).some((row) => row.cancelled || row.type === 'TASK_FAILED'))
})

test('TEST 14 Stuck-task recovery', async () => {
  assert.equal(isStuckState('IMPLEMENTING'), true)
  assert.equal(isStuckState('REVIEWING'), false)
  const dir = await siteWorkspace()
  const runtime = createAgentRuntime({ llm: createLLMRouter({ providers: [new FakeProvider()] }) })
  const orig = runtime.callTool.bind(runtime)
  runtime.callTool = async (name, input, ctx) => {
    if (name === 'patch_file' || name === 'write_file') {
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
    return orig(name, input, ctx)
  }
  const result = await withIsolatedNpm(() =>
    runAgentTask({
      prompt: "Change the homepage H1 to 'Gossip Girls'.",
      runtime,
      stuckMs: 40,
      stuckIntervalMs: 15,
      ...ids(dir, 'stuck1'),
    }),
  )
  assert.equal(result.success, false)
  assert.equal(result.recovered, true)
  assert.match(result.message, /stuck and recovered/i)
})

test('SSE bus publishes only real events', () => {
  const seen = []
  const stop = subscribeTaskEvents('job-sse', (event) => seen.push(event))
  publishTaskEvent('job-sse', { type: 'TASK_STARTED', message: 'Started' })
  stop()
  assert.equal(seen.length, 1)
  assert.equal(seen[0].type, 'TASK_STARTED')
})

test('security: workspace isolation, commands, secrets, timeouts', async () => {
  const root = '/var/lib/ai-builder/workspaces/user_1/project_a'
  assert.equal(assertInsideWorkspace(root, '../etc/passwd').ok, false)
  assert.equal(assertAllowedCommand('rm -rf /').ok, false)
  assert.equal(assertAllowedCommand('npm run build').ok, true)
  assert.equal(assertWithinLimits({ elapsedMs: 99 * 60 * 1000 }).ok, false)
  const dir = await siteWorkspace()
  const runtime = createAgentRuntime({ llm: createLLMRouter({ providers: [new FakeProvider()] }) })
  const secret = await runtime.callTool('read_file', { path: '.env' }, { ...ids(dir, 'sec1'), permission: 'execute' })
  assert.equal(secret.success, false)
  assert.equal(secret.errorType, 'PERMISSION_DENIED')
})

test('watchdog only fires in stuck states', async () => {
  const task = { state: 'PLANNING', lastActivity: new Date(Date.now() - 1000).toISOString() }
  let fired = false
  const stop = startStuckWatchdog(task, { stuckMs: 10, intervalMs: 10, onStuck: () => { fired = true } })
  await new Promise((resolve) => setTimeout(resolve, 40))
  stop()
  assert.equal(fired, false)
})
