import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AGENT_NAME,
  FULL_MASTER_PROMPT,
  DESIGN_INTELLIGENCE_STAGES,
  buildCodingSystemPrompt,
  masterIntelligenceBrief,
  masterPlanTasks,
} from '../getvia/masterAgentPrompt.js'
import { planV2 } from '../v2/planner.js'
import { productBriefLines } from '../getvia/profileContract.js'

test('master prompt encodes GetVia intelligence role and source of truth', () => {
  assert.match(FULL_MASTER_PROMPT, /Getvia Website Intelligence/)
  assert.match(FULL_MASTER_PROMPT, /Never fabricate/)
  assert.match(FULL_MASTER_PROMPT, /USER EDITING/)
  assert.match(FULL_MASTER_PROMPT, /redesign about section/)
  assert.equal(AGENT_NAME, 'Getvia Website Intelligence')
  assert.ok(DESIGN_INTELLIGENCE_STAGES.includes('design_system'))
  assert.ok(DESIGN_INTELLIGENCE_STAGES.includes('review_and_correct'))
})

test('coding system prompt switches scoped vs site mode', () => {
  const site = buildCodingSystemPrompt({ scoped: false })
  const scoped = buildCodingSystemPrompt({ scoped: true })
  assert.match(site, /SITE \/ CREATE MODE/)
  assert.match(scoped, /SCOPED EDIT MODE/)
  assert.match(scoped, /ONLY the targeted section/)
  assert.match(site, /Never invent/)
  assert.match(site, /Design DNA/)
})

test('planner uses master tasks and scopes section redesigns', () => {
  const plan = planV2({
    prompt: 'redesign about section, also include image',
    profile: { identity: { name: 'LaFemina', category: 'Salon' } },
    hasSite: true,
    selectedElement: { site: true },
  })
  assert.equal(plan.scoped, true)
  assert.deepEqual(plan.scope.sections, ['about'])
  assert.ok(plan.tasks.some((t) => t.id === 'task-scope'))
  assert.ok(plan.intelligenceStages?.includes('hero'))
})

test('product brief includes intelligence appendix', () => {
  const lines = productBriefLines({ mode: 'REDESIGN', novelty: 3, scoped: false })
  assert.ok(lines.some((line) => /WEBSITE INTELLIGENCE/i.test(line)))
  const scoped = masterIntelligenceBrief({ mode: 'PRESERVE', scoped: true })
  assert.match(scoped, /named section only/)
  const tasks = masterPlanTasks({ intentType: 'CREATE', designDirection: 'editorial', sections: ['hero', 'about'] })
  assert.ok(tasks.some((t) => t.id === 'task-analyze'))
})
