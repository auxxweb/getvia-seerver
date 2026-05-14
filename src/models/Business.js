import mongoose from 'mongoose'

const openingHoursSchema = new mongoose.Schema(
  {
    day: String,
    open: String,
    close: String,
    closed: { type: Boolean, default: false },
  },
  { _id: false },
)

const socialLinksSchema = new mongoose.Schema(
  {
    facebook: String,
    instagram: String,
    twitter: String,
    linkedin: String,
    whatsapp: String,
    website: String,
  },
  { _id: false },
)

const themeSettingsSchema = new mongoose.Schema(
  {
    primaryColor: { type: String, default: '#177043' },
    secondaryColor: { type: String, default: '#1E73BE' },
    template: { type: String, default: 'template-one' },
    /** Per-template color overrides: { "template-one": { primary, secondary, tertiary } } */
    themeColorPresets: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { _id: false },
)

const businessSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    /** Public slug for URLs — seed uses l-1 … l-12 to match existing UI */
    publicId: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    logo: { type: String, default: '' },
    logoPublicId: { type: String, default: '' },
    category: { type: String, default: '' },
    subcategory: { type: String, default: '' },
    address: { type: String, default: '' },
    /** Full line from geocoder (Google / etc.) */
    formattedAddress: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    country: { type: String, default: '' },
    postalCode: { type: String, default: '' },
    landmark: { type: String, default: '' },
    /** Google Places place_id (optional, populated via onboarding map picker). */
    placeId: { type: String, default: '' },
    /** Shareable maps URL for "Open in Google Maps" CTA (optional). */
    googleMapLink: { type: String, default: '' },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        /**
         * [lng, lat] - keep optional for legacy businesses.
         * When unset, geo queries should exclude the document.
         */
        default: undefined,
      },
    },
    /**
     * Map location used for geo features (nearby, distance, maps).
     * This is intentionally separate from the free-form `address` field.
     */
    mapLocation: {
      formattedAddress: { type: String, default: '' },
      placeId: { type: String, default: '' },
      googleMapLink: { type: String, default: '' },
      coordinates: {
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
      },
      geoPoint: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point',
        },
        // IMPORTANT: GeoJSON coordinate order is [lng, lat]
        coordinates: {
          type: [Number],
          default: [0, 0],
        },
      },
    },
    openingHours: { type: [openingHoursSchema], default: [] },
    description: { type: String, default: '' },
    socialLinks: { type: socialLinksSchema, default: {} },
    isVerified: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    isTrending: { type: Boolean, default: false },
    approvalStatus: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
    plan: {
      type: String,
      enum: ['FREE', 'CORE', 'PRO', 'PREMIUM'],
      default: 'FREE',
    },
    /** Dynamic subscription plan document (paid tiers). */
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      default: null,
    },
    subscriptionStatus: {
      type: String,
      enum: ['ACTIVE', 'EXPIRED', 'CANCELLED'],
    },
    subscriptionStart: { type: Date, default: null },
    subscriptionEnd: { type: Date, default: null },
    /** When set, time-bound listing plan ends at this instant (past date = expired). Omit/null = no expiry-driven banner. */
    planExpiresAt: { type: Date, default: null },
    themeSettings: { type: themeSettingsSchema, default: () => ({}) },
    phone: { type: String, default: '' },
    contactName: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    whatsappHref: { type: String, default: '' },
    /** Set when the owner finishes the onboarding wizard (all steps). */
    onboardingCompletedAt: { type: Date, default: null },
    ratingAvg: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
  },
  { timestamps: true },
)

businessSchema.index({ location: '2dsphere' })
businessSchema.index({ 'mapLocation.geoPoint': '2dsphere' })
businessSchema.index({ name: 'text', description: 'text', category: 'text' })

export const Business = mongoose.model('Business', businessSchema)
