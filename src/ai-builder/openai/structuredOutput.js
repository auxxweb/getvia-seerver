import { getOpenAiClient, isOpenAiConfigured, recordUsage } from './client.js'
import { isVisionCapableModel, resolveModelTier, resolveVisionModel } from './modelRouter.js'
import { aiError, AiErrorCode } from '../errors.js'
import {
  isOpenAiBillingError,
  markOpenAiUnavailable,
  markOpenAiHealthy,
  openAiSkipReason,
  shouldSkipOpenAiLlm,
} from './availability.js'

/** gpt-5 / o-series / sol models reject custom temperature and some json_schema payloads. */
export function modelSupportsCustomTemperature(model) {
  const m = String(model || '').toLowerCase()
  return !/(gpt-5|\bsol\b|^o[1-9]|o[1-9]-)/.test(m)
}

export function modelPrefersJsonObject(model) {
  const m = String(model || '').toLowerCase()
  return /(gpt-5|\bsol\b|^o[1-9]|o[1-9]-)/.test(m)
}

export function chatCompletionBody({ model, system, user, schemaName = 'result', schema, temperature = 0.3, images = [] }) {
  const imageUrls = (Array.isArray(images) ? images : []).map((row) => (typeof row === 'string' ? row : row?.url)).filter(Boolean)
  const userContent = imageUrls.length
    ? [
        { type: 'text', text: typeof user === 'string' ? user : JSON.stringify(user) },
        ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
      ]
    : user
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
    response_format:
      schema && !modelPrefersJsonObject(model)
        ? {
            type: 'json_schema',
            json_schema: { name: schemaName, schema, strict: false },
          }
        : { type: 'json_object' },
  }
  if (modelSupportsCustomTemperature(model)) {
    body.temperature = temperature
  }
  return body
}

function timeoutMsFor(model, { images } = {}) {
  if (Array.isArray(images) && images.length) return 60_000
  return modelPrefersJsonObject(model) ? 60_000 : 25_000
}

function isTemperatureError(err) {
  return /temperature/i.test(String(err?.message || err || ''))
}

function isSchemaFormatError(err) {
  return /response_format|json_schema|unsupported value/i.test(String(err?.message || err || ''))
}

export async function completeOpenAiJson({
  tier = 'medium',
  model: requestedModel,
  system,
  user,
  schemaName = 'result',
  schema,
  signal,
  usageCtx = {},
  soft = false,
  images = [],
}) {
  if (!isOpenAiConfigured() || shouldSkipOpenAiLlm()) {
    return { ok: false, skipped: true, data: null, code: openAiSkipReason() || 'OPENAI_SKIPPED' }
  }
  const resolved = resolveModelTier(tier, { model: requestedModel })
  const model =
    Array.isArray(images) && images.length && !isVisionCapableModel(resolved.model)
      ? resolveVisionModel({ model: requestedModel })
      : resolved.model
  const client = getOpenAiClient()
  const timeout = AbortSignal.timeout(timeoutMsFor(model, { images }))
  const combined = signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : signal || timeout

  const parseResponse = async (resp) => {
    const text = String(resp.choices?.[0]?.message?.content || '').trim()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    await recordUsage({ ...usageCtx, model, operation: schemaName, usage: resp.usage })
    markOpenAiHealthy()
    return { ok: Boolean(data), skipped: false, data, model, raw: text }
  }

  const create = (body) => client.chat.completions.create(body, { signal: combined })

  const fail = (err) => {
    if (isOpenAiBillingError(err)) {
      markOpenAiUnavailable('quota')
      return {
        ok: false,
        skipped: true,
        data: null,
        code: 'OPENAI_QUOTA',
        error: 'OpenAI quota exhausted.',
      }
    }
    const msg = String(err?.message || 'AI provider error')
    if (soft) return { ok: false, skipped: true, data: null, error: msg }
    if (/abort/i.test(msg)) {
      throw aiError(499, 'The AI request was cancelled.', {
        code: AiErrorCode.JOB_CANCELLED,
        retryable: false,
        recoveryAction: 'NONE',
      })
    }
    throw aiError(502, 'The AI service took too long or failed to respond.', {
      code: AiErrorCode.PROVIDER_TIMEOUT,
      retryable: true,
      recoveryAction: 'RETRY',
    })
  }

  try {
    const body = chatCompletionBody({ model, system, user, schemaName, schema, images })
    try {
      return await parseResponse(await create(body))
    } catch (err) {
      if (isTemperatureError(err) && body.temperature != null) {
        const { temperature: _drop, ...withoutTemp } = body
        return await parseResponse(await create(withoutTemp))
      }
      if (isSchemaFormatError(err) && body.response_format?.type === 'json_schema') {
        const retryBody = { ...body, response_format: { type: 'json_object' } }
        if (!modelSupportsCustomTemperature(model)) delete retryBody.temperature
        return await parseResponse(await create(retryBody))
      }
      return fail(err)
    }
  } catch (err) {
    return fail(err)
  }
}

/** Vendor-agnostic structured generation. OpenAI, then Anthropic/Grok/compat when configured. */
export async function completeJson(args) {
  const { completeWithProviders } = await import('../providers/llmProvider.js')
  return completeWithProviders(args)
}
