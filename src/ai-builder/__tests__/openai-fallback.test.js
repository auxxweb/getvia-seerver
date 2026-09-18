import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isOpenAiBillingError,
  markOpenAiUnavailable,
  openAiSkipReason,
  resetOpenAiAvailabilityForTests,
  shouldSkipOpenAiLlm,
} from '../openai/availability.js'
import { completeJson } from '../openai/structuredOutput.js'

test('classifies OpenAI billing and quota errors, not generic rate limits', () => {
  assert.equal(isOpenAiBillingError({ code: 'insufficient_quota' }), true)
  assert.equal(isOpenAiBillingError({ error: { code: 'insufficient_quota' } }), true)
  assert.equal(
    isOpenAiBillingError({ status: 429, message: 'You exceeded your current quota, please check your plan' }),
    true,
  )
  assert.equal(isOpenAiBillingError({ message: 'You exceeded your current quota' }), true)
  // Our own user-facing copy must not re-trigger a sticky billing lock.
  assert.equal(
    isOpenAiBillingError({ message: 'Website builder OpenAI credits are exhausted. Your change was not applied.' }),
    false,
  )
  assert.equal(isOpenAiBillingError({ status: 429, message: 'Rate limit reached for requests' }), false)
  assert.equal(isOpenAiBillingError({ status: 500, message: 'internal server error' }), false)
})

test('credits exhausted result detects OPENAI_QUOTA codes', async () => {
  const { isCreditsExhaustedResult } = await import('../openai/availability.js')
  assert.equal(isCreditsExhaustedResult({ code: 'OPENAI_QUOTA' }), true)
  assert.equal(isCreditsExhaustedResult({ code: 'AI_TOKENS_EMPTY' }), true)
  assert.equal(isCreditsExhaustedResult({ coder: { code: 'OPENAI_QUOTA' } }), true)
  assert.equal(isCreditsExhaustedResult({ code: 'CODEX_TURN_FAILED' }), false)
})

test('website builder prefers OPENAI_API_KEY_WEBSITE_BUILDER over OPENAI_API_KEY', async () => {
  const { getWebsiteBuilderApiKey, isOpenAiConfigured } = await import('../openai/client.js')
  const prevBuilder = process.env.OPENAI_API_KEY_WEBSITE_BUILDER
  const prevGeneral = process.env.OPENAI_API_KEY
  try {
    process.env.OPENAI_API_KEY = 'sk-general'
    process.env.OPENAI_API_KEY_WEBSITE_BUILDER = 'sk-builder'
    assert.equal(getWebsiteBuilderApiKey(), 'sk-builder')
    assert.equal(isOpenAiConfigured(), true)
    delete process.env.OPENAI_API_KEY_WEBSITE_BUILDER
    assert.equal(getWebsiteBuilderApiKey(), 'sk-general')
    delete process.env.OPENAI_API_KEY
    assert.equal(getWebsiteBuilderApiKey(), '')
    assert.equal(isOpenAiConfigured(), false)
  } finally {
    if (prevBuilder == null) delete process.env.OPENAI_API_KEY_WEBSITE_BUILDER
    else process.env.OPENAI_API_KEY_WEBSITE_BUILDER = prevBuilder
    if (prevGeneral == null) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = prevGeneral
  }
})

test('quota marks OpenAI skipped so the coding loop does not call the API', async () => {
  const previousSkip = process.env.AI_SKIP_CODING_LLM
  delete process.env.AI_SKIP_CODING_LLM
  resetOpenAiAvailabilityForTests()
  try {
    assert.equal(shouldSkipOpenAiLlm(), false)
    markOpenAiUnavailable('quota')
    assert.equal(shouldSkipOpenAiLlm(), true)
    assert.equal(openAiSkipReason(), 'quota')
    const skipped = await completeJson({
      system: 'x',
      user: 'y',
      soft: false,
    })
    assert.equal(skipped.skipped, true)
    assert.equal(skipped.code, 'quota')
  } finally {
    resetOpenAiAvailabilityForTests()
    if (previousSkip == null) delete process.env.AI_SKIP_CODING_LLM
    else process.env.AI_SKIP_CODING_LLM = previousSkip
  }
})

test('quota lock clears when the website-builder API key changes', async () => {
  const {
    markOpenAiUnavailable,
    openAiSkipReason,
    resetOpenAiAvailabilityForTests,
    shouldSkipOpenAiLlm,
  } = await import('../openai/availability.js')
  const prevBuilder = process.env.OPENAI_API_KEY_WEBSITE_BUILDER
  const prevSkip = process.env.AI_SKIP_CODING_LLM
  delete process.env.AI_SKIP_CODING_LLM
  resetOpenAiAvailabilityForTests()
  try {
    process.env.OPENAI_API_KEY_WEBSITE_BUILDER = 'sk-old-builder-key-aaaa'
    markOpenAiUnavailable('quota')
    assert.equal(shouldSkipOpenAiLlm(), true)
    assert.equal(openAiSkipReason(), 'quota')
    process.env.OPENAI_API_KEY_WEBSITE_BUILDER = 'sk-new-builder-key-bbbb'
    assert.equal(shouldSkipOpenAiLlm(), false)
    assert.equal(openAiSkipReason(), null)
  } finally {
    resetOpenAiAvailabilityForTests()
    if (prevBuilder == null) delete process.env.OPENAI_API_KEY_WEBSITE_BUILDER
    else process.env.OPENAI_API_KEY_WEBSITE_BUILDER = prevBuilder
    if (prevSkip == null) delete process.env.AI_SKIP_CODING_LLM
    else process.env.AI_SKIP_CODING_LLM = prevSkip
  }
})

test('AI_SKIP_CODING_LLM skips OpenAI without a quota mark', () => {
  const previousSkip = process.env.AI_SKIP_CODING_LLM
  process.env.AI_SKIP_CODING_LLM = '1'
  resetOpenAiAvailabilityForTests()
  try {
    assert.equal(shouldSkipOpenAiLlm(), true)
    assert.equal(openAiSkipReason(), 'AI_SKIP_CODING_LLM')
  } finally {
    resetOpenAiAvailabilityForTests()
    if (previousSkip == null) delete process.env.AI_SKIP_CODING_LLM
    else process.env.AI_SKIP_CODING_LLM = previousSkip
  }
})
