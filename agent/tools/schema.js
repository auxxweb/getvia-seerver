const TYPES = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  boolean: (v) => typeof v === 'boolean',
  object: (v) => v != null && typeof v === 'object' && !Array.isArray(v),
}

export function validateToolInput(schema, input) {
  if (!schema || typeof schema !== 'object') return { ok: true }
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errorType: 'VALIDATION_ERROR', message: 'Tool input must be an object.' }
  }
  const properties = schema.properties || {}
  if (schema.additionalProperties === false) {
    const extra = Object.keys(input).filter((key) => !Object.prototype.hasOwnProperty.call(properties, key))
    if (extra.length) {
      return {
        ok: false,
        errorType: 'VALIDATION_ERROR',
        message: `Unknown fields: ${extra.join(', ')}.`,
      }
    }
  }
  for (const key of schema.required || []) {
    if (input[key] == null || input[key] === '') {
      return { ok: false, errorType: 'VALIDATION_ERROR', message: `Missing required field "${key}".` }
    }
  }
  for (const [key, prop] of Object.entries(properties)) {
    if (input[key] == null) continue
    const check = TYPES[prop.type]
    if (check && !check(input[key])) {
      return {
        ok: false,
        errorType: 'VALIDATION_ERROR',
        message: `Field "${key}" must be a ${prop.type}.`,
      }
    }
  }
  return { ok: true }
}
