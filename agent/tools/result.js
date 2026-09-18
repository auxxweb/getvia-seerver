export function toolOk(tool, data = {}, extra = {}) {
  return {
    success: true,
    tool,
    data,
    errorType: null,
    message: extra.message || '',
    recoverable: false,
    ...extra,
  }
}

export function toolFail(tool, { errorType = 'TOOL_FAILED', message, recoverable = true, details, data } = {}) {
  return {
    success: false,
    tool,
    data: data || null,
    errorType,
    message: message || 'Tool failed.',
    recoverable: Boolean(recoverable),
    details: details || null,
  }
}
