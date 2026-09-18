import { LLMProvider, extractJsonObject } from './provider.js'
import { llmResult } from './result.js'
import {
  OpenAIProvider as LegacyOpenAI,
  AnthropicProvider as LegacyAnthropic,
  GrokProvider as LegacyGrok,
  OpenAICompatibleProvider as LegacyCompat,
  LocalProvider as LegacyLocal,
} from '../../src/ai-builder/providers/llmProvider.js'

function fromLegacyGenerate(providerName, result) {
  if (!result) {
    return llmResult({
      success: false,
      provider: providerName,
      skipped: true,
      errorType: 'PROVIDER_ERROR',
      message: 'Empty provider result.',
    })
  }
  const success = Boolean(result.ok && !result.skipped)
  return llmResult({
    success,
    text: result.text || '',
    model: result.model || '',
    provider: result.provider || providerName,
    skipped: Boolean(result.skipped),
    errorType: success ? null : result.code || 'PROVIDER_ERROR',
    message: result.error || result.message || (success ? '' : 'Provider failed.'),
  })
}

function fromLegacyStructured(providerName, result) {
  if (!result?.ok) {
    return llmResult({
      success: false,
      data: null,
      provider: result?.provider || providerName,
      skipped: Boolean(result?.skipped),
      errorType: result?.code || 'PROVIDER_ERROR',
      message: result?.error || result?.message || 'Structured generation failed.',
      extra: { raw: result?.raw || '' },
    })
  }
  return llmResult({
    success: true,
    data: result.data,
    text: result.raw || '',
    model: result.model || '',
    provider: result.provider || providerName,
    extra: { raw: result.raw || '' },
  })
}

class WrappedProvider extends LLMProvider {
  constructor(name, inner) {
    super(name)
    this.inner = inner
  }
  configured() {
    return Boolean(this.inner.configured?.())
  }
  modelFor(task = 'coding') {
    return this.inner.modelFor?.(task) || super.modelFor(task)
  }
  async generate(args = {}) {
    if (!this.configured()) {
      return llmResult({
        success: false,
        provider: this.name,
        skipped: true,
        errorType: 'PROVIDER_NOT_CONFIGURED',
        message: `${this.name} is not configured.`,
      })
    }
    const result = await this.inner.generate({
      system: args.system,
      user: args.user,
      tier: args.tier,
      signal: args.signal,
    })
    return fromLegacyGenerate(this.name, result)
  }
  async structured(args = {}) {
    if (!this.configured()) {
      return llmResult({
        success: false,
        provider: this.name,
        skipped: true,
        errorType: 'PROVIDER_NOT_CONFIGURED',
        message: `${this.name} is not configured.`,
      })
    }
    if (typeof this.inner.generateStructured === 'function') {
      return fromLegacyStructured(
        this.name,
        await this.inner.generateStructured({
          system: args.system,
          user: args.user,
          schemaName: args.schemaName,
          schema: args.schema,
          tier: args.tier,
          signal: args.signal,
          soft: true,
        }),
      )
    }
    return super.structured(args)
  }
  async *stream(args = {}) {
    if (!this.configured() || typeof this.inner.stream !== 'function') {
      const generated = await this.generate(args)
      if (generated.success && generated.text) yield generated.text
      return
    }
    for await (const chunk of this.inner.stream({
      system: args.system,
      user: args.user,
      tier: args.tier,
      signal: args.signal,
    })) {
      if (chunk) yield chunk
    }
  }
}

export class FakeProvider extends LLMProvider {
  constructor({ replies = {} } = {}) {
    super('fake')
    this.replies = replies
  }
  configured() {
    return true
  }
  modelFor() {
    return 'fake-model'
  }
  async generate({ user, task } = {}) {
    const text =
      this.replies[task] ||
      this.replies.generate ||
      `fake:${String(user || '').slice(0, 80)}`
    return llmResult({ success: true, text, model: 'fake-model', provider: 'fake' })
  }
  async structured({ schemaName } = {}) {
    const data = this.replies.structured || { schemaName: schemaName || 'result', ok: true }
    return llmResult({
      success: true,
      data,
      text: JSON.stringify(data),
      model: 'fake-model',
      provider: 'fake',
      extra: { raw: JSON.stringify(data) },
    })
  }
}

export class GeminiAdapter extends LLMProvider {
  constructor() {
    super('gemini')
  }
  configured() {
    return Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim())
  }
  async generate() {
    return llmResult({
      success: false,
      provider: 'gemini',
      skipped: true,
      errorType: 'PROVIDER_NOT_IMPLEMENTED',
      message: 'Gemini adapter is registered but not implemented yet.',
    })
  }
}

export function createProviderAdapters() {
  return [
    new WrappedProvider('openai', new LegacyOpenAI()),
    new WrappedProvider('anthropic', new LegacyAnthropic()),
    new WrappedProvider('grok', new LegacyGrok()),
    new WrappedProvider(
      'openrouter',
      new LegacyCompat('openrouter', {
        apiKeyEnv: 'OPENROUTER_API_KEY',
        baseUrlEnv: 'OPENROUTER_BASE_URL',
        defaultBase: 'https://openrouter.ai/api/v1',
        modelEnv: 'OPENROUTER_MODEL',
      }),
    ),
    new WrappedProvider(
      'openai-compatible',
      new LegacyCompat('openai-compatible', {
        apiKeyEnv: 'OPENAI_COMPAT_API_KEY',
        baseUrlEnv: 'OPENAI_COMPAT_BASE_URL',
        modelEnv: 'OPENAI_COMPAT_MODEL',
      }),
    ),
    new WrappedProvider('local', new LegacyLocal()),
    new GeminiAdapter(),
  ]
}

export { extractJsonObject, WrappedProvider }
