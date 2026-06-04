import mongoose from 'mongoose'

const supportMessageSchema = new mongoose.Schema(
  {
    audience: { type: String, enum: ['consumer', 'business'], required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    issue: { type: String, required: true, trim: true },
    status: { type: String, enum: ['open', 'resolved'], default: 'open', index: true },
  },
  { timestamps: true },
)

export const SupportMessage =
  mongoose.models.SupportMessage || mongoose.model('SupportMessage', supportMessageSchema)
