import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { optionalAuthenticate } from '../middleware/auth.js'
import { postAnalyticsEvents, validateAnalyticsIngest } from '../controllers/analyticsIngest.controller.js'

const r = Router()

const ingestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.ANALYTICS_INGEST_MAX_PER_WINDOW || 3000),
  standardHeaders: true,
  legacyHeaders: false,
})

r.post('/analytics/events', ingestLimiter, optionalAuthenticate(), validateAnalyticsIngest, postAnalyticsEvents)

export default r
