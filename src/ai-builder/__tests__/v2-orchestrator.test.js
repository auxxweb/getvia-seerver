import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { analyzeIntent } from '../v2/intentAnalyzer.js'
import { createStateMachine, canTransition } from '../v2/stateMachine.js'
import { structuralQa } from '../v2/structuralQa.js'
import { reviewAgent, completionMessage } from '../v2/reviewAgent.js'
import { planV2 } from '../v2/planner.js'
import { authorizeTool } from '../v2/toolRegistry.js'
import { routeV2Task } from '../openai/modelRouter.js'
import { runIsolatedWebsiteJob } from '../jobs/isolatedWebsiteJob.js'
import { applyHeuristicBusinessEdits } from '../agents/codingAgent.js'
import { createCheckpoint, restoreCheckpoint } from '../v2/checkpoints.js'
import { resolveUserFacingStep } from '../constants.js'

test('intent analyzer classifies create, design, feature, debug, undo', () => {
  assert.equal(analyzeIntent('Create a salon website').type, 'CREATE')
  assert.equal(analyzeIntent('Make the hero dark', { hasSite: true }).type, 'DESIGN')
  assert.equal(analyzeIntent('Add pricing', { hasSite: true }).type, 'FEATURE')
  assert.equal(analyzeIntent('The mobile menu is broken', { hasSite: true }).type, 'DEBUG')
  assert.equal(analyzeIntent('Improve SEO', { hasSite: true }).type, 'SEO')
  assert.equal(analyzeIntent('Make it faster', { hasSite: true }).type, 'PERFORMANCE')
  assert.equal(analyzeIntent('Undo the last change', { hasSite: true }).type, 'UNDO')
  assert.equal(
    analyzeIntent('Find the homepage component and tell me which file contains the main H1. Do not modify anything.', {
      hasSite: true,
    }).type,
    'INSPECT',
  )
})

test('V2 state machine rejects invalid transitions', () => {
  const machine = createStateMachine('IDLE')
  machine.transition('ANALYZING')
  machine.transition('PLANNING')
  assert.equal(canTransition('PLANNING', 'COMPLETED'), true)
  machine.transition('DESIGNING')
  assert.throws(() => machine.transition('COMPLETED'))
})

test('legacy and review steps map onto the visible V2 catalog', () => {
  assert.equal(resolveUserFacingStep('ISOLATED_WEBSITE', 'emma'), 'implement')
  assert.equal(resolveUserFacingStep('ISOLATED_WEBSITE', 'review'), 'review')
  assert.equal(resolveUserFacingStep('ISOLATED_WEBSITE', 'unknown'), 'understanding')
})

test('structural QA rejects lorem ipsum and missing hero', () => {
  const bad = structuralQa({ name: 'X', sections: ['about'], about: { body: 'Lorem ipsum dolor sit amet' } })
  assert.equal(bad.approved, false)
  const ok = structuralQa({
    name: 'LaFemina',
    sections: ['hero', 'services', 'contact'],
    hero: { title: 'LaFemina', primaryCta: { label: 'Book', href: '#contact' } },
  })
  assert.equal(ok.approved, true)
})

test('review approves when visual QA is skipped after a live preview', () => {
  const review = reviewAgent({
    build: { ok: true },
    preview: { ok: true },
    structural: { approved: true, issues: [] },
    visual: { status: 'skipped', approved: true },
    browser: { status: 'skipped' },
    implement: { ok: true },
  })
  assert.equal(review.approved, true)
  assert.equal(review.visualSkipped, true)
  const message = completionMessage({ review, preview: { ok: true } })
  assert.match(message, /preview are ready/i)
})

test('review never approves when visual QA is unavailable', () => {
  const review = reviewAgent({
    build: { ok: true, skipped: true },
    preview: { ok: false, skipped: true },
    structural: { approved: true, issues: [] },
    visual: { status: 'unavailable', approved: false },
    browser: { status: 'unavailable' },
    implement: { ok: true },
  })
  assert.equal(review.approved, false)
  assert.equal(review.visualUnavailable, true)
  const message = completionMessage({ review, preview: { ok: false, skipped: true } })
  assert.equal(/successfully/i.test(message), false)
  assert.match(message, /browser checks could not run/i)
})

test('planner maps salon + pricing without writing application code', () => {
  const plan = planV2({
    prompt: 'Create a premium website for a salon and add pricing',
    profile: { identity: { name: 'LaFemina', category: 'Salon' } },
    hasSite: false,
  })
  assert.equal(plan.type, 'CREATE')
  assert.equal(plan.category, 'salon')
  assert.ok(plan.sections.includes('pricing') || plan.tasks.some((t) => /pricing|section/i.test(t.description)))
  assert.ok(!plan.heuristic?.files)
})

test('tool registry blocks unknown tools and empty ownership', () => {
  assert.equal(authorizeTool({ tool: 'rm_rf', userId: 'a', projectId: 'b' }).ok, false)
  assert.equal(authorizeTool({ tool: 'run_build' }).ok, false)
  assert.equal(authorizeTool({ tool: 'run_build', userId: 'owner1', projectId: 'site1' }).ok, true)
  assert.equal(authorizeTool({ tool: 'search_design_resources', userId: 'owner1', projectId: 'site1' }).ok, true)
  assert.equal(authorizeTool({ tool: 'research_design_practices', userId: 'owner1', projectId: 'site1' }).ok, true)
})

test('model router stays configuration-driven', () => {
  const routed = routeV2Task('classification')
  assert.equal(routed.tier, 'simple')
  assert.ok(routed.model)
})

test('heuristic feature edits add pricing and WhatsApp without dropping existing buttons', () => {
  const next = applyHeuristicBusinessEdits(
    {
      phone: '9999999999',
      sections: ['hero', 'services', 'contact'],
      services: [{ name: 'Cut', description: 'Signature cut', price: '₹900' }],
      hero: { extraButtons: [{ label: 'Shop New Arrivals', href: '#products' }] },
    },
    'Add a pricing section and WhatsApp booking',
  )
  assert.ok(next.sections.includes('pricing'))
  assert.ok(next.hero.extraButtons.some((b) => /shop new arrivals/i.test(b.label)))
  assert.ok(next.hero.extraButtons.some((b) => /whatsapp/i.test(b.label)))
  assert.match(next.whatsapp, /wa\.me\/9999999999/)
})

test('V2 isolated job does not claim visual pass when Playwright is skipped', async () => {
  const previous = {
    runtime: process.env.AI_ISOLATED_RUNTIME,
    skipNpm: process.env.AI_SKIP_WORKSPACE_NPM,
    skipLlm: process.env.AI_SKIP_CODING_LLM,
    skipSync: process.env.AI_SKIP_WEBSITE_STATE_SYNC,
    root: process.env.AI_WORKSPACE_ROOT,
    preview: process.env.PREVIEW_ENABLED,
    pw: process.env.PLAYWRIGHT_VALIDATION,
  }
  process.env.AI_ISOLATED_RUNTIME = '1'
  process.env.AI_SKIP_WORKSPACE_NPM = '1'
  process.env.AI_SKIP_CODING_LLM = '1'
  process.env.AI_SKIP_WEBSITE_STATE_SYNC = '1'
  process.env.AI_WORKSPACE_ROOT = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-v2-'))
  delete process.env.PREVIEW_ENABLED
  delete process.env.PLAYWRIGHT_VALIDATION
  try {
    const result = await runIsolatedWebsiteJob({
      userId: 'ownerv2',
      projectId: 'sitev2',
      prompt: 'Create a premium modern salon website',
      profile: {
        identity: { name: 'LaFemina', category: 'Salon', description: 'Hair and beauty' },
        location: { city: 'Pune' },
        contact: { phone: '9999999999' },
        content: { coreServices: [{ name: 'Cut', description: 'Signature cut' }] },
      },
    })
    assert.equal(result.ok, true, result.message)
    assert.equal(result.stages.visual.status, 'skipped')
    assert.equal(/visual QA passed/i.test(result.message), false)
    assert.match(result.message || '', /skipped|preview/i)
    const tokens = await fs.readFile(
      path.join(process.env.AI_WORKSPACE_ROOT, 'user_ownerv2', 'project_sitev2', 'src/design-system/tokens.js'),
      'utf8',
    )
    assert.match(tokens, /look/)
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const envKey = {
        runtime: 'AI_ISOLATED_RUNTIME',
        skipNpm: 'AI_SKIP_WORKSPACE_NPM',
        skipLlm: 'AI_SKIP_CODING_LLM',
        skipSync: 'AI_SKIP_WEBSITE_STATE_SYNC',
        root: 'AI_WORKSPACE_ROOT',
        preview: 'PREVIEW_ENABLED',
        pw: 'PLAYWRIGHT_VALIDATION',
      }[key]
      if (value == null) delete process.env[envKey]
      else process.env[envKey] = value
    }
  }
})

test('checkpoints restore previous business.json', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-cp-'))
  await fs.mkdir(path.join(dir, 'src/data'), { recursive: true })
  await fs.writeFile(path.join(dir, 'src/data/business.json'), '{"name":"A"}\n')
  await createCheckpoint(dir, { prompt: 'before' })
  await fs.writeFile(path.join(dir, 'src/data/business.json'), '{"name":"B"}\n')
  const restored = await restoreCheckpoint(dir)
  assert.equal(restored.ok, true)
  const data = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
  assert.equal(data.name, 'A')
})
