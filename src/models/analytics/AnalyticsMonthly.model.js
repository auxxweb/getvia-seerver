import mongoose from 'mongoose'

const analyticsMonthlySchema = new mongoose.Schema(
  {
    scope: { type: String, enum: ['business', 'platform'], required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', default: null, index: true },
    monthKey: { type: String, required: true, index: true },
    counters: { type: Object, default: {} },
    uniqueVisitors: { type: Number, default: 0 },
    returningVisitors: { type: Number, default: 0 },
    byDevice: { type: Object, default: {} },
    byCountry: { type: Object, default: {} },
    bySource: { type: Object, default: {} },
    updatedAtRollup: { type: Date, default: null },
  },
  { timestamps: true, collection: 'analytics_monthly' },
)

analyticsMonthlySchema.index({ scope: 1, businessId: 1, monthKey: 1 }, { unique: true })

export const AnalyticsMonthly =
  mongoose.models.AnalyticsMonthly || mongoose.model('AnalyticsMonthly', analyticsMonthlySchema)
