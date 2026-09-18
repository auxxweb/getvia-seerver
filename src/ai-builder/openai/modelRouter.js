import { DEFAULT_MODEL_BY_TIER, MODEL_TIERS } from '../constants.js'
import {
  getModelPreference,
  internalTierFromSpeed,
  isAllowedOpenAiModel,
  normalizeSpeed,
} from './modelCatalog.js'

const CHEAP_TASK_KINDS = new Set(['classification', 'content', 'review'])

export function getModelConfig() {
  return {
    simple: process.env.OPENAI_SIMPLE_MODEL?.trim() || DEFAULT_MODEL_BY_TIER.simple,
    medium: process.env.OPENAI_MEDIUM_MODEL?.trim() || DEFAULT_MODEL_BY_TIER.medium,
    complex: process.env.OPENAI_COMPLEX_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL_BY_TIER.complex,
  }
}

const VISION_MODEL_IDS = new Set(['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-5-mini', 'gpt-5'])

export function isVisionCapableModel(model) {
  const id = String(model || '').trim()
  if (!id || /\bsol\b/i.test(id)) return false
  return VISION_MODEL_IDS.has(id)
}

export function resolveVisionModel({ model: explicit } = {}) {
  const env = process.env.OPENAI_VISION_MODEL?.trim()
  if (isVisionCapableModel(explicit)) return explicit
  if (isVisionCapableModel(env)) return env
  const pref = getModelPreference()?.model
  if (isVisionCapableModel(pref)) return pref
  const medium = getModelConfig().medium
  if (isVisionCapableModel(medium)) return medium
  const simple = getModelConfig().simple
  if (isVisionCapableModel(simple)) return simple
  return 'gpt-4o-mini'
}

export function resolveModelTier(requested, { model: explicitModel } = {}) {
  const pref = getModelPreference()
  const cfg = getModelConfig()
  const speed = normalizeSpeed(requested || pref?.speed)
  const tier = MODEL_TIERS.includes(requested) ? requested : internalTierFromSpeed(speed)
  const preferredModel = explicitModel || pref?.model
  if (isAllowedOpenAiModel(preferredModel) && (!pref?.provider || pref.provider === 'openai')) {
    return { tier, speed, model: preferredModel, provider: 'openai' }
  }
  return {
    tier,
    speed,
    model: cfg[tier] || cfg.medium,
    provider: pref?.provider || 'openai',
  }
}

export function inferTierFromTask({ type, promptLength = 0, fullSite = false } = {}) {
  if (type === 'DESIGNER_EDIT' || type === 'MANUAL_EDIT') return 'simple'
  if (fullSite || type === 'WEBSITE_PLANNING' || type === 'WEBSITE_BUILD' || type === 'REPAIR') return 'complex'
  if (promptLength > 800) return 'medium'
  return 'medium'
}

/** Cheap kinds stay on mini/4o. Owner Sol/slow pref applies only to coding, architecture, and debug. */
export function routeV2Task(kind) {
  if (kind === 'vision') {
    return { kind, tier: 'medium', speed: 'medium', model: resolveVisionModel(), provider: 'openai' }
  }
  const cfg = getModelConfig()
  const coding = process.env.OPENAI_CODING_MODEL?.trim() || cfg.complex
  const review = process.env.OPENAI_REVIEW_MODEL?.trim() || cfg.simple
  const debug = process.env.OPENAI_DEBUG_MODEL?.trim() || cfg.medium
  const map = {
    classification: { kind, tier: 'simple', speed: 'fast', model: cfg.simple, provider: 'openai' },
    content: { kind, tier: 'medium', speed: 'medium', model: cfg.medium, provider: 'openai' },
    architecture: { kind, tier: 'complex', speed: 'slow', model: cfg.complex, provider: 'openai' },
    coding: { kind, tier: 'complex', speed: 'slow', model: coding, provider: 'openai' },
    debugging: { kind, tier: 'medium', speed: 'medium', model: debug, provider: 'openai' },
    vision: { kind, tier: 'medium', speed: 'medium', model: resolveVisionModel(), provider: 'openai' },
    review: { kind, tier: 'simple', speed: 'fast', model: review, provider: 'openai' },
  }
  const base = map[kind] || { kind, tier: 'medium', speed: 'medium', model: cfg.medium, provider: 'openai' }
  if (CHEAP_TASK_KINDS.has(kind)) return base
  const pref = getModelPreference()
  if (pref?.model && isAllowedOpenAiModel(pref.model) && (!pref.provider || pref.provider === 'openai')) {
    const resolved = resolveModelTier(pref.speed, { model: pref.model })
    return { kind, ...resolved }
  }
  return base
}
