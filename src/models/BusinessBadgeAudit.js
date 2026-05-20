import mongoose from 'mongoose'

const businessBadgeAuditSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    action: { type: String, enum: ['GRANT', 'REVOKE'], required: true },
    badgeType: { type: String, enum: ['FEATURED', 'VERIFIED'], required: true },
    adminNotes: { type: String, default: '', trim: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

businessBadgeAuditSchema.index({ businessId: 1, createdAt: -1 })

export const BusinessBadgeAudit = mongoose.model('BusinessBadgeAudit', businessBadgeAuditSchema)
