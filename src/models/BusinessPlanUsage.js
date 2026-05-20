import mongoose from 'mongoose'

const businessPlanUsageSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      unique: true,
    },
    aiPromptsMonthKey: { type: String, default: '' },
    aiPromptsUsed: { type: Number, default: 0, min: 0 },
    offerPeriodKey: { type: String, default: '' },
    offerPostsUsed: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
)

export const BusinessPlanUsage =
  mongoose.models.BusinessPlanUsage || mongoose.model('BusinessPlanUsage', businessPlanUsageSchema)
