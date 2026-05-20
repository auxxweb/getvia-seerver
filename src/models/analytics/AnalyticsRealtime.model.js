import mongoose from 'mongoose'

/**
 * 5-minute buckets for near-real-time charts + API usage style counters.
 */
const analyticsRealtimeSchema = new mongoose.Schema(
  {
    scope: { type: String, enum: ['business', 'platform'], required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', default: null, index: true },
    bucketStart: { type: Date, required: true, index: true },
    counters: { type: Object, default: {} },
    apiEventsIngested: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'analytics_realtime' },
)

analyticsRealtimeSchema.index({ scope: 1, businessId: 1, bucketStart: 1 }, { unique: true })

/** TTL: drop realtime buckets after ~3 days */
analyticsRealtimeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 3 })

export const AnalyticsRealtime =
  mongoose.models.AnalyticsRealtime || mongoose.model('AnalyticsRealtime', analyticsRealtimeSchema)
