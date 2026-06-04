import mongoose from 'mongoose'

const helpArticleSchema = new mongoose.Schema(
  {
    audience: { type: String, enum: ['consumer', 'business'], required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    link: { type: String, default: '', trim: true },
    isPublished: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
)

export const HelpArticle =
  mongoose.models.HelpArticle || mongoose.model('HelpArticle', helpArticleSchema)
