import { body, validationResult } from 'express-validator'
import { HttpError } from '../middleware/errorHandler.js'
import { ingestAnalyticsEventsBatch, getIngestContext } from '../services/analytics/analyticsIngest.service.js'

export const validateAnalyticsIngest = [body('events').isArray({ min: 1, max: 50 })]

export async function postAnalyticsEvents(req, res, next) {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0]?.msg || 'Invalid payload')
    }
    const ctx = getIngestContext(req)
    if (req.user?._id) ctx.userId = req.user._id
    const result = await ingestAnalyticsEventsBatch(req.body.events, ctx)
    res.status(202).json({ ok: true, accepted: result.inserted, errors: result.errors })
  } catch (e) {
    next(e)
  }
}
