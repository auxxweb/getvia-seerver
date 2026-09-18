import { HttpError } from '../middleware/errorHandler.js'
import { randomUUID } from 'node:crypto'

export function newCorrelationId() {
  return randomUUID()
}

export function aiError(status, message, { code, retryable = false, recoveryAction = 'NONE', correlationId, details } = {}) {
  const err = new HttpError(status, message, details)
  err.code = code || 'AI_ERROR'
  err.retryable = Boolean(retryable)
  err.recoveryAction = recoveryAction
  err.correlationId = correlationId || newCorrelationId()
  return err
}

export const AiErrorCode = {
  UNAUTHORIZED: 'AI_UNAUTHORIZED',
  FORBIDDEN: 'AI_FORBIDDEN',
  NOT_FOUND: 'AI_NOT_FOUND',
  DRAFT_CONFLICT: 'DRAFT_CONFLICT',
  REVISION_CONFLICT: 'REVISION_CONFLICT',
  JOB_IN_PROGRESS: 'JOB_IN_PROGRESS',
  JOB_CANCELLED: 'AI_JOB_CANCELLED',
  PROVIDER_TIMEOUT: 'AI_PROVIDER_TIMEOUT',
  PROVIDER_UNAVAILABLE: 'AI_PROVIDER_UNAVAILABLE',
  VALIDATION_FAILED: 'AI_VALIDATION_FAILED',
  UNSUPPORTED: 'AI_UNSUPPORTED_CAPABILITY',
  RATE_LIMIT: 'AI_RATE_LIMIT',
  IDEMPOTENT_REPLAY: 'AI_IDEMPOTENT_REPLAY',
  DOMAIN_IN_USE: 'DOMAIN_IN_USE',
  DOMAIN_VERIFY_FAILED: 'DOMAIN_VERIFY_FAILED',
  PUBLISH_FAILED: 'AI_PUBLISH_FAILED',
  NO_CHANGE_APPLIED: 'NO_CHANGE_APPLIED',
}
