import mongoose from 'mongoose'
import { AI_JOB_STATUSES, AI_JOB_TYPES } from '../ai-builder/constants.js'

const aiJobSchema = new mongoose.Schema(
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
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AIConversation',
      default: null,
    },
    type: {
      type: String,
      enum: AI_JOB_TYPES,
      required: true,
    },
    status: {
      type: String,
      enum: AI_JOB_STATUSES,
      default: 'QUEUED',
      index: true,
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    currentStep: { type: String, default: '' },
    userFacingSteps: { type: [mongoose.Schema.Types.Mixed], default: [] },
    input: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: mongoose.Schema.Types.Mixed, default: null },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    cancelRequested: { type: Boolean, default: false },
    correlationId: { type: String, required: true, index: true },
    parentJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AIJob',
      default: null,
    },
    modelTier: { type: String, default: 'medium' },
    model: { type: String, default: '' },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

aiJobSchema.index({ siteId: 1, status: 1 })
aiJobSchema.index({ userId: 1, createdAt: -1 })
aiJobSchema.index({ businessId: 1, createdAt: -1 })

export const AIJob = mongoose.models.AIJob || mongoose.model('AIJob', aiJobSchema)
