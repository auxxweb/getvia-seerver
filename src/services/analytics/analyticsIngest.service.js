import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { AnalyticsEvent } from '../../models/analytics/AnalyticsEvent.model.js'
import { ANALYTICS_EVENT_TYPES, EVENT_CATEGORIES } from '../../analytics/eventTypes.js'

const TTL_MS = Number(process.env.ANALYTICS_EVENT_TTL_DAYS || 180) * 86400 * 1000

export function hashAnalyticsIp(ip) {
  const salt = process.env.ANALYTICS_IP_SALT || process.env.JWT_SECRET || 'getvia-analytics'
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32)
}

function safeDim(s) {
  return String(s || 'unknown')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64)
}

function pickForwardedIp(req) {
  const x = req.headers['x-forwarded-for']
  if (typeof x === 'string' && x.length) return x.split(',')[0].trim()
  return req.socket?.remoteAddress || req.ip || ''
}

export function getIngestContext(req) {
  const forwardedIp = pickForwardedIp(req)
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 512)
  const userId = req.user?._id || null
  return {
    forwardedIp,
    ipHash: forwardedIp ? hashAnalyticsIp(forwardedIp) : '',
    userAgent,
    userId,
  }
}

/**
 * @param {Array<object>} events raw client payloads
 * @param {ReturnType<typeof getIngestContext>} ctx
 */
export async function ingestAnalyticsEventsBatch(events, ctx) {
  if (!Array.isArray(events) || !events.length) return { inserted: 0, errors: [] }
  const { ipHash, userId } = ctx
  const expiresAt = TTL_MS > 0 ? new Date(Date.now() + TTL_MS) : null
  const docs = []
  const errors = []

  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i]
    if (!ev || typeof ev !== 'object') {
      errors.push({ index: i, message: 'Invalid event' })
      continue
    }
    const eventType = String(ev.eventType || '')
    if (!ANALYTICS_EVENT_TYPES.includes(eventType)) {
      errors.push({ index: i, message: 'Invalid eventType' })
      continue
    }
    let businessId = ev.businessId ?? null
    if (businessId != null && businessId !== '') {
      const sid = String(businessId)
      if (!mongoose.isValidObjectId(sid)) {
        errors.push({ index: i, message: 'Invalid businessId' })
        continue
      }
      businessId = new mongoose.Types.ObjectId(sid)
    } else {
      businessId = null
    }

    const uid =
      userId ||
      (ev.userId && mongoose.isValidObjectId(String(ev.userId))
        ? new mongoose.Types.ObjectId(String(ev.userId))
        : null)

    const md = ev.metadata && typeof ev.metadata === 'object' && !Array.isArray(ev.metadata) ? ev.metadata : {}

    docs.push({
      businessId,
      userId: uid,
      visitorId: String(ev.visitorId || '').slice(0, 128),
      sessionId: String(ev.sessionId || '').slice(0, 128),
      eventType,
      category: EVENT_CATEGORIES[eventType] || 'general',
      source: String(ev.source || '').slice(0, 120),
      device: safeDim(ev.device),
      browser: safeDim(ev.browser),
      os: safeDim(ev.os),
      country: String(ev.country || '').slice(0, 80),
      city: String(ev.city || '').slice(0, 80),
      ipHash: ipHash || (ev.ipHash ? String(ev.ipHash).slice(0, 64) : ''),
      metadata: md,
      timestamp: ev.timestamp ? new Date(ev.timestamp) : new Date(),
      expiresAt,
    })
  }

  if (!docs.length) return { inserted: 0, errors }

  try {
    await AnalyticsEvent.insertMany(docs, { ordered: false })
  } catch (e) {
    if (e?.name !== 'MongoBulkWriteError') throw e
  }
  return { inserted: docs.length, errors }
}
