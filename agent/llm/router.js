import { createProviderAdapters, FakeProvider } from './adapters.js'
import { llmResult } from './result.js'

export const LLM_TASKS = Object.freeze({
  classification: { task: 'classification', tier: 'simple' },
  planning: { task: 'planning', tier: 'complex' },
  coding: { task: 'coding', tier: 'complex' },
  debugging: { task: 'debugging', tier: 'complex' },
  visual: { task: 'visual', tier: 'medium' },
  review: { task: 'review', tier: 'complex' },
})

function envProviderName() {
  return String(process.env.LLM_PROVIDER || '').trim().toLowerCase()
}

function envModel() {
  return String(process.env.LLM_MODEL || '').trim()
}

/**
 * Picks a configured adapter per task. New providers register here; orchestrators call the router only.
 */
export class LLMRouter {
  constructor({ providers } = {}) {
    this.providers = Array.isArray(providers) && providers.length ? providers : createProviderAdapters()
  }

  list() {
    return this.providers.map((p) => ({ name: p.name, configured: Boolean(p.configured?.()) }))
  }

  register(provider) {
    if (!provider?.name) throw new Error('Provider must have a name.')
    this.providers = [...this.providers.filter((p) => p.name !== provider.name), provider]
    return this
  }

  providerFor(task = 'coding') {
    const forced = envProviderName()
    if (forced === 'fake') {
      return this.providers.find((p) => p.name === 'fake') || new FakeProvider()
    }
    if (forced) {
      const match = this.providers.find((p) => p.name === forced || (forced === 'xai' && p.name === 'grok'))
      if (match) return match
    }
    return (
      this.providers.find((p) => p.configured?.() && p.name === 'openai') ||
      this.providers.find((p) => p.configured?.()) ||
      this.providers[0]
    )
  }

  route(task = 'coding') {
    const spec = LLM_TASKS[task] || LLM_TASKS.coding
    const provider = this.providerFor(task)
    const model = envModel() || provider?.modelFor?.(task) || ''
    return {
      task: spec.task,
      tier: spec.tier,
      provider: provider?.name || null,
      model,
      configured: Boolean(provider?.configured?.()),
    }
  }

  async complete(task, args = {}) {
    const routed = this.route(task)
    const provider = this.providerFor(task)
    if (!provider) {
      return llmResult({
        success: false,
        skipped: true,
        errorType: 'NO_PROVIDER',
        message: 'No LLM provider is registered.',
      })
    }
    const payload = { ...args, task: routed.task, tier: routed.tier }
    if (args.mode === 'structured' || args.schema || args.schemaName) {
      return { ...(await provider.structured(payload)), ...routed, provider: provider.name }
    }
    return { ...(await provider.generate(payload)), ...routed, provider: provider.name }
  }

  async generate(args = {}) {
    return this.complete(args.task || 'coding', args)
  }

  async structured(args = {}) {
    return this.complete(args.task || 'coding', { ...args, mode: 'structured' })
  }

  async generateCode(args = {}) {
    return this.complete('coding', args)
  }

  async analyze(args = {}) {
    return this.complete('classification', args)
  }

  async review(args = {}) {
    return this.complete('review', args)
  }

  async *stream(args = {}) {
    const provider = this.providerFor(args.task || 'coding')
    if (!provider?.stream) return
    yield* provider.stream({ ...args, task: args.task || 'coding' })
  }
}

export function createLLMRouter(options) {
  return new LLMRouter(options)
}
