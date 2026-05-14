import mongoose from 'mongoose'

const topSliceSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business' },
    publicId: String,
    name: String,
    category: String,
    plan: String,
    score: Number,
  },
  { _id: false },
)

/**
 * Unified daily rollups: business-scoped or whole platform (scope === 'platform').
 * Dashboards read these — not raw events.
 */
const analyticsDailySchema = new mongoose.Schema(
  {
    scope: { type: String, enum: ['business', 'platform'], required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', default: null, index: true },
    dateKey: { type: String, required: true, index: true },
    /** Per-event counts */
    counters: { type: Object, default: {} },
    uniqueVisitors: { type: Number, default: 0 },
    returningVisitors: { type: Number, default: 0 },
    newVisitors: { type: Number, default: 0 },
    totalEngagementMs: { type: Number, default: 0 },
    sessionsApprox: { type: Number, default: 0 },
    byDevice: { type: Object, default: {} },
    byBrowser: { type: Object, default: {} },
    byCountry: { type: Object, default: {} },
    byCity: { type: Object, default: {} },
    bySource: { type: Object, default: {} },
    bySection: { type: Object, default: {} },
    /** 7×24 heat — keys like "d0_h10" (UTC weekday 0–6, hour 0–23) */
    heatmap: { type: Object, default: {} },
    /** Platform-only enrichments */
    topBusinessesByViews: { type: [topSliceSchema], default: [] },
    topCategories: { type: Object, default: {} },
    updatedAtRollup: { type: Date, default: null },
  },
  { timestamps: true, collection: 'analytics_daily' },
)

analyticsDailySchema.index({ scope: 1, businessId: 1, dateKey: 1 }, { unique: true })

export const AnalyticsDaily =
  mongoose.models.AnalyticsDaily || mongoose.model('AnalyticsDaily', analyticsDailySchema)
