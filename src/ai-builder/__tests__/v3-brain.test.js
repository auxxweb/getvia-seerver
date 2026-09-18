import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import {
  classifyPromptClass,
  anonymizeSnippet,
  extractRequirements,
  matchRecipe,
  shouldSkipFromMemory,
  recordV3Outcome,
  decideCoder,
} from '../v3/index.js'
import { heuristicSufficient } from '../agents/codingAgent.js'
import { buildCodexDeveloperPrompt } from '../codex/prompt.js'

test('prompt classes keep create/redesign expensive and section work scoped', () => {
  assert.equal(classifyPromptClass('Create a salon website'), 'create-site')
  assert.equal(classifyPromptClass('Redesign the whole website'), 'redesign-site')
  assert.equal(classifyPromptClass('Redesign the about section, also include image'), 'scoped-design')
  assert.equal(classifyPromptClass('Redesign nav bar only'), 'scoped-design')
  assert.equal(
    classifyPromptClass('Contact form data submission should be posted to getvia enquiries'),
    'feature-enquiry',
  )
  assert.equal(classifyPromptClass('Add a WhatsApp button'), 'feature-whatsapp')
  assert.equal(classifyPromptClass('Change the homepage h1 to "Hello"'), 'copy-edit')
})

test('snippets never keep emails, phones, or URLs', () => {
  const snippet = anonymizeSnippet('Call +91 99999 12345 or mail owner@salon.test https://secret.example/x')
  assert.doesNotMatch(snippet, /99999/)
  assert.doesNotMatch(snippet, /owner@salon/)
  assert.doesNotMatch(snippet, /secret\.example/)
  assert.deepEqual(extractRequirements('Add WhatsApp and post the contact form to GetVia enquiries'), [
    'enquiry-to-getvia',
    'whatsapp',
  ])
})

test('shared recipes skip Codex only after repeated feature wins', () => {
  const create = matchRecipe(
    { recipes: [{ promptClass: 'create-site', category: 'salon', success: 9, fail: 0, skipCodex: true }] },
    { prompt: 'Create a salon website', category: 'Salon' },
  )
  assert.equal(shouldSkipFromMemory(create, { hasSite: true }), false)

  const weak = matchRecipe(
    { recipes: [{ promptClass: 'feature-whatsapp', category: 'salon', success: 1, fail: 0, skipCodex: true }] },
    { prompt: 'Add WhatsApp', category: 'Salon' },
  )
  assert.equal(shouldSkipFromMemory(weak, { hasSite: true }), false)

  const ready = matchRecipe(
    { recipes: [{ promptClass: 'feature-whatsapp', category: 'salon', success: 4, fail: 0, skipCodex: true }] },
    { prompt: 'Add a WhatsApp button', category: 'Salon' },
  )
  assert.equal(ready.promptClass, 'feature-whatsapp')
  assert.equal(shouldSkipFromMemory(ready, { hasSite: true }), true)
})

test('coder policy skips Codex for typed/heuristic jobs and keeps it for create', () => {
  assert.equal(decideCoder({ prompt: 'Create a premium salon website' }).useCodex, true)
  assert.equal(decideCoder({ prompt: 'Redesign the about section only' }).useCodex, true)
  const typed = decideCoder({
    prompt: 'Change the homepage h1 to "Hello"',
    typed: { written: ['src/data/business.json'] },
  })
  assert.equal(typed.useCodex, false)
  assert.equal(typed.useOpenAiLoop, false)
  assert.equal(typed.reason, 'typed-edit')
  const heuristic = decideCoder({ prompt: 'Add a WhatsApp button' })
  assert.equal(heuristic.useCodex, false)
  assert.equal(heuristic.reason, 'heuristic')
  assert.equal(
    decideCoder({ prompt: 'Contact form data submission should be posted to getvia enquiries' }).useCodex,
    true,
  )
  const memory = decideCoder({
    prompt: 'Contact form data submission should be posted to getvia enquiries',
    hasSite: true,
    match: {
      promptClass: 'feature-enquiry',
      confidence: 0.8,
      recipe: { success: 4, fail: 0, skipCodex: true, promptClass: 'feature-enquiry', category: 'salon' },
    },
  })
  assert.equal(memory.useCodex, false)
  assert.equal(memory.reason, 'shared-brain')
})

test('appended execution briefs do not disable cheap heuristics', () => {
  const packed = 'Add a WhatsApp button\n\nEXECUTION SCOPE: SINGLE SECTION only.\nTarget section(s): hero.'
  assert.equal(heuristicSufficient(packed), true)
  assert.equal(decideCoder({ prompt: packed }).useCodex, false)
})

test('V3 records anonymized recipes into the shared brain', async () => {
  const previous = process.env.AI_WORKSPACE_ROOT
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-v3-brain-'))
  const siteDir = path.join(root, 'user_a', 'project_b')
  await fs.mkdir(siteDir, { recursive: true })
  process.env.AI_WORKSPACE_ROOT = root
  try {
    await recordV3Outcome({
      workspaceDir: siteDir,
      prompt: 'Add WhatsApp for 9999999999 and email owner@hidden.test',
      intent: 'FEATURE',
      outcome: 'SUCCESS',
      designDirection: 'soft-luxury',
      category: 'Salon',
    })
    await recordV3Outcome({
      workspaceDir: siteDir,
      prompt: 'Add a WhatsApp button',
      intent: 'FEATURE',
      outcome: 'SUCCESS',
      designDirection: 'soft-luxury',
      category: 'Salon',
    })
    const raw = JSON.parse(await fs.readFile(path.join(root, '.getvia-brain', 'recipes.json'), 'utf8'))
    const recipe = raw.recipes.find((row) => row.promptClass === 'feature-whatsapp')
    assert.ok(recipe)
    assert.equal(recipe.success, 2)
    assert.equal(recipe.skipCodex, true)
    assert.doesNotMatch(JSON.stringify(raw), /9999999999/)
    assert.doesNotMatch(JSON.stringify(raw), /owner@hidden/)
    const match = matchRecipe(raw, { prompt: 'Add WhatsApp', category: 'Salon' })
    assert.equal(shouldSkipFromMemory(match, { hasSite: true }), true)
  } finally {
    if (previous == null) delete process.env.AI_WORKSPACE_ROOT
    else process.env.AI_WORKSPACE_ROOT = previous
  }
})

test('scoped Codex prompts stay shorter than full-site prompts', () => {
  const scoped = buildCodexDeveloperPrompt({
    prompt: 'Redesign the about section only',
    brief: 'x'.repeat(4000),
    allowedFiles: ['src/components/About.jsx'],
    scoped: true,
    profile: { identity: { name: 'LaFemina' } },
  })
  const full = buildCodexDeveloperPrompt({
    prompt: 'Create a premium salon website',
    brief: 'x'.repeat(4000),
    scoped: false,
    profile: { identity: { name: 'LaFemina' } },
  })
  assert.match(scoped, /SCOPED FILE ALLOWLIST/)
  assert.match(scoped, /Never invent/)
  assert.ok(scoped.length < full.length)
  assert.ok(scoped.length < 12000)
})
