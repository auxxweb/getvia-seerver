import { applyCorsHeaders } from '../lib/corsOrigins.js'

export function errorHandler(err, req, res, _next) {
  applyCorsHeaders(req, res)

  const status = err.status || err.statusCode || 500
  let message = err.message || 'Internal Server Error'
  if (process.env.NODE_ENV === 'production' && status >= 500) {
    message = 'Internal Server Error'
  }

  if (status >= 500) {
    console.error('[api]', {
      status,
      method: req.method,
      path: req.originalUrl,
      message: err.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    })
  } else if (process.env.NODE_ENV !== 'production') {
    console.error(err)
  }

  res.status(status).json({
    ok: false,
    error: message,
    ...(err.details && process.env.NODE_ENV !== 'production' ? { details: err.details } : {}),
  })
}

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message)
    this.status = status
    this.details = details
  }
}
