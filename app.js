import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'

import authRoutes from './routes/auth.routes.js'
import publicRoutes from './src/routes/publicRoutes.js'
import ownerRoutes from './src/routes/ownerRoutes.js'
import adminRoutes from './src/routes/adminRoutes.js'
import userRoutes from './src/routes/userRoutes.js'
import uploadRoutes from './routes/upload.routes.js'
import paymentRoutes from './src/routes/paymentRoutes.js'
import analyticsRoutes from './src/routes/analyticsRoutes.js'
import { getClientOrigins, isIsolatedPreviewOrigin } from './src/lib/corsOrigins.js'
import { errorHandler } from './src/middleware/errorHandler.js'
import { configureCloudinary } from './config/cloudinary.js'
import { LEGACY_UPLOADS_DIR } from './src/services/legacyImageUrls.service.js'
import { mountIsolatedPreviewProxy } from './src/ai-builder/preview/previewProxy.js'
import { mountPublishedLiveSites } from './src/ai-builder/publish/mountPublishedLive.js'

const isProd = process.env.NODE_ENV === 'production'

function configureTrustProxy(app) {
  // Behind nginx / Cloudflare / PM2 proxy, rate-limit needs real client IPs.
  // Without this, express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
  // TRUST_PROXY=1 (recommended) | TRUST_PROXY=false to disable | omit to auto-detect.
  const raw = process.env.TRUST_PROXY
  if (raw === '0' || raw === 'false') return
  if (raw == null || raw === '') {
    const apiOrigin = String(process.env.PUBLIC_API_ORIGIN || process.env.GETVIA_API_ORIGIN || '')
    const behindPublicProxy = Boolean(apiOrigin && !/127\.0\.0\.1|localhost/i.test(apiOrigin))
    if (isProd || behindPublicProxy) app.set('trust proxy', 1)
    return
  }
  const asNum = Number(raw)
  app.set('trust proxy', Number.isFinite(asNum) && String(asNum) === String(raw).trim() ? asNum : raw)
}

export function createApp() {
  configureCloudinary()
  const app = express()

  configureTrustProxy(app)

  const origins = getClientOrigins()

  app.use((req, res, next) => {
    if (!isIsolatedPreviewOrigin(req.headers.origin)) return next()
    return cors({
      origin: req.headers.origin,
      credentials: false,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Accept'],
    })(req, res, next)
  })
  app.use((req, res, next) => {
    if (isIsolatedPreviewOrigin(req.headers.origin)) return next()
    return cors({
      origin: origins,
      credentials: true,
    })(req, res, next)
  })
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      // AI preview iframes on business.getvia.in need to embed /ai-preview/* from the API host.
      // frame-ancestors is set per-response on the preview proxy instead.
      xFrameOptions: false,
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'upgrade-insecure-requests': null,
          'frame-ancestors': ["'self'", 'https://business.getvia.in', 'https://admin.getvia.in', 'http://localhost:5175'],
        },
      },
      ...(isProd ? { hsts: { maxAge: 31536000, includeSubDomains: true, preload: true } } : {}),
    }),
  )
  app.use(morgan(isProd ? 'combined' : 'dev'))
  app.use(express.json({ limit: '2mb' }))
  app.use(cookieParser())

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProd ? 30 : 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'Too many requests. Try again later.' },
  })
  const registerBusinessLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: isProd ? 5 : 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'Too many registration attempts. Try again later.' },
  })

  app.use('/api/auth/login', authLimiter)
  app.use('/api/auth/firebase-login', authLimiter)
  app.use('/api/auth/register', authLimiter)
  app.use('/api/auth/register-business', registerBusinessLimiter)
  app.use('/api/auth/refresh', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProd ? 60 : 300,
    standardHeaders: true,
    legacyHeaders: false,
  }))

  const publicWriteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProd ? 20 : 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'Too many submissions. Try again later.' },
  })
  app.use('/api/business/:publicId/enquiries', publicWriteLimiter)
  app.use('/api/site/support', publicWriteLimiter)
  app.use(
    '/api/owner/ai-builder/message',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: isProd ? 30 : 120,
      standardHeaders: true,
      legacyHeaders: false,
      message: { ok: false, error: 'Too many AI requests. Try again shortly.', code: 'AI_RATE_LIMIT' },
    }),
  )
  app.use(
    '/api/owner/websites/:siteId/publish',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: isProd ? 20 : 80,
      standardHeaders: true,
      legacyHeaders: false,
      message: { ok: false, error: 'Too many publish attempts. Try again shortly.' },
    }),
  )

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/api/auth', authRoutes)
  app.use('/api', publicRoutes)
  app.use('/api', analyticsRoutes)
  app.use('/api/owner', ownerRoutes)
  app.use('/api/admin', adminRoutes)
  app.use('/api/user', userRoutes)
  app.use('/api/upload', uploadRoutes)
  app.use('/api/payment', paymentRoutes)

  /** Legacy local uploads (pre-Cloudinary gallery saves). */
  app.use(
    '/api/uploads',
    express.static(LEGACY_UPLOADS_DIR, {
      maxAge: isProd ? '1d' : '7d',
    }),
  )

  // Isolated AI Vite previews (loopback 4100–4199) exposed for remote iframes.
  mountIsolatedPreviewProxy(app)
  // Published isolated builds for public /profile (same design as AI Builder preview).
  mountPublishedLiveSites(app)

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'Not found' })
  })

  app.use(errorHandler)
  return app
}
