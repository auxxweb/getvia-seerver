import mongoose from 'mongoose'

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    banner: { type: String, default: '' },
    bannerPublicId: { type: String, default: '' },
    date: { type: Date, required: true },
    isFeatured: { type: Boolean, default: false },
  },
  { timestamps: true },
)

export const Event = mongoose.model('Event', eventSchema)
