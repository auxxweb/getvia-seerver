import mongoose from 'mongoose'

/**
 * Per-business materialized snapshot (updated by rollup jobs).
 */
const businessAnalyticsSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, unique: true, index: true },
    computedAt: { type: Date, default: Date.now },
    last30d: { type: Object, default: {} },
    conversion: { type: Object, default: {} },
    reviewSummary: { type: Object, default: {} },
    topSections: { type: [Object], default: [] },
  },
  { timestamps: true, collection: 'business_analytics' },
)

export const BusinessAnalytics =
  mongoose.models.BusinessAnalytics || mongoose.model('BusinessAnalytics', businessAnalyticsSchema)
