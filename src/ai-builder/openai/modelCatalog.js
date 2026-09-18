import { AsyncLocalStorage } from 'node:async_hooks'
import {
  DEFAULT_OPENAI_BY_SPEED,
  LLM_PROVIDER_IDS,
  LLM_PROVIDER_LABELS,
  OPENAI_MODELS,
  SPEED_TIERS,
} from '../constants.js'

const preferenceStore = new AsyncLocalStorage()

const SPEED_ALIASES = {
  simple: 'fast',
  fast: 'fast',
  medium: 'medium',
  complex: 'slow',
  slow: 'slow',
}

export function normalizeSpeed(value) {
  return SPEED_ALIASES[String(value || '').trim().toLowerCase()] || 'medium'
}

export function internalTierFromSpeed(speed) {
  const normalized = normalizeSpeed(speed)
  if (normalized === 'fast') return 'simple'
  if (normalized === 'slow') return 'complex'
  return 'medium'
}

export function isAllowedOpenAiModel(model) {
  return OPENAI_MODELS.some((row) => row.id === String(model || '').trim())
}

export function openaiModelForSpeed(speed) {
  return DEFAULT_OPENAI_BY_SPEED[normalizeSpeed(speed)] || DEFAULT_OPENAI_BY_SPEED.medium
}

export function sanitizeModelSelection({ speed, provider, model } = {}) {
  const requestedProvider = String(provider || '').trim().toLowerCase()
  const providerName = LLM_PROVIDER_IDS.includes(requestedProvider) ? requestedProvider : 'openai'
  const speedName = normalizeSpeed(speed)
  let modelId = ''
  if (providerName === 'openai') {
    const requested = String(model || '').trim()
    modelId = isAllowedOpenAiModel(requested) ? requested : openaiModelForSpeed(speedName)
  }
  return { speed: speedName, provider: providerName, model: modelId }
}

export function getModelPreference() {
  return preferenceStore.getStore() || null
}

export function runWithModelPreference(pref, fn) {
  return preferenceStore.run(sanitizeModelSelection(pref || {}), fn)
}

export function modelCatalogForClient({ providers = [], active } = {}) {
  const rows = providers.map((row) => ({
    id: row.name || row.id,
    label: LLM_PROVIDER_LABELS[row.name || row.id] || row.name || row.id,
    configured: Boolean(row.configured),
  }))
  const configured = rows.filter((row) => row.configured)
  const defaultProvider = active || configured[0]?.id || 'openai'
  return {
    speeds: SPEED_TIERS.map((id) => ({
      id,
      label: id === 'fast' ? 'Fast' : id === 'slow' ? 'Slow' : 'Medium',
      model: openaiModelForSpeed(id),
    })),
    providers: rows,
    openaiModels: OPENAI_MODELS,
    defaults: sanitizeModelSelection({
      speed: 'medium',
      provider: defaultProvider,
      model: openaiModelForSpeed('medium'),
    }),
  }
}
