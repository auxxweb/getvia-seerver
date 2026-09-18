import mongoose from 'mongoose'

const aiSiteMemorySchema = new mongoose.Schema(
  {
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true, unique: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    category: { type: String, default: '' },
    requirements: { type: [String], default: [] },
    preferredDirection: { type: String, default: '' },
    lastPromptClass: { type: String, default: '' },
    promptClasses: { type: Map, of: { success: Number, fail: Number, partial: Number }, default: {} },
  },
  { timestamps: true },
)

export const AiSiteMemory = mongoose.models.AiSiteMemory || mongoose.model('AiSiteMemory', aiSiteMemorySchema)
