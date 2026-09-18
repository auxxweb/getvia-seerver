import mongoose from 'mongoose'

const aiRecipeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    promptClass: { type: String, default: 'other', index: true },
    category: { type: String, default: 'general', index: true },
    success: { type: Number, default: 0 },
    fail: { type: Number, default: 0 },
    skipCodex: { type: Boolean, default: false },
    direction: { type: String, default: '' },
    snippet: { type: String, default: '' },
    requirements: { type: [String], default: [] },
    files: { type: [String], default: [] },
  },
  { timestamps: true },
)

aiRecipeSchema.index({ promptClass: 1, category: 1, success: -1 })

export const AiRecipe = mongoose.models.AiRecipe || mongoose.model('AiRecipe', aiRecipeSchema)
