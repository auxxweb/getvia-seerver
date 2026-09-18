import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isAllowedOpenAiModel,
  modelCatalogForClient,
  normalizeSpeed,
  openaiModelForSpeed,
  runWithModelPreference,
  sanitizeModelSelection,
} from '../openai/modelCatalog.js'
import { isVisionCapableModel, resolveModelTier, resolveVisionModel, routeV2Task, getModelConfig } from '../openai/modelRouter.js'
import { providerChain } from '../providers/llmProvider.js'

test('speed aliases map fast/simple and slow/complex', () => {
  assert.equal(normalizeSpeed('fast'), 'fast')
  assert.equal(normalizeSpeed('simple'), 'fast')
  assert.equal(normalizeSpeed('slow'), 'slow')
  assert.equal(normalizeSpeed('complex'), 'slow')
  assert.equal(openaiModelForSpeed('fast'), 'gpt-4o-mini')
  assert.equal(openaiModelForSpeed('slow'), 'gpt-5.6-sol')
})

test('sanitizeModelSelection allowlists OpenAI models from mini to GPT-5.6 Sol', () => {
  assert.equal(isAllowedOpenAiModel('gpt-4o-mini'), true)
  assert.equal(isAllowedOpenAiModel('gpt-5.6-sol'), true)
  assert.equal(isAllowedOpenAiModel('gpt-evil'), false)
  assert.equal(isAllowedOpenAiModel('../etc/passwd'), false)
  const rejected = sanitizeModelSelection({ provider: 'openai', speed: 'slow', model: 'not-a-model;rm -rf' })
  assert.equal(rejected.provider, 'openai')
  assert.equal(rejected.speed, 'slow')
  assert.equal(rejected.model, 'gpt-5.6-sol')
  const picked = sanitizeModelSelection({ provider: 'openai', speed: 'fast', model: 'gpt-5-mini' })
  assert.equal(picked.model, 'gpt-5-mini')
  const unknownProvider = sanitizeModelSelection({ provider: 'drop-table', speed: 'medium' })
  assert.equal(unknownProvider.provider, 'openai')
})

test('owner-selected OpenAI model is used for coding, not for cheap classification', () => {
  const routed = runWithModelPreference({ provider: 'openai', speed: 'slow', model: 'gpt-5.6-sol' }, () =>
    routeV2Task('coding'),
  )
  assert.equal(routed.model, 'gpt-5.6-sol')
  assert.equal(routed.speed, 'slow')
  const classified = runWithModelPreference({ provider: 'openai', speed: 'slow', model: 'gpt-5.6-sol' }, () =>
    routeV2Task('classification'),
  )
  assert.equal(classified.tier, 'simple')
  assert.equal(classified.model, 'gpt-4o-mini')
  const fast = runWithModelPreference({ provider: 'openai', speed: 'fast', model: 'gpt-4o-mini' }, () =>
    resolveModelTier('complex'),
  )
  assert.equal(fast.model, 'gpt-4o-mini')
})

test('OPENAI_MODEL does not poison simple or medium tiers', () => {
  const previous = {
    model: process.env.OPENAI_MODEL,
    simple: process.env.OPENAI_SIMPLE_MODEL,
    medium: process.env.OPENAI_MEDIUM_MODEL,
    complex: process.env.OPENAI_COMPLEX_MODEL,
  }
  process.env.OPENAI_MODEL = 'gpt-5.6-sol'
  delete process.env.OPENAI_SIMPLE_MODEL
  delete process.env.OPENAI_MEDIUM_MODEL
  delete process.env.OPENAI_COMPLEX_MODEL
  try {
    const cfg = getModelConfig()
    assert.equal(cfg.simple, 'gpt-4o-mini')
    assert.equal(cfg.medium, 'gpt-4o')
    assert.equal(cfg.complex, 'gpt-5.6-sol')
    assert.equal(routeV2Task('classification').model, 'gpt-4o-mini')
    assert.equal(routeV2Task('review').model, 'gpt-4o-mini')
    assert.equal(routeV2Task('coding').model, 'gpt-5.6-sol')
  } finally {
    if (previous.model == null) delete process.env.OPENAI_MODEL
    else process.env.OPENAI_MODEL = previous.model
    if (previous.simple == null) delete process.env.OPENAI_SIMPLE_MODEL
    else process.env.OPENAI_SIMPLE_MODEL = previous.simple
    if (previous.medium == null) delete process.env.OPENAI_MEDIUM_MODEL
    else process.env.OPENAI_MEDIUM_MODEL = previous.medium
    if (previous.complex == null) delete process.env.OPENAI_COMPLEX_MODEL
    else process.env.OPENAI_COMPLEX_MODEL = previous.complex
  }
})

test('vision tasks keep a vision-capable model even when the owner picked GPT-5.6 Sol', () => {
  const previous = process.env.OPENAI_VISION_MODEL
  process.env.OPENAI_VISION_MODEL = 'gpt-4o'
  try {
    const vision = runWithModelPreference({ provider: 'openai', speed: 'slow', model: 'gpt-5.6-sol' }, () =>
      routeV2Task('vision'),
    )
    assert.equal(vision.model, 'gpt-4o')
    assert.equal(isVisionCapableModel('gpt-5.6-sol'), false)
    assert.equal(isVisionCapableModel('gpt-4o'), true)
    assert.equal(resolveVisionModel().startsWith('gpt-4'), true)
  } finally {
    if (previous == null) delete process.env.OPENAI_VISION_MODEL
    else process.env.OPENAI_VISION_MODEL = previous
  }
})

test('model catalog exposes speeds and OpenAI models for the builder UI', () => {
  const catalog = modelCatalogForClient({
    providers: [{ name: 'openai', configured: true }],
    active: 'openai',
  })
  assert.deepEqual(
    catalog.speeds.map((row) => row.id),
    ['fast', 'medium', 'slow'],
  )
  assert.equal(catalog.openaiModels.at(-1).id, 'gpt-5.6-sol')
  assert.equal(catalog.defaults.provider, 'openai')
})

test('provider chain puts the selected provider first', () => {
  const names = runWithModelPreference({ provider: 'anthropic', speed: 'medium' }, () =>
    providerChain().map((row) => row.name),
  )
  assert.equal(names[0], 'anthropic')
})
