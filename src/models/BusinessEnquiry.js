import mongoose from 'mongoose'

const businessEnquirySchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, trim: true, required: true },
    email: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    message: { type: String, trim: true, required: true },
    status: { type: String, enum: ['open', 'archived'], default: 'open', index: true },
  },
  { timestamps: true },
)

businessEnquirySchema.index({ businessId: 1, createdAt: -1 })

export const BusinessEnquiry =
  mongoose.models.BusinessEnquiry || mongoose.model('BusinessEnquiry', businessEnquirySchema)
