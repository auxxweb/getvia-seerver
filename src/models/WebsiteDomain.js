import mongoose from 'mongoose'
import { DOMAIN_STATUS } from '../ai-builder/constants.js'

const websiteDomainSchema = new mongoose.Schema(
  {
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Website',
      required: true,
      index: true,
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    hostname: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: DOMAIN_STATUS,
      default: 'PENDING',
      index: true,
    },
    verificationToken: { type: String, required: true },
    cnameTarget: { type: String, default: '' },
    httpsStatus: {
      type: String,
      enum: ['unknown', 'pending', 'active', 'failed'],
      default: 'unknown',
    },
    verifiedAt: { type: Date, default: null },
    lastCheckAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
  },
  { timestamps: true },
)

websiteDomainSchema.index({ siteId: 1, status: 1 })

export const WebsiteDomain =
  mongoose.models.WebsiteDomain || mongoose.model('WebsiteDomain', websiteDomainSchema)
