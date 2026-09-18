import mongoose from 'mongoose'
import { CHANGE_SET_STATUS } from '../ai-builder/constants.js'

const aiChangeSetSchema = new mongoose.Schema(
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
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AIJob',
      default: null,
    },
    status: {
      type: String,
      enum: CHANGE_SET_STATUS,
      default: 'proposed',
      index: true,
    },
    operations: { type: [mongoose.Schema.Types.Mixed], default: [] },
    expectedRevision: { type: Number, default: null },
    appliedRevision: { type: Number, default: null },
    schemaResult: { type: mongoose.Schema.Types.Mixed, default: null },
    permissionResult: { type: mongoose.Schema.Types.Mixed, default: null },
    source: { type: String, enum: ['manual', 'ai', 'system'], default: 'ai' },
  },
  { timestamps: true },
)

aiChangeSetSchema.index({ siteId: 1, createdAt: -1 })
aiChangeSetSchema.index({ jobId: 1 })

export const AIChangeSet = mongoose.models.AIChangeSet || mongoose.model('AIChangeSet', aiChangeSetSchema)
