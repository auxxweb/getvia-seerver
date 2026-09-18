import { llmResult } from './result.js'

function extractJsonObject(text) {
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

/**
 * Provider-independent LLM interface. Orchestrators depend on this class, never on OpenAI/Anthropic SDKs.
 */
export class LLMProvider {
  constructor(name) {
    this.name = name
  }

  configured() {
    return false
  }

  modelFor(_task = 'coding') {
    return process.env.LLM_MODEL?.trim() || ''
  }

  async generate({ system, user, task, signal } = {}) {
    void system
    void user
    void task
    void signal
    return llmResult({
      success: false,
      provider: this.name,
      errorType: 'PROVIDER_NOT_IMPLEMENTED',
      message: `${this.name} generate() is not implemented.`,
      skipped: true,
    })
  }

  async *stream(args = {}) {
    const result = await this.generate(args)
    if (result.success && result.text) yield result.text
  }

  async structured(args = {}) {
    const generated = await this.generate({
      ...args,
      system: `${args.system || ''}\nRespond with JSON only.`.trim(),
    })
    if (!generated.success) return { ...generated, data: null }
    const data = extractJsonObject(generated.text)
    return llmResult({
      success: Boolean(data),
      text: generated.text,
      data,
      model: generated.model,
      provider: this.name,
      errorType: data ? null : 'INVALID_JSON',
      message: data ? '' : 'Model did not return JSON.',
    })
  }

  async generateCode(args = {}) {
    return this.generate({ ...args, task: args.task || 'coding' })
  }

  async analyze(args = {}) {
    return this.generate({ ...args, task: args.task || 'classification' })
  }

  async review(args = {}) {
    return this.generate({ ...args, task: args.task || 'review' })
  }
}

export { extractJsonObject }
