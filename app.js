import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'

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
import { ensureFirebaseEnvDefaults, isFirebaseAdminConfigured } from './config/firebase.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function createApp() {
  configureCloudinary()
  const app = express()

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
    }),
  )
  app.use(morgan('dev'))
  app.use(express.json({ limit: '12mb' }))
  app.use(cookieParser())

  app.get('/api/health', (_req, res) => {
    ensureFirebaseEnvDefaults()
    res.json({
      ok: true,
      apiBuild: 'getvia-api-v3',
      firebaseAdminConfigured: isFirebaseAdminConfigured(),
    })
  })

  app.use('/api/auth', authRoutes)
  app.use('/api', publicRoutes)
  app.use('/api', analyticsRoutes)
  app.use('/api/owner', ownerRoutes)
  app.use('/api/admin', adminRoutes)
  app.use('/api/user', userRoutes)
  app.use('/api/upload', uploadRoutes)
  app.use('/api/payment', paymentRoutes)

  app.use(errorHandler)
  return app
}
