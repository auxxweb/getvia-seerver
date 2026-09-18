import mongoose from 'mongoose'
import { VERSION_SOURCES, VERSION_TYPES } from '../ai-builder/constants.js'

const websiteVersionSchema = new mongoose.Schema(
  {
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Website',
      required: true,
      index: true,
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    versionNumber: { type: Number, required: true, min: 1 },
    parentVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WebsiteVersion',
      default: null,
    },
    versionType: {
      type: String,
      enum: VERSION_TYPES,
      required: true,
      index: true,
    },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    changeSet: { type: mongoose.Schema.Types.Mixed, default: null },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    source: {
      type: String,
      enum: VERSION_SOURCES,
      default: 'ai',
    },
    prompt: { type: String, default: '' },
    status: {
      type: String,
      enum: ['committed'],
      default: 'committed',
    },
    idempotencyKey: { type: String, default: '' },
  },
  { timestamps: true },
)

websiteVersionSchema.index({ siteId: 1, versionNumber: 1 }, { unique: true })
websiteVersionSchema.index({ siteId: 1, createdAt: -1 })
websiteVersionSchema.index(
  { siteId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $gt: '' } } },
)

export const WebsiteVersion =
  mongoose.models.WebsiteVersion || mongoose.model('WebsiteVersion', websiteVersionSchema)
