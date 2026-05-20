import mongoose from 'mongoose'

export const HOME_FEATURED_EVENT_SECTIONS = [
  'marquee',
  'carousel_left',
  'carousel_right_top',
  'carousel_right_bottom',
]

const homeFeaturedEventItemSchema = new mongoose.Schema(
  {
    section: {
      type: String,
      required: true,
      enum: HOME_FEATURED_EVENT_SECTIONS,
      index: true,
    },
    title: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    /** Display time string for marquee cards, e.g. "Sat, 23 Jan, 6:00 PM". */
    eventTimeLabel: { type: String, default: '', trim: true },
    imageUrl: { type: String, required: true, trim: true },
    imagePublicId: { type: String, default: '', trim: true },
    /** Optional — internal path (/offers) or full URL. */
    linkUrl: { type: String, default: '', trim: true },
    sortOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
)

homeFeaturedEventItemSchema.index({ section: 1, sortOrder: 1, createdAt: -1 })

export const HomeFeaturedEventItem = mongoose.model('HomeFeaturedEventItem', homeFeaturedEventItemSchema)
