/** Published OpenAI list prices (USD per 1M tokens). Update when OpenAI changes rates. */

export const MODEL_USD_PER_MILLION = Object.freeze({
  'gpt-4o-mini': { in: 0.15, cached: 0.075, out: 0.6 },
  'gpt-4.1-mini': { in: 0.4, cached: 0.1, out: 1.6 },
  'gpt-4.1-nano': { in: 0.1, cached: 0.025, out: 0.4 },
  'gpt-5-mini': { in: 0.25, cached: 0.025, out: 2 },
  'gpt-4o': { in: 2.5, cached: 1.25, out: 10 },
  'gpt-4.1': { in: 2, cached: 0.5, out: 8 },
  'gpt-5': { in: 1.25, cached: 0.125, out: 10 },
  'gpt-5.6-sol': { in: 15, cached: 1.5, out: 60 },
  'gpt-5.3-codex': { in: 1.25, cached: 0.125, out: 10 },
  'gpt-5.2-codex': { in: 1.75, cached: 0.175, out: 14 },
  codex: { in: 1.25, cached: 0.125, out: 10 },
})

export function ratesForModel(model, operation = '') {
  const id = String(model || '').toLowerCase()
  const op = String(operation || '').toLowerCase()
  if (!id && (op === 'codex_sdk' || op.startsWith('codex'))) return MODEL_USD_PER_MILLION.codex
  if (!id) return MODEL_USD_PER_MILLION['gpt-4o-mini']

  // codex/<model> → price the inner model when known, else Codex list rates
  if (id.startsWith('codex/')) {
    const inner = id.slice('codex/'.length).trim()
    if (inner && inner !== 'codex' && inner !== 'default' && MODEL_USD_PER_MILLION[inner]) {
      return MODEL_USD_PER_MILLION[inner]
    }
    const keys = Object.keys(MODEL_USD_PER_MILLION).sort((a, b) => b.length - a.length)
    const hit = keys.find((key) => key !== 'codex' && inner.includes(key))
    if (hit) return MODEL_USD_PER_MILLION[hit]
    return MODEL_USD_PER_MILLION.codex
  }

  const exact = MODEL_USD_PER_MILLION[id]
  if (exact) return exact
  const keys = Object.keys(MODEL_USD_PER_MILLION).sort((a, b) => b.length - a.length)
  const hit = keys.find((key) => id.includes(key))
  if (hit) return MODEL_USD_PER_MILLION[hit]
  if (isCodexUsage({ model: id, operation: op })) return MODEL_USD_PER_MILLION.codex
  return MODEL_USD_PER_MILLION['gpt-4o-mini']
}

function numTokens(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value)
  if (value && typeof value === 'object') {
    return numTokens(value.total ?? value.tokens ?? value.count ?? value.uncached ?? 0)
  }
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

export function parseTokenUsage(usage) {
  if (usage == null || usage === false) return { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }
  if (typeof usage === 'number') return { inputTokens: numTokens(usage), outputTokens: 0, cachedInputTokens: 0 }
  const nested =
    usage.total_token_usage || usage.token_usage || usage.usage || usage.last_token_usage || usage
  const inputTokens = numTokens(
    nested.input_tokens ?? nested.prompt_tokens ?? nested.inputTokens ?? nested.promptTokens ?? nested.input,
  )
  const outputTokens = numTokens(
    nested.output_tokens ??
      nested.completion_tokens ??
      nested.outputTokens ??
      nested.completionTokens ??
      nested.output ??
      nested.reasoning_output_tokens,
  )
  const cachedInputTokens = numTokens(
    nested.cached_input_tokens ??
      nested.cached_tokens ??
      nested.input_tokens_cached ??
      nested.cachedInputTokens ??
      nested.prompt_tokens_details?.cached_tokens ??
      nested.input_tokens_details?.cached_tokens,
  )
  return { inputTokens, outputTokens, cachedInputTokens }
}

export function extractCodexUsage(events = [], fallback = null) {
  let found = fallback
  for (const event of events || []) {
    const usage = event?.usage || event?.event?.usage || event?.turn?.usage || event?.item?.usage
    if (usage) found = usage
  }
  return parseTokenUsage(found)
}

export function estimateCostUsd(model, inputTokens, outputTokens, cachedInputTokens = 0, operation = '') {
  const rates = ratesForModel(model, operation)
  const input = Math.max(0, Number(inputTokens) || 0)
  const output = Math.max(0, Number(outputTokens) || 0)
  const cached = Math.max(0, Number(cachedInputTokens) || 0)
  const uncached = Math.max(0, input - cached)
  const cachedRate = rates.cached ?? rates.in * 0.1
  return Number(((uncached * rates.in + cached * cachedRate + output * rates.out) / 1_000_000).toFixed(6))
}

export function isCodexUsage({ model, operation } = {}) {
  const op = String(operation || '').toLowerCase()
  const id = String(model || '').toLowerCase()
  return op === 'codex_sdk' || op.startsWith('codex') || id.includes('codex')
}

export function displayModelName(model, operation) {
  if (isCodexUsage({ model, operation })) {
    const inner = String(model || '')
      .replace(/^codex\/?/i, '')
      .trim()
    return inner && !/^codex$/i.test(inner) && inner.toLowerCase() !== 'default' ? `Codex (${inner})` : 'Codex'
  }
  return String(model || 'model')
}

export function anonymizePromptSnippet(prompt, max = 160) {
  return String(prompt || '')
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '[email]')
    .replace(/\+?\d[\d\s-]{7,}\d/g, '[phone]')
    .replace(/https?:\/\/[^\s]+/gi, '[url]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function normalizeUsageRow(row) {
  const inputTokens = Number(row.inputTokens || 0)
  const outputTokens = Number(row.outputTokens || 0)
  const cachedInputTokens = Number(row.cachedInputTokens || 0)
  const estimatedCostUsd = estimateCostUsd(row.model, inputTokens, outputTokens, cachedInputTokens, row.operation)
  return {
    ...row,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    estimatedCostUsd: Number(row.estimatedCostUsd) > 0 ? Number(row.estimatedCostUsd) : estimatedCostUsd,
  }
}

/** Prefer stored AIUsage rows. Only recover from job.result when that job has no usage rows yet. */
export function usageRowsFromJobs(jobs = [], existingRows = []) {
  const jobsWithRows = new Set(
    (existingRows || []).map((row) => String(row.jobId || '')).filter(Boolean),
  )
  const rows = []
  for (const job of jobs) {
    const jobId = String(job._id || job.id || '')
    if (jobId && jobsWithRows.has(jobId)) continue
    const usage = job?.result?.usage || job?.result?.coder?.usage || null
    if (!usage) continue
    const parsed = parseTokenUsage(usage)
    if (!(parsed.inputTokens || parsed.outputTokens)) continue
    const model = job?.result?.coder?.model || job?.result?.usageModel || 'codex'
    rows.push(
      normalizeUsageRow({
        _id: `job-usage-${jobId}`,
        jobId,
        model: String(model).includes('codex') ? model : `codex/${model}`,
        operation: 'codex_sdk',
        inputTokens: parsed.inputTokens,
        outputTokens: parsed.outputTokens,
        cachedInputTokens: parsed.cachedInputTokens,
        createdAt: job.createdAt,
        promptSnippet: anonymizePromptSnippet(job?.input?.prompt || '', 160),
      }),
    )
  }
  return rows
}

/**
 * Group usage by prompt as separate measurements.
 * Do NOT sum dollars or tokens across calls — they can overlap.
 */
export function groupUsageByPrompt({ jobs = [], rows = [] } = {}) {
  const byJob = new Map()
  const leftover = []
  const normalized = (rows || []).map(normalizeUsageRow)
  for (const row of usageRowsFromJobs(jobs, normalized)) normalized.push(row)

  for (const row of normalized) {
    const key = row.jobId ? String(row.jobId) : ''
    if (!key) {
      leftover.push(row)
      continue
    }
    const list = byJob.get(key) || []
    list.push(row)
    byJob.set(key, list)
  }

  const prompts = jobs.map((job) => summarizePrompt(job, byJob.get(String(job._id || job.id)) || []))
  if (leftover.length) {
    prompts.push(
      summarizePrompt(
        { _id: 'other', input: { prompt: 'Other AI calls' }, createdAt: leftover[0]?.createdAt },
        leftover,
      ),
    )
  }

  return {
    prompts,
    summary: {
      promptCount: prompts.length,
      measurementCount: normalized.length,
      note: 'Each line is a separate measurement. Do not add costs or token counts together — they may overlap.',
    },
  }
}

function pickPrimaryMeasurement(calls) {
  if (!calls?.length) return null
  const codex = calls.filter((row) => isCodexUsage(row))
  const pool = codex.length ? codex : calls
  return [...pool].sort((a, b) => Number(b.estimatedCostUsd || 0) - Number(a.estimatedCostUsd || 0))[0]
}

function summarizePrompt(job, calls) {
  const measurements = calls.map((row) => ({
    id: String(row._id || ''),
    model: displayModelName(row.model, row.operation),
    operation: row.operation || '',
    inputTokens: Number(row.inputTokens || 0),
    outputTokens: Number(row.outputTokens || 0),
    estimatedCostUsd: Number(row.estimatedCostUsd || 0),
    createdAt: row.createdAt || null,
    codex: isCodexUsage(row),
  }))
  const primary = pickPrimaryMeasurement(calls)
  const prompt = anonymizePromptSnippet(job?.input?.prompt || calls[0]?.promptSnippet || '', 180)
  return {
    jobId: String(job?._id || job?.id || ''),
    prompt: prompt || '(no prompt text)',
    createdAt: job?.createdAt || calls[0]?.createdAt || null,
    status: job?.status || '',
    models: [...new Set(measurements.map((row) => row.model).filter(Boolean))],
    primary: primary
      ? {
          model: displayModelName(primary.model, primary.operation),
          operation: primary.operation || '',
          inputTokens: Number(primary.inputTokens || 0),
          outputTokens: Number(primary.outputTokens || 0),
          estimatedCostUsd: Number(primary.estimatedCostUsd || 0),
          codex: isCodexUsage(primary),
        }
      : null,
    measurements,
    // legacy alias — same independent list, not an aggregate
    calls: measurements,
  }
}
