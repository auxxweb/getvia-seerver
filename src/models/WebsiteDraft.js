import mongoose from 'mongoose'

const websiteDraftSchema = new mongoose.Schema(
  {
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Website',
      required: true,
      unique: true,
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
      index: true,
    },
    /** Optimistic concurrency token. Callers must send expectedRevision. */
    revisionNumber: { type: Number, default: 1, min: 1 },
    websiteState: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    contentOverlay: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    themeOverlay: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    requirements: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    unresolvedQuestions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    confirmedRequirements: { type: [mongoose.Schema.Types.Mixed], default: [] },
    selectedElement: { type: mongoose.Schema.Types.Mixed, default: null },
    lastJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIJob', default: null },
    mutatingJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIJob', default: null },
    isolatedPreviewUrl: { type: String, default: '' },
    isolatedPreviewPort: { type: Number, default: null },
    isolatedSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    codexThreadId: { type: String, default: '' },
    lastCodexSummary: { type: String, default: '' },
  },
  { timestamps: true },
)

websiteDraftSchema.index({ businessId: 1, updatedAt: -1 })

export const WebsiteDraft = mongoose.models.WebsiteDraft || mongoose.model('WebsiteDraft', websiteDraftSchema)
