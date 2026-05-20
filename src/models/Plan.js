import mongoose from 'mongoose'
import { OFFER_POSTING_PERIODS } from '../constants/planEntitlements.js'

const planEntitlementsSchema = new mongoose.Schema(
  {
    /** Max gallery images; null = unlimited. 0 = none allowed. */
    galleryImageLimit: { type: Number, default: null, min: 0 },
    /** Number of profile templates the owner may select (from ordered list). null = all. */
    templateCount: { type: Number, default: null, min: 0 },
    /** AI content prompts per calendar month; null = unlimited. */
    aiPromptsPerMonth: { type: Number, default: null, min: 0 },
    offerPostingPeriod: {
      type: String,
      enum: OFFER_POSTING_PERIODS,
      default: 'monthly',
    },
    /** Max new offer cards per offerPostingPeriod window; null = unlimited. */
    offerPostingLimit: { type: Number, default: null, min: 0 },
    /** AI improvement suggestions on analytics dashboard. */
    aiInsightsEnabled: { type: Boolean, default: false },
  },
  { _id: false },
)

const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Price in INR (whole rupees for display; converted to paise at checkout). */
    price: { type: Number, required: true, min: 0 },
    validity: { type: Number, required: true, min: 1 },
    features: { type: [String], default: [] },
    entitlements: { type: planEntitlementsSchema, default: () => ({}) },
    isActive: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true },
)

planSchema.index({ isActive: 1 })

export const Plan = mongoose.models.Plan || mongoose.model('Plan', planSchema)
