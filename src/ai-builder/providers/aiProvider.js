import { listLLMProviders, activeLLMProviderName } from './llmProvider.js'
import { isOpenAiConfigured } from '../openai/client.js'

export { LLMProvider, getLLMProvider, listLLMProviders, activeLLMProviderName, completeWithProviders } from './llmProvider.js'

/**
 * Provider adapters. completeJson routes through LLMProvider (OpenAI, Anthropic, Grok, compatible).
 */
export class AIProvider {
  constructor(name) {
    this.name = name
  }
  async complete() {
    throw new Error('Not implemented')
  }
}

export class OpenAIProvider extends AIProvider {
  constructor() {
    super('openai')
  }
  configured() {
    return isOpenAiConfigured()
  }
}

export class AnthropicProvider extends AIProvider {
  constructor() {
    super('anthropic')
  }
  configured() {
    return Boolean(process.env.ANTHROPIC_API_KEY)
  }
}

export class OpenRouterProvider extends AIProvider {
  constructor() {
    super('openrouter')
  }
  configured() {
    return Boolean(process.env.OPENROUTER_API_KEY)
  }
}

export class LocalProvider extends AIProvider {
  constructor() {
    super('local')
  }
  configured() {
    return Boolean(process.env.LOCAL_LLM_URL)
  }
}

export function listProviderStatus() {
  return listLLMProviders()
}

export function activeProviderName() {
  return activeLLMProviderName()
}
