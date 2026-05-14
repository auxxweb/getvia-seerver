/** If you still see this in JSON, the request never reached the current getvia server (see /api/auth/_diagnostics). */
const STALE_CLIENT_FIREBASE_MSG =
  'Server is missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (or a service account JSON path).'

export function errorHandler(err, _req, res, _next) {
  const status = err.status || err.statusCode || 500
  let message = err.message || 'Internal Server Error'
  if (message === STALE_CLIENT_FIREBASE_MSG) {
    message =
      'This error text is from an outdated API binary. Stop all Node on port 5000, run npm run dev only from getvia/server, then GET http://localhost:5000/api/auth/_diagnostics — you must see apiBuild "getvia-api-v3".'
  }
  if (process.env.NODE_ENV !== 'production') {
    console.error(err)
  }
  res.status(status).json({
    ok: false,
    error: message,
    apiBuild: 'getvia-api-v3',
    ...(err.details ? { details: err.details } : {}),
  })
}

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message)
    this.status = status
    this.details = details
  }
}
