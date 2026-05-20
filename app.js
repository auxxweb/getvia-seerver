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
import { errorHandler } from './src/middleware/errorHandler.js'
import { configureCloudinary } from './config/cloudinary.js'
import { LEGACY_UPLOADS_DIR } from './src/services/legacyImageUrls.service.js'

const isProd = process.env.NODE_ENV === 'production'

export function createApp() {
  configureCloudinary()
  const app = express()

  if (isProd) {
    app.set('trust proxy', 1)
  }

  const origins = (process.env.CLIENT_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  app.use(
    cors({
      origin: origins,
      credentials: true,
    }),
  )
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
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

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'Not found' })
  })

  app.use(errorHandler)
  return app
}
