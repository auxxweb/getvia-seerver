import mongoose from 'mongoose'

const websiteValidationSchema = new mongoose.Schema(
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
    draftRevision: { type: Number, default: null },
    versionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WebsiteVersion',
      default: null,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AIJob',
      default: null,
    },
    passed: { type: Boolean, default: false },
    errorItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
    warningItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
    skipped: { type: [mongoose.Schema.Types.Mixed], default: [] },
    viewports: { type: [Number], default: [] },
  },
  { timestamps: true },
)

websiteValidationSchema.index({ siteId: 1, createdAt: -1 })

export const WebsiteValidation =
  mongoose.models.WebsiteValidation || mongoose.model('WebsiteValidation', websiteValidationSchema)
