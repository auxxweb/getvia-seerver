import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import {
  emptyLearning,
  recordRunLearning,
  readLearning,
  preferredDirectionFromLearning,
  applyLearningToPlan,
  buildLearningPromptAppendix,
} from '../learning/index.js'
import { planV2 } from '../v2/planner.js'

test('learning records wins and prefers successful design directions', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-learn-'))
  await recordRunLearning({
    workspaceDir: dir,
    prompt: 'Make my salon look like luxury fashion',
    intent: 'DESIGN',
    outcome: 'SUCCESS',
    designDirection: 'soft-luxury',
    category: 'Salon',
    gates: { build: true, runtime: true, visual: true, review: true },
  })
  await recordRunLearning({
    workspaceDir: dir,
    prompt: 'Try brutalist',
    intent: 'DESIGN',
    outcome: 'FAILED',
    designDirection: 'asymmetric',
    category: 'Salon',
    failedStage: 'BUILDING',
    errors: ['Unexpected token'],
  })
  const learning = await readLearning(dir)
  assert.ok(learning.runs.length >= 2)
  assert.equal(preferredDirectionFromLearning(learning, { category: 'Salon' }), 'soft-luxury')
  assert.ok(learning.lessons.some((l) => l.kind === 'prefer'))
  assert.ok(learning.lessons.some((l) => l.kind === 'repair'))
  const appendix = buildLearningPromptAppendix(learning, {
    prompt: 'Make it more premium',
    intent: 'DESIGN',
    category: 'Salon',
  })
  assert.match(appendix, /SELF-LEARNING/)
  assert.match(appendix, /soft-luxury/)
})

test('planner applies learned direction into plan tasks', async () => {
  const learning = emptyLearning()
  learning.promptWins = [{ promptSnippet: 'luxury salon', direction: 'soft-luxury', category: 'Salon', intent: 'DESIGN' }]
  learning.stats.byDirection = { 'soft-luxury': { success: 3, fail: 0, partial: 0 } }
  learning.lessons = [
    { id: 'repair:building', kind: 'repair', text: 'Previous DESIGN run failed at BUILDING. Inspect and fix that stage before expanding scope.', weight: 2 },
  ]
  const plan = planV2({
    prompt: 'Make my website look completely different',
    profile: { identity: { name: 'LaFemina', category: 'Salon' } },
    hasSite: true,
    learning,
  })
  assert.equal(plan.learnedDirection, 'soft-luxury')
  assert.ok(plan.tasks.some((t) => t.type === 'repair'))
  const applied = applyLearningToPlan({ type: 'DESIGN', tasks: [], designDirection: 'neo-minimal' }, learning, {
    category: 'Salon',
    prompt: 'redesign',
  })
  assert.equal(applied.learnedDirection, 'soft-luxury')
})

test('negative follow-up strengthens avoid lessons', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-learn-neg-'))
  await recordRunLearning({
    workspaceDir: dir,
    prompt: 'Make it editorial',
    intent: 'DESIGN',
    outcome: 'SUCCESS',
    designDirection: 'editorial',
    category: 'Boutique',
  })
  await recordRunLearning({
    workspaceDir: dir,
    prompt: 'Fix this, I do not like the look',
    intent: 'EDIT',
    outcome: 'PARTIAL',
    designDirection: 'editorial',
    category: 'Boutique',
  })
  const learning = await readLearning(dir)
  assert.ok(learning.lessons.some((l) => /User corrected/i.test(l.text)))
})
