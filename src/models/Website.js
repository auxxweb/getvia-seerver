import mongoose from 'mongoose'
import { WEBSITE_STATUS } from '../ai-builder/constants.js'

const websiteSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: WEBSITE_STATUS,
      default: 'draft',
      index: true,
    },
    publishedVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WebsiteVersion',
      default: null,
    },
    engine: { type: String, default: 'ai' },
    framework: { type: String, default: 'react' },
    bundler: { type: String, default: 'vite' },
    renderer: { type: String, default: 'AiGeneratedOnePage' },
    publishedState: { type: mongoose.Schema.Types.Mixed, default: null },
    draftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WebsiteDraft',
      default: null,
    },
    lastPublishedAt: { type: Date, default: null },
    lastPublishedIdempotencyKey: { type: String, default: '', index: true },
    workspaceFramework: { type: String, default: 'react-vite' },
    codexThreadId: { type: String, default: '' },
  },
  { timestamps: true },
)

websiteSchema.index({ ownerId: 1, status: 1 })

export const Website = mongoose.models.Website || mongoose.model('Website', websiteSchema)
