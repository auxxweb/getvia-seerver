import mongoose from 'mongoose'
import { ANALYTICS_EVENT_TYPES } from '../../analytics/eventTypes.js'

const analyticsEventSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    visitorId: { type: String, trim: true, default: '', index: true },
    sessionId: { type: String, trim: true, default: '' },
    eventType: { type: String, required: true, enum: ANALYTICS_EVENT_TYPES, index: true },
    category: { type: String, default: '', index: true },
    source: { type: String, default: '' },
    device: { type: String, default: '' },
    browser: { type: String, default: '' },
    os: { type: String, default: '' },
    country: { type: String, default: '' },
    city: { type: String, default: '' },
    ipHash: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, index: true },
    /** TTL: optional archival — set in application when inserting */
    expiresAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'analytics_events' },
)

analyticsEventSchema.index({ businessId: 1, eventType: 1, createdAt: -1 })
analyticsEventSchema.index({ createdAt: 1 })
analyticsEventSchema.index({ visitorId: 1, businessId: 1, createdAt: -1 })
analyticsEventSchema.index({ sessionId: 1, createdAt: -1 })
analyticsEventSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $type: 'date' } } },
)

export const AnalyticsEvent =
  mongoose.models.AnalyticsEvent || mongoose.model('AnalyticsEvent', analyticsEventSchema)
