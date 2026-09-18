import mongoose from 'mongoose'

const aiUsageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Website',
      default: null,
      index: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AIJob',
      default: null,
    },
    model: { type: String, default: '' },
    operation: { type: String, default: '' },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    estimatedCostUsd: { type: Number, default: 0 },
    promptSnippet: { type: String, default: '' },
  },
  { timestamps: true },
)

aiUsageSchema.index({ businessId: 1, createdAt: -1 })
aiUsageSchema.index({ userId: 1, createdAt: -1 })

export const AIUsage = mongoose.models.AIUsage || mongoose.model('AIUsage', aiUsageSchema)
