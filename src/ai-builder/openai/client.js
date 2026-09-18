import OpenAI from 'openai'
import { HttpError } from '../../middleware/errorHandler.js'
import { AIUsage } from '../../models/AIUsage.js'
import { getUsageContext } from './usageContext.js'
import { anonymizePromptSnippet, estimateCostUsd, parseTokenUsage } from './usagePricing.js'

/**
 * API key for AI website builder (Codex, coding loop, design LLM).
 * Prefer OPENAI_API_KEY_WEBSITE_BUILDER; fall back to OPENAI_API_KEY for older setups.
 * General product AI (insights, copy helpers) should keep using OPENAI_API_KEY directly.
 */
export function getWebsiteBuilderApiKey() {
  return String(
    process.env.OPENAI_API_KEY_WEBSITE_BUILDER?.trim() || process.env.OPENAI_API_KEY?.trim() || '',
  )
}

export function isOpenAiConfigured() {
  return Boolean(getWebsiteBuilderApiKey())
}

export function getOpenAiClient() {
  const apiKey = getWebsiteBuilderApiKey()
  if (!apiKey) {
    throw new HttpError(
      503,
      'Website builder AI is not configured. Set OPENAI_API_KEY_WEBSITE_BUILDER on the server.',
    )
  }
  return new OpenAI({ apiKey })
}

export async function recordUsage({ userId, businessId, siteId, jobId, model, operation, usage, prompt } = {}) {
  const ctx = getUsageContext()
  const ownerId = userId || ctx.userId
  const bizId = businessId || ctx.businessId
  if (!ownerId || !bizId) return null
  const parsed = parseTokenUsage(usage)
  const estimatedCostUsd = estimateCostUsd(model, parsed.inputTokens, parsed.outputTokens, parsed.cachedInputTokens, operation)
  try {
    return await AIUsage.create({
      userId: ownerId,
      businessId: bizId,
      siteId: siteId || ctx.siteId || null,
      jobId: jobId || ctx.jobId || null,
      model: model || '',
      operation: operation || '',
      inputTokens: parsed.inputTokens,
      outputTokens: parsed.outputTokens,
      estimatedCostUsd,
      promptSnippet: anonymizePromptSnippet(prompt || ctx.prompt || ''),
    })
  } catch {
    return null
  }
}
