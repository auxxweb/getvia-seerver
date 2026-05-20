import mongoose from 'mongoose'

const reviewSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '' },
  },
  { timestamps: true },
)

reviewSchema.index({ businessId: 1, createdAt: -1 })
reviewSchema.index({ userId: 1, businessId: 1 }, { unique: true })

export const Review = mongoose.model('Review', reviewSchema)
