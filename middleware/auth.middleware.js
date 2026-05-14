import { verifyAccessToken } from '../src/utils/tokens.js'
import { User } from '../models/user.model.js'
import { HttpError } from '../src/middleware/errorHandler.js'

function jwtVerifySecret() {
  return process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET
}

/** Attach `req.user` when a valid Bearer JWT is present; otherwise continue with `req.user = null`. */
export function optionalAuthenticate() {
  return async (req, _res, next) => {
    req.user = null
    req.tokenPayload = null
    try {
      const header = req.headers.authorization || ''
      const token = header.startsWith('Bearer ') ? header.slice(7) : null
      if (!token) return next()
      const secret = jwtVerifySecret()
      if (!secret) return next()
      const decoded = verifyAccessToken(token, secret)
      const user = await User.findById(decoded.sub)
      if (user) {
        req.user = user
        req.tokenPayload = decoded
      }
    } catch {
      /* invalid token — treat as anonymous */
    }
    next()
  }
}

export function authenticate(required = true) {
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization || ''
      const token = header.startsWith('Bearer ') ? header.slice(7) : null
      if (!token) {
        if (required) throw new HttpError(401, 'Authentication required')
        req.user = null
        return next()
      }
      const secret = jwtVerifySecret()
      if (!secret) throw new HttpError(500, 'JWT_SECRET or JWT_ACCESS_SECRET is not configured')
      const decoded = verifyAccessToken(token, secret)
      const user = await User.findById(decoded.sub)
      if (!user) throw new HttpError(401, 'User not found')
      req.user = user
      req.tokenPayload = decoded
      next()
    } catch (e) {
      if (e instanceof HttpError) return next(e)
      next(new HttpError(401, 'Invalid or expired token'))
    }
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, 'Authentication required'))
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, 'Forbidden'))
    }
    next()
  }
}
