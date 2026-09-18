import OpenAI from 'openai'
import { completeOpenAiJson } from '../openai/structuredOutput.js'
import { getWebsiteBuilderApiKey, isOpenAiConfigured } from '../openai/client.js'
import { shouldSkipOpenAiLlm, openAiSkipReason, hasFallbackLlm as fallbackFromEnv } from '../openai/availability.js'
import { resolveModelTier, routeV2Task } from '../openai/modelRouter.js'
import { getModelPreference } from '../openai/modelCatalog.js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const XAI_URL = 'https://api.x.ai/v1'

export function extractJsonObject(text) {
  const raw = String(text || '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = (fenced?.[1] || raw).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    return null
  }
}

function structuredUser(user, schemaName) {
  return `${String(user || '')}\n\nReturn only JSON for ${schemaName || 'result'}. No markdown.`
}

export class LLMProvider {
  constructor(name) {
    this.name = name
  }
  configured() {
    return false
  }
  modelFor(tier = 'medium') {
    return resolveModelTier(tier).model
  }
  async generate() {
    throw new Error(`${this.name} generate() is not implemented`)
  }
  async *stream() {
    const result = await this.generate(...arguments)
    if (result?.text) yield result.text
  }
  async generateStructured(args) {
    const generated = await this.generate({
      system: args.system,
      user: structuredUser(args.user, args.schemaName),
      tier: args.tier,
      signal: args.signal,
    })
    if (!generated.ok) {
      return { ok: false, skipped: Boolean(generated.skipped), data: null, code: generated.code, error: generated.error }
    }
    const data = extractJsonObject(generated.text)
    return { ok: Boolean(data), skipped: false, data, raw: generated.text, model: generated.model, provider: this.name }
  }
}

export class OpenAIProvider extends LLMProvider {
  constructor() {
    super('openai')
  }
  configured() {
    return isOpenAiConfigured()
  }
  async generate({ system, user, tier = 'medium', signal } = {}) {
    const result = await completeOpenAiJson({
      tier,
      system: system || 'You are a coding assistant. Return JSON { text }.',
      user,
      schemaName: 'generate',
      schema: { type: 'object', properties: { text: { type: 'string' } } },
      signal,
      soft: true,
    })
    return {
      ok: result.ok,
      skipped: result.skipped,
      text: result.data?.text || result.raw || '',
      error: result.error,
      code: result.code,
      model: result.model,
      provider: 'openai',
    }
  }
  async generateStructured(args) {
    const result = await completeOpenAiJson(args)
    return { ...result, provider: 'openai' }
  }
  async *stream({ system, user, tier = 'medium', signal } = {}) {
    if (!this.configured() || shouldSkipOpenAiLlm()) return
    const client = new OpenAI({ apiKey: getWebsiteBuilderApiKey() })
    const stream = await client.chat.completions.create(
      {
        model: this.modelFor(tier),
        messages: [
          { role: 'system', content: system || 'You are a coding assistant.' },
          { role: 'user', content: String(user || '') },
        ],
        stream: true,
      },
      { signal },
    )
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) yield delta
    }
  }
}

export class OpenAICompatibleProvider extends LLMProvider {
  constructor(name, { apiKeyEnv, baseUrlEnv, defaultBase, modelEnv } = {}) {
    super(name)
    this.apiKeyEnv = apiKeyEnv
    this.baseUrlEnv = baseUrlEnv
    this.defaultBase = defaultBase
    this.modelEnv = modelEnv
  }
  configured() {
    if (this.name === 'local') return Boolean(process.env.LOCAL_LLM_URL?.trim())
    return Boolean(process.env[this.apiKeyEnv]?.trim() && (process.env[this.baseUrlEnv]?.trim() || this.defaultBase))
  }
  apiKey() {
    return process.env[this.apiKeyEnv]?.trim() || (this.name === 'local' ? 'local' : '')
  }
  baseURL() {
    return (process.env[this.baseUrlEnv]?.trim() || this.defaultBase || '').replace(/\/$/, '')
  }
  modelFor(tier = 'medium') {
    return process.env[this.modelEnv]?.trim() || process.env.OPENAI_COMPAT_MODEL?.trim() || resolveModelTier(tier).model
  }
  client() {
    return new OpenAI({ apiKey: this.apiKey(), baseURL: this.baseURL() })
  }
  async generate({ system, user, tier = 'medium', signal } = {}) {
    if (!this.configured()) {
      return { ok: false, skipped: true, code: 'PROVIDER_NOT_CONFIGURED', text: '', provider: this.name }
    }
    try {
      const resp = await this.client().chat.completions.create(
        {
          model: this.modelFor(tier),
          messages: [
            { role: 'system', content: system || 'You are a coding assistant.' },
            { role: 'user', content: String(user || '') },
          ],
        },
        { signal },
      )
      const text = String(resp.choices?.[0]?.message?.content || '')
      return { ok: Boolean(text), skipped: false, text, model: resp.model, provider: this.name }
    } catch (err) {
      return {
        ok: false,
        skipped: true,
        code: 'PROVIDER_ERROR',
        error: String(err?.message || err),
        text: '',
        provider: this.name,
      }
    }
  }
  async generateStructured(args = {}) {
    const generated = await this.generate({
      system: `${args.system || ''}\nRespond with JSON only.`,
      user: structuredUser(args.user, args.schemaName),
      tier: args.tier,
      signal: args.signal,
    })
    if (!generated.ok) {
      return {
        ok: false,
        skipped: Boolean(generated.skipped),
        data: null,
        code: generated.code,
        error: generated.error,
        provider: this.name,
      }
    }
    const data = extractJsonObject(generated.text)
    return { ok: Boolean(data), skipped: false, data, raw: generated.text, model: generated.model, provider: this.name }
  }
  async *stream({ system, user, tier = 'medium', signal } = {}) {
    if (!this.configured()) return
    const stream = await this.client().chat.completions.create(
      {
        model: this.modelFor(tier),
        messages: [
          { role: 'system', content: system || 'You are a coding assistant.' },
          { role: 'user', content: String(user || '') },
        ],
        stream: true,
      },
      { signal },
    )
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) yield delta
    }
  }
}

export class AnthropicProvider extends LLMProvider {
  constructor({ fetchImpl } = {}) {
    super('anthropic')
    this.fetchImpl = fetchImpl || globalThis.fetch.bind(globalThis)
  }
  configured() {
    return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
  }
  modelFor(tier = 'medium') {
    const fallback = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514'
    if (tier === 'simple') return process.env.ANTHROPIC_SIMPLE_MODEL?.trim() || fallback
    if (tier === 'complex') return process.env.ANTHROPIC_COMPLEX_MODEL?.trim() || fallback
    return fallback
  }
  async messages({ system, user, tier = 'medium', signal, stream = false } = {}) {
    return this.fetchImpl(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.modelFor(tier),
        max_tokens: 4096,
        system: system || 'You are a coding assistant.',
        messages: [{ role: 'user', content: String(user || '') }],
        stream,
      }),
      signal,
    })
  }
  async generate({ system, user, tier = 'medium', signal } = {}) {
    if (!this.configured()) {
      return { ok: false, skipped: true, code: 'PROVIDER_NOT_CONFIGURED', text: '', provider: 'anthropic' }
    }
    try {
      const res = await this.messages({ system, user, tier, signal, stream: false })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        return {
          ok: false,
          skipped: true,
          code: 'PROVIDER_ERROR',
          error: payload?.error?.message || `Anthropic HTTP ${res.status}`,
          text: '',
          provider: 'anthropic',
        }
      }
      const text = (payload.content || []).map((part) => part.text || '').join('')
      return { ok: Boolean(text), skipped: false, text, model: payload.model, provider: 'anthropic' }
    } catch (err) {
      return {
        ok: false,
        skipped: true,
        code: 'PROVIDER_ERROR',
        error: String(err?.message || err),
        text: '',
        provider: 'anthropic',
      }
    }
  }
}

export class GrokProvider extends OpenAICompatibleProvider {
  constructor() {
    super('grok', {
      apiKeyEnv: 'XAI_API_KEY',
      baseUrlEnv: 'XAI_BASE_URL',
      defaultBase: XAI_URL,
      modelEnv: 'XAI_MODEL',
    })
  }
  configured() {
    return Boolean(process.env.XAI_API_KEY?.trim() || process.env.GROK_API_KEY?.trim())
  }
  apiKey() {
    return process.env.XAI_API_KEY?.trim() || process.env.GROK_API_KEY?.trim()
  }
  modelFor() {
    return process.env.XAI_MODEL?.trim() || process.env.GROK_MODEL?.trim() || 'grok-2-latest'
  }
}

export class LocalProvider extends OpenAICompatibleProvider {
  constructor() {
    super('local', {
      apiKeyEnv: 'LOCAL_LLM_API_KEY',
      baseUrlEnv: 'LOCAL_LLM_URL',
      modelEnv: 'LOCAL_LLM_MODEL',
    })
  }
  configured() {
    return Boolean(process.env.LOCAL_LLM_URL?.trim())
  }
  apiKey() {
    return process.env.LOCAL_LLM_API_KEY?.trim() || 'local'
  }
}

export function createLLMProviders() {
  return [
    new OpenAIProvider(),
    new AnthropicProvider(),
    new GrokProvider(),
    new OpenAICompatibleProvider('openrouter', {
      apiKeyEnv: 'OPENROUTER_API_KEY',
      baseUrlEnv: 'OPENROUTER_BASE_URL',
      defaultBase: 'https://openrouter.ai/api/v1',
      modelEnv: 'OPENROUTER_MODEL',
    }),
    new OpenAICompatibleProvider('openai-compatible', {
      apiKeyEnv: 'OPENAI_COMPAT_API_KEY',
      baseUrlEnv: 'OPENAI_COMPAT_BASE_URL',
      modelEnv: 'OPENAI_COMPAT_MODEL',
    }),
    new LocalProvider(),
  ]
}

export function listLLMProviders() {
  return createLLMProviders().map((p) => ({ name: p.name, configured: p.configured() }))
}

export function hasFallbackLlm() {
  return fallbackFromEnv()
}

export function activeLLMProviderName() {
  const forced = String(process.env.LLM_PROVIDER || '').trim().toLowerCase()
  if (forced) return forced
  if (isOpenAiConfigured() && !shouldSkipOpenAiLlm()) return 'openai'
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  if (process.env.XAI_API_KEY || process.env.GROK_API_KEY) return 'grok'
  if (process.env.OPENROUTER_API_KEY) return 'openrouter'
  if (process.env.OPENAI_COMPAT_API_KEY) return 'openai-compatible'
  if (process.env.LOCAL_LLM_URL) return 'local'
  if (isOpenAiConfigured()) return 'openai'
  return null
}

export function getLLMProvider() {
  const name = activeLLMProviderName() || 'openai'
  return (
    createLLMProviders().find((p) => p.name === name || (name === 'xai' && p.name === 'grok')) || new OpenAIProvider()
  )
}

export function providerChain() {
  const selected = String(getModelPreference()?.provider || process.env.LLM_PROVIDER || '')
    .trim()
    .toLowerCase()
  const all = createLLMProviders()
  const match = all.find((p) => p.name === selected || (selected === 'xai' && p.name === 'grok'))
  const envForced = Boolean(process.env.LLM_PROVIDER?.trim()) && !getModelPreference()?.provider
  if (envForced && match) return [match]
  if (match) return [match, ...all.filter((p) => p !== match)]
  const preferred = []
  if (!shouldSkipOpenAiLlm()) preferred.push(all.find((p) => p.name === 'openai'))
  preferred.push(...all.filter((p) => p.name !== 'openai'))
  if (shouldSkipOpenAiLlm()) preferred.push(all.find((p) => p.name === 'openai'))
  return preferred.filter(Boolean)
}

export async function completeWithProviders(args, { providers } = {}) {
  const preferred = getModelPreference()?.provider
  if (!providers && shouldSkipOpenAiLlm() && !fallbackFromEnv() && (!preferred || preferred === 'openai')) {
    return { ok: false, skipped: true, data: null, code: openAiSkipReason() || 'OPENAI_SKIPPED' }
  }
  const chain = providers || providerChain()
  let last = { ok: false, skipped: true, data: null, code: 'NO_PROVIDER' }
  for (const provider of chain) {
    if (!provider.configured()) continue
    const result = await provider.generateStructured(args)
    last = { ...result, provider: provider.name }
    if (result.ok) return last
    if (!result.skipped && args.soft === false) return last
  }
  return last
}

export function routeTask(kind) {
  return routeV2Task(kind)
}

export function resolveTier(tier) {
  return resolveModelTier(tier)
}
