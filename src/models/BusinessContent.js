import mongoose from 'mongoose'

const offerItemSchema = new mongoose.Schema(
  {
    image: String,
    imagePublicId: { type: String, default: '' },
    title: String,
    description: String,
    /** Short action label on the public profile (max ~2 words), e.g. “Buy now”. */
    linkLabel: { type: String, default: '' },
    link: String,
    /** Original / list price (shown struck through when offer price is set). */
    priceActual: { type: String, default: '' },
    /** Promotional price (highlighted). */
    priceOffer: { type: String, default: '' },
  },
  { _id: true },
)

const serviceItemSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    imageUrl: String,
    imagePublicId: { type: String, default: '' },
    links: String,
    linkLabel: { type: String, default: '' },
  },
  { _id: true },
)

const catalogueItemSchema = new mongoose.Schema(
  {
    name: String,
    price: String,
    description: String,
    image: String,
    imagePublicId: { type: String, default: '' },
    link: String,
    linkLabel: { type: String, default: '' },
  },
  { _id: true },
)

const profileFeedItemSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    image: String,
    imagePublicId: { type: String, default: '' },
    link: String,
  },
  { _id: true },
)

const landingSectionSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    link: String,
    bannerTitle: String,
    bannerDescription: String,
    bannerImageUrl: String,
    bannerImagePublicId: { type: String, default: '' },
    welcomeTitle: String,
    welcomeDescription: String,
    welcomeImageUrl: String,
    welcomeImagePublicId: { type: String, default: '' },
    /** Landing (hero) primary CTA — label + link. */
    bannerCtaLabel: { type: String, default: '' },
    bannerCtaLink: { type: String, default: '' },
    /** Welcome section CTA — label + link. */
    welcomeCtaLabel: { type: String, default: '' },
    welcomeCtaLink: { type: String, default: '' },
    primaryColor: String,
    secondaryColor: String,
  },
  { _id: false },
)

const businessContentSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      unique: true,
    },
    landingSection: { type: landingSectionSchema, default: () => ({}) },
    welcomeSection: {
      title: String,
      description: String,
    },
    corePageTitle: { type: String, default: '' },
    corePageDescription: { type: String, default: '' },
    productsPageTitle: { type: String, default: '' },
    productsPageDescription: { type: String, default: '' },
    /** Heading copy for the public offers block (after welcome). */
    offersPageTitle: { type: String, default: '' },
    offersPageDescription: { type: String, default: '' },
    offers: { type: [offerItemSchema], default: [] },
    coreServices: { type: [serviceItemSchema], default: [] },
    catalogue: { type: [catalogueItemSchema], default: [] },
    /** Public profile feed (links, posts, social) — section title/description + cards. */
    feedPageTitle: { type: String, default: '' },
    feedPageDescription: { type: String, default: '' },
    profileFeed: { type: [profileFeedItemSchema], default: [] },
    gallery: { type: [String], default: [] },
  },
  { timestamps: true },
)

export const BusinessContent = mongoose.model('BusinessContent', businessContentSchema)
