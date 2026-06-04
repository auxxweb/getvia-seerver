import mongoose from 'mongoose'

export const LEGAL_DOC_TYPES = ['privacy-policy', 'terms-of-service', 'cookie-policy']

const legalDocumentSchema = new mongoose.Schema(
  {
    audience: { type: String, enum: ['consumer', 'business'], required: true, index: true },
    docType: { type: String, enum: LEGAL_DOC_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '' },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true },
)

legalDocumentSchema.index({ audience: 1, docType: 1 }, { unique: true })

export const LegalDocument =
  mongoose.models.LegalDocument || mongoose.model('LegalDocument', legalDocumentSchema)
