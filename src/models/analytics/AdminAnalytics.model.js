import mongoose from 'mongoose'

/**
 * Latest platform-wide materialized snapshot for super-admin first paint + exports.
 * Historical trends still come from `analytics_daily` / `analytics_monthly`.
 */
const adminAnalyticsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'platform', unique: true },
    computedAt: { type: Date, default: Date.now },
    totals: { type: Object, default: {} },
    subscriptionByPlan: { type: Object, default: {} },
    dauToday: { type: Number, default: 0 },
    mauApprox: { type: Number, default: 0 },
    eventVolume24h: { type: Number, default: 0 },
    apiIngest24h: { type: Number, default: 0 },
    churnSignals: { type: Object, default: {} },
  },
  { timestamps: true, collection: 'admin_analytics' },
)

export const AdminAnalytics =
  mongoose.models.AdminAnalytics || mongoose.model('AdminAnalytics', adminAnalyticsSchema)
