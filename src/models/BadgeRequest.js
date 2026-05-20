import mongoose from 'mongoose'

const badgeRequestSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    badgeType: { type: String, enum: ['FEATURED', 'VERIFIED'], required: true, index: true },
    ownerNotes: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['PENDING', 'FULFILLED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    adminNotes: { type: String, default: '', trim: true },
    fulfilledAt: { type: Date, default: null },
  },
  { timestamps: true },
)

badgeRequestSchema.index({ businessId: 1, badgeType: 1, status: 1 })

export const BadgeRequest = mongoose.model('BadgeRequest', badgeRequestSchema)
