import { User } from '../models/user.model.js'
import { ensureFirebaseEnvDefaults } from '../config/firebase.js'
import { HttpError } from '../src/middleware/errorHandler.js'
import * as authService from '../services/auth.service.js'
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../src/utils/tokens.js'

const COOKIE_NAME = 'refreshToken'

function cookieOpts() {
  const isProd = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: refreshCookieMaxAgeMs(),
    path: '/',
  }
}

function accessTokenSecret() {
  return process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET
}

function refreshTokenSecret() {
  return process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
}

/** Access token TTL — minimum practical default 7 days (override via JWT_ACCESS_EXPIRES). */
function accessTokenExpires() {
  return (
    process.env.JWT_ACCESS_EXPIRES?.trim() ||
    process.env.FIREBASE_JWT_EXPIRES?.trim() ||
    process.env.JWT_EXPIRES_IN?.trim() ||
    '7d'
  )
}

function refreshTokenExpires() {
  return process.env.JWT_REFRESH_EXPIRES?.trim() || '7d'
}

function refreshCookieMaxAgeMs() {
  const exp = refreshTokenExpires()
  const m = /^(\d+)([dhms])$/i.exec(exp)
  if (!m) return 7 * 24 * 60 * 60 * 1000
  const n = Number(m[1])
  const unit = m[2].toLowerCase()
  const mult =
    unit === 'd' ? 86400000 : unit === 'h' ? 3600000 : unit === 'm' ? 60000 : 1000
  return n * mult
}

export async function register(req, res, next) {
  try {
    const { name, email, password, phone, role } = req.body
    if (!password || String(password).length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters')
    }
    if (role && role !== 'USER') {
      throw new HttpError(403, 'Only USER role can self-register')
    }
    const exists = await User.findOne({ email })
    if (exists) throw new HttpError(409, 'Email already registered')
    const user = await User.create({
      name,
      email,
      password,
      phone: phone || '',
      role: 'USER',
    })
    const tokens = await issueTokens(user, accessTokenExpires())
    res.cookie(COOKIE_NAME, tokens.refreshToken, cookieOpts())
    res.status(201).json({
      ok: true,
      user: user.toSafeObject(),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    })
  } catch (e) {
    next(e)
  }
}

export async function registerBusinessOwner(req, res, next) {
  try {
    const { name, email, password, phone } = req.body
    if (!password || String(password).length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters')
    }
    const exists = await User.findOne({ email })
    if (exists) throw new HttpError(409, 'Email already registered')
    const user = await User.create({
      name,
      email,
      password,
      phone: phone || '',
      role: 'BUSINESS_OWNER',
    })
    const tokens = await issueTokens(user, accessTokenExpires())
    res.cookie(COOKIE_NAME, tokens.refreshToken, cookieOpts())
    res.status(201).json({
      ok: true,
      user: user.toSafeObject(),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    })
  } catch (e) {
    next(e)
  }
}

export async function login(req, res, next) {
  try {
    const { email, password, expectedRole } = req.body
    const user = await User.findOne({ email }).select('+password')
    if (!user || !(await user.comparePassword(password))) {
      throw new HttpError(401, 'Invalid credentials')
    }
    if (user.isBlocked) {
      if (user.role === 'BUSINESS_OWNER') {
        throw new HttpError(403, 'Your business account has been suspended.')
      }
      if (user.role === 'USER') {
        throw new HttpError(403, 'Your account has been suspended.')
      }
    }
    if (expectedRole && user.role !== expectedRole) {
      throw new HttpError(403, 'Role mismatch for this login')
    }
    const tokens = await issueTokens(user, accessTokenExpires())
    res.cookie(COOKIE_NAME, tokens.refreshToken, cookieOpts())
    res.json({
      ok: true,
      user: user.toSafeObject(),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    })
  } catch (e) {
    next(e)
  }
}

export async function refresh(req, res, next) {
  try {
    const raw =
      req.cookies?.[COOKIE_NAME] || req.body?.refreshToken || req.headers['x-refresh-token']
    if (!raw) throw new HttpError(401, 'Refresh token missing')
    const secret = refreshTokenSecret()
    if (!secret) throw new HttpError(500, 'JWT_REFRESH_SECRET or JWT_SECRET is not configured')
    const decoded = verifyRefreshToken(raw, secret)
    const user = await User.findById(decoded.sub).select('+refreshTokens')
    if (!user) throw new HttpError(401, 'User not found')
    const h = hashToken(raw)
    const match = user.refreshTokens.some((t) => t.tokenHash === h && t.expiresAt > new Date())
    if (!match) throw new HttpError(401, 'Refresh token revoked')
    if (user.isBlocked && user.role !== 'SUPER_ADMIN') {
      const msg =
        user.role === 'BUSINESS_OWNER'
          ? 'Your business account has been suspended.'
          : 'Your account has been suspended.'
      throw new HttpError(403, msg)
    }
    const tokens = await issueTokens(user, accessTokenExpires())
    res.cookie(COOKIE_NAME, tokens.refreshToken, cookieOpts())
    res.json({
      ok: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    })
  } catch (e) {
    if (e instanceof HttpError) return next(e)
    next(new HttpError(401, 'Invalid refresh token'))
  }
}

export async function logout(req, res, next) {
  try {
    const raw = req.cookies?.[COOKIE_NAME]
    if (raw) {
      try {
        const h = hashToken(raw)
        await User.updateMany(
          { 'refreshTokens.tokenHash': h },
          { $pull: { refreshTokens: { tokenHash: h } } },
        )
      } catch {
        /* ignore */
      }
    }
    res.clearCookie(COOKIE_NAME, { path: '/' })
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /api/auth/firebase-login
 * Body: { "token": "..." } or { "idToken": "..." } (both supported)
 */
export async function firebaseLogin(req, res, next) {
  try {
    const rawToken = req.body?.token || req.body?.idToken || req.body?.id_token
    if (!rawToken || typeof rawToken !== 'string') {
      throw new HttpError(400, 'Missing token: send { "token": "<Firebase ID token>" } or { "idToken": "..." }')
    }

    let decoded
    try {
      decoded = await authService.verifyFirebaseToken(rawToken.trim())
    } catch (e) {
      if (e?.code === 'FIREBASE_ADMIN_NOT_CONFIGURED') {
        console.error('[auth] Firebase Admin not configured.', e.message)
        throw new HttpError(500, e.message)
      }
      if (e?.code === 'FIREBASE_ADMIN_INIT_FAILED') {
        console.error('[auth] Firebase Admin init failed:', e.message)
        throw new HttpError(500, e.message || 'Firebase Admin could not start. Check server/.env credentials.')
      }
      console.warn('[auth] Firebase verify failed:', e?.message || e)
      throw new HttpError(401, 'Invalid or expired Firebase ID token')
    }

    const registerAsBusinessOwner = Boolean(req.body?.registerAsBusinessOwner)
    const loginOnly = Boolean(req.body?.loginOnly)
    const expectedRole = req.body?.expectedRole ? String(req.body.expectedRole).trim() : ''

    let user
    try {
      const result = loginOnly
        ? await authService.loginUserFromFirebase(decoded, { expectedRole })
        : await authService.findOrCreateUserFromFirebase(decoded, {
            registerAsBusinessOwner,
          })
      user = result.user
    } catch (e) {
      if (e?.code === 'USER_NOT_FOUND') {
        throw new HttpError(404, 'No account found for these credentials. Register your business first.')
      }
      if (e?.code === 'ROLE_MISMATCH') {
        throw new HttpError(
          403,
          'This sign-in is not a business owner account. Complete business registration on the public site.',
        )
      }
      if (e?.code === 'NON_USER_ROLE') {
        throw new HttpError(403, 'This account is not an end-user account. Use the business or admin portal.')
      }
      if (e?.code === 'FIREBASE_UID_MISMATCH') {
        throw new HttpError(409, 'This email is linked to a different sign-in provider.')
      }
      console.error('[auth] findOrCreateUser:', e?.message || e)
      const hint =
        process.env.NODE_ENV !== 'production' && e?.message
          ? ` (${e.message})`
          : ''
      throw new HttpError(500, `Could not create or update user${hint}`)
    }

    if (user.isBlocked) {
      if (user.role === 'BUSINESS_OWNER') {
        throw new HttpError(403, 'Your business account has been suspended.')
      }
      if (user.role === 'USER') {
        throw new HttpError(403, 'Your account has been suspended.')
      }
    }

    const tokens = await issueTokens(user, accessTokenExpires())
    res.cookie(COOKIE_NAME, tokens.refreshToken, cookieOpts())
    res.setHeader('X-Getvia-Firebase-Login', 'v3-json-or-env')
    res.json({
      ok: true,
      success: true,
      user: user.toSafeObject(),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      token: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    })
  } catch (e) {
    next(e)
  }
}

export async function issueTokens(user, accessExpOverride) {
  const accessSecret = accessTokenSecret()
  const refreshSecret = refreshTokenSecret()
  if (!accessSecret || !refreshSecret) {
    throw new HttpError(500, 'JWT_SECRET (or JWT_ACCESS_SECRET + JWT_REFRESH_SECRET) is not configured')
  }
  const accessExp = accessExpOverride || accessTokenExpires()
  const refreshExp = refreshTokenExpires()

  const payload = { sub: user._id.toString(), role: user.role }
  const accessToken = signAccessToken(payload, accessSecret, accessExp)
  const refreshToken = signRefreshToken({ sub: user._id.toString() }, refreshSecret, refreshExp)

  const decoded = verifyRefreshToken(refreshToken, refreshSecret)
  const expMs = decoded.exp * 1000

  const u = await User.findById(user._id).select('+refreshTokens')
  u.refreshTokens.push({
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(expMs),
  })
  u.refreshTokens = u.refreshTokens.filter((t) => t.expiresAt > new Date()).slice(-10)
  await u.save()

  return { accessToken, refreshToken, expiresIn: accessExp }
}
