import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createAgentRuntime } from '../runtime.js'
import { createLLMRouter, FakeProvider } from '../llm/index.js'
import { createOrchestrator } from '../orchestrator/index.js'
import { classifyIntent, INTENTS } from '../core/index.js'
import { TASK_STATES, canTransition } from '../state/index.js'
import { MAX_BUILD_REPAIRS } from '../execution/index.js'

const TMP = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp')

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

async function siteWorkspace({ broken = false, alwaysFail = false } = {}) {
  await fs.mkdir(TMP, { recursive: true })
  const dir = await fs.mkdtemp(path.join(TMP, 'orch-'))
  await fs.mkdir(path.join(dir, 'src/data'), { recursive: true })
  await fs.mkdir(path.join(dir, 'scripts'), { recursive: true })
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'salon-site',
      private: true,
      type: 'module',
      scripts: { build: alwaysFail ? 'node -e "process.exit(1)"' : 'node ./scripts/build-check.cjs' },
      dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
      devDependencies: { vite: '^6.0.0' },
    }),
  )
  await fs.writeFile(
    path.join(dir, 'scripts/build-check.cjs'),
    `const fs = require('fs')
const app = fs.readFileSync('src/App.jsx', 'utf8')
const data = fs.readFileSync('src/data/business.json', 'utf8')
if (app.includes('BROKEN') || data.includes('BROKEN')) {
  console.error('src/App.jsx: BROKEN marker')
  process.exit(1)
}
console.log('built')
`,
  )
  await fs.writeFile(
    path.join(dir, 'src/data/business.json'),
    JSON.stringify({
      name: 'LaFemina',
      hero: { title: 'Color that lasts', primaryCta: { label: 'Book', href: '#contact' } },
    }, null, 2),
  )
  await fs.writeFile(
    path.join(dir, 'src/App.jsx'),
    `import business from './data/business.json'

function Nav() {
  return (
    <header className="nav">
      <a className="brand" href="#top">{business.name}</a>
    </header>
  )
}

function Hero() {
  const hero = business.hero || {}
  return (
    <section id="hero" className="hero">
      <h1>{hero.title}</h1>
      <a className="btn primary" href={hero.primaryCta.href}>{hero.primaryCta.label}</a>
    </section>
  )
}

export default function App() {
  return (
    <div id="top" className="site">
      <Nav />
      <Hero />
      ${broken ? '// BROKEN' : ''}
    </div>
  )
}
`,
  )
  await fs.writeFile(path.join(dir, 'src/index.css'), '.btn { padding: 1rem; }\n.btn.primary { background: #111; }\n')
  await fs.writeFile(path.join(dir, 'src/main.jsx'), 'import App from \'./App.jsx\'\n')
  return dir
}

function ids(dir) {
  return { userId: 'user1', projectId: 'site1', workspaceDir: dir }
}

test('intent types cover the Phase 4 catalog', () => {
  assert.deepEqual(INTENTS, [
    'CREATE',
    'EDIT',
    'REDESIGN',
    'REIMAGINE',
    'FEATURE',
    'FIX',
    'DEBUG',
    'CONTENT',
    'SEO',
    'REFACTOR',
    'REMOVE',
    'UNDO',
    'ANALYZE',
  ])
  assert.equal(classifyIntent("Change the homepage H1 to 'Gossip Girls'.").intent, 'EDIT')
  assert.equal(classifyIntent('Add a WhatsApp button.').intent, 'FEATURE')
  assert.equal(classifyIntent('Redesign the homepage').intent, 'REDESIGN')
  assert.equal(classifyIntent('Reimagine the brand').intent, 'REIMAGINE')
  assert.equal(classifyIntent('Fix the broken navbar').intent, 'FIX')
  assert.equal(classifyIntent('Debug the console error').intent, 'DEBUG')
  assert.equal(classifyIntent('Improve SEO meta description').intent, 'SEO')
  assert.equal(classifyIntent('Refactor the hero component').intent, 'REFACTOR')
  assert.equal(classifyIntent('Remove the gallery').intent, 'REMOVE')
  assert.equal(classifyIntent('Undo the last change').intent, 'UNDO')
  assert.equal(classifyIntent('Where is the homepage?').intent, 'ANALYZE')
  assert.equal(classifyIntent('Create a new website for a salon').intent, 'CREATE')
  assert.ok(TASK_STATES.includes('IMPLEMENTING'))
  assert.equal(canTransition('BUILDING', 'REVIEWING'), true)
  assert.equal(canTransition('IDLE', 'COMPLETED'), false)
  assert.equal(MAX_BUILD_REPAIRS, 5)
})

test('Change the homepage H1 to Gossip Girls', async () => {
  const dir = await siteWorkspace()
  const result = await withIsolatedNpm(() =>
    orch().runTask("Change the homepage H1 to 'Gossip Girls'.", ids(dir)),
  )
  assert.equal(result.success, true, result.message)
  assert.equal(result.state, 'COMPLETED')
  assert.equal(result.intent, 'EDIT')
  assert.ok(result.phases.includes('OBSERVE'))
  assert.ok(result.phases.includes('THINK'))
  assert.ok(result.phases.includes('ACT'))
  assert.ok(result.phases.includes('VERIFY'))
  assert.ok(result.build?.ok)
  assert.ok(result.filesChanged.includes('src/data/business.json'))
  const data = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
  assert.equal(data.hero.title, 'Gossip Girls')
  const app = await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8')
  assert.match(app, /<h1>\{hero\.title\}<\/h1>/)
  assert.ok(result.plan.files.includes('src/App.jsx'))
})

test('Add a WhatsApp button', async () => {
  const dir = await siteWorkspace()
  const result = await withIsolatedNpm(() => orch().runTask('Add a WhatsApp button.', ids(dir)))
  assert.equal(result.success, true, result.message)
  assert.equal(result.state, 'COMPLETED')
  assert.equal(result.intent, 'FEATURE')
  assert.ok(result.build?.ok)
  const app = await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8')
  assert.match(app, /WhatsApp/)
  assert.match(app, /business\.whatsapp/)
  assert.doesNotMatch(app, /https:\/\/wa\.me\//)
  const data = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
  assert.notEqual(data.whatsapp, 'https://wa.me/')
  assert.ok(data.placeholders?.some((row) => row.field === 'whatsapp') || data.whatsapp)
  assert.ok(result.phases.includes('OBSERVE'))
  assert.ok(result.phases.includes('ACT'))
  assert.ok(result.phases.includes('VERIFY'))
})

test('build failure is repaired then verified', async () => {
  const dir = await siteWorkspace({ broken: true })
  const result = await withIsolatedNpm(() =>
    orch().runTask("Change the homepage H1 to 'Gossip Girls'.", ids(dir)),
  )
  assert.equal(result.success, true, result.message)
  assert.ok(result.repairAttempts >= 1)
  assert.ok(result.build?.ok)
  const app = await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8')
  assert.ok(!app.includes('BROKEN'))
  const data = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
  assert.equal(data.hero.title, 'Gossip Girls')
})

test('never reports success while the build is failing', async () => {
  const dir = await siteWorkspace({ alwaysFail: true })
  const result = await withIsolatedNpm(() =>
    orch().runTask("Change the homepage H1 to 'Gossip Girls'.", ids(dir)),
  )
  assert.equal(result.success, false)
  assert.equal(result.state, 'FAILED')
  assert.equal(result.build?.ok, false)
})
