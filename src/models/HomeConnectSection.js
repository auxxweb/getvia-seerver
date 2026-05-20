import mongoose from 'mongoose'

const homeConnectSectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default', trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: '', trim: true },
    imagePublicId: { type: String, default: '', trim: true },
  },
  { timestamps: true },
)

export const HomeConnectSection = mongoose.model('HomeConnectSection', homeConnectSectionSchema)
