export function llmResult({
  success,
  text = '',
  data = null,
  model = '',
  provider = '',
  skipped = false,
  errorType = null,
  message = '',
  extra = {},
} = {}) {
  return {
    success: Boolean(success),
    text,
    data,
    model,
    provider,
    skipped: Boolean(skipped),
    errorType: success ? null : errorType || 'PROVIDER_ERROR',
    message: success ? message || '' : message || 'LLM request failed.',
    ...extra,
  }
}
