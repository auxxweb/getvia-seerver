import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AnthropicProvider,
  GrokProvider,
  extractJsonObject,
  completeWithProviders,
  hasFallbackLlm,
} from '../providers/llmProvider.js'

test('extractJsonObject reads fenced and raw JSON', () => {
  assert.deepEqual(extractJsonObject('```json\n{"text":"ok"}\n```'), { text: 'ok' })
  assert.deepEqual(extractJsonObject('prefix {"a":1} suffix'), { a: 1 })
})

test('Anthropic generateStructured uses the Messages API', async () => {
  const previous = process.env.ANTHROPIC_API_KEY
  process.env.ANTHROPIC_API_KEY = 'test-anthropic'
  const provider = new AnthropicProvider({
    fetchImpl: async (url, init) => {
      assert.match(String(url), /api\.anthropic\.com\/v1\/messages/)
      const body = JSON.parse(init.body)
      assert.equal(body.messages[0].role, 'user')
      assert.ok(init.headers['x-api-key'])
      return {
        ok: true,
        json: async () => ({
          model: 'claude-sonnet-4-20250514',
          content: [{ type: 'text', text: '{"summary":"from-anthropic","files":[]}' }],
        }),
      }
    },
  })
  try {
    const result = await provider.generateStructured({
      system: 'Return JSON',
      user: 'hello',
      schemaName: 'isolated_files',
    })
    assert.equal(result.ok, true)
    assert.equal(result.provider, 'anthropic')
    assert.equal(result.data.summary, 'from-anthropic')
  } finally {
    if (previous == null) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = previous
  }
})

test('Grok adapter is OpenAI-compatible against api.x.ai', () => {
  const grok = new GrokProvider()
  assert.equal(grok.baseURL(), 'https://api.x.ai/v1')
  assert.equal(grok.modelFor(), process.env.XAI_MODEL?.trim() || process.env.GROK_MODEL?.trim() || 'grok-2-latest')
})

test('completeWithProviders falls through to Anthropic after OpenAI skip', async () => {
  const openai = {
    name: 'openai',
    configured: () => true,
    generateStructured: async () => ({ ok: false, skipped: true, code: 'quota', data: null }),
  }
  const anthropic = {
    name: 'anthropic',
    configured: () => true,
    generateStructured: async () => ({ ok: true, data: { text: 'from-fallback' }, skipped: false }),
  }
  const result = await completeWithProviders({ user: 'hi' }, { providers: [openai, anthropic] })
  assert.equal(result.ok, true)
  assert.equal(result.provider, 'anthropic')
  assert.equal(result.data.text, 'from-fallback')
})

test('hasFallbackLlm is true only with a non-OpenAI key', () => {
  const keys = ['ANTHROPIC_API_KEY', 'XAI_API_KEY', 'GROK_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_COMPAT_API_KEY', 'LOCAL_LLM_URL']
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  for (const key of keys) delete process.env[key]
  assert.equal(hasFallbackLlm(), false)
  process.env.ANTHROPIC_API_KEY = 'x'
  assert.equal(hasFallbackLlm(), true)
  for (const key of keys) {
    if (previous[key] == null) delete process.env[key]
    else process.env[key] = previous[key]
  }
})
