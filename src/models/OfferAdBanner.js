import mongoose from 'mongoose'

const offerAdBannerSchema = new mongoose.Schema(
  {
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    /** Optional: when set, banner shows only for this subcategory slug. */
    subSlug: { type: String, default: '', trim: true, index: true },

    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },

    offerPercentage: { type: Number, default: null },
    priceActual: { type: String, default: '', trim: true },
    priceOffer: { type: String, default: '', trim: true },

    imageUrl: { type: String, default: '', trim: true },
    imagePublicId: { type: String, default: '', trim: true },

    /** Toggle to surface on home page carousel. */
    showOnHome: { type: Boolean, default: false, index: true },

    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },

    /** Allows manual unpublish without deleting. */
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
)

offerAdBannerSchema.index({ categoryId: 1, subSlug: 1, startDate: -1 })

export const OfferAdBanner = mongoose.model('OfferAdBanner', offerAdBannerSchema)

