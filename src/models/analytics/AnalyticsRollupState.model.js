import mongoose from 'mongoose'

const rollupStateSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'main' },
    lastProcessedAt: { type: Date, default: new Date(0) },
    lastHourlyAt: { type: Date, default: new Date(0) },
    lastDailyFinalizeAt: { type: Date, default: new Date(0) },
    lastMonthlyAt: { type: Date, default: new Date(0) },
  },
  { collection: 'analytics_rollup_state' },
)

export const AnalyticsRollupState =
  mongoose.models.AnalyticsRollupState || mongoose.model('AnalyticsRollupState', rollupStateSchema)
