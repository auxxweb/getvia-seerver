import mongoose from 'mongoose'

const dailyStatSchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    views: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    enquiries: { type: Number, default: 0 },
  },
  { _id: false },
)

const analyticsSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      unique: true,
    },
    views: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    enquiries: { type: Number, default: 0 },
    savedCount: { type: Number, default: 0 },
    dailyStats: { type: [dailyStatSchema], default: [] },
  },
  { timestamps: true },
)

export const Analytics = mongoose.model('Analytics', analyticsSchema)
