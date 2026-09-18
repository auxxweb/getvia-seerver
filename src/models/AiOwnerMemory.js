import mongoose from 'mongoose'

const aiOwnerMemorySchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    preferredDirection: { type: String, default: '' },
    categories: { type: [String], default: [] },
    requirements: { type: [String], default: [] },
    promptClasses: { type: Map, of: { success: Number, fail: Number }, default: {} },
  },
  { timestamps: true },
)

export const AiOwnerMemory = mongoose.models.AiOwnerMemory || mongoose.model('AiOwnerMemory', aiOwnerMemorySchema)
