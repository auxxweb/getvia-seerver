import mongoose from 'mongoose'

/** Supports legacy seed data where subcategories were plain strings. */
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    icon: { type: String, default: '' },
    iconPublicId: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    logoPublicId: { type: String, default: '' },
    coverImageUrl: { type: String, default: '' },
    coverImagePublicId: { type: String, default: '' },
    /** When true, category appears in the home page “Daily Needs” carousel. */
    showInDailyNeeds: { type: Boolean, default: false },
    subcategories: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true },
)

categorySchema.index({ name: 1 }, { unique: true })

export const Category = mongoose.model('Category', categorySchema)
