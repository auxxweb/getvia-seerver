import mongoose from 'mongoose'

const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Price in INR (whole rupees for display; converted to paise at checkout). */
    price: { type: Number, required: true, min: 0 },
    validity: { type: Number, required: true, min: 1 },
    features: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true },
)

planSchema.index({ isActive: 1 })

export const Plan = mongoose.models.Plan || mongoose.model('Plan', planSchema)
