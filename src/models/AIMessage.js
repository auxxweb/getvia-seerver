import mongoose from 'mongoose'

const aiMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AIConversation',
      required: true,
      index: true,
    },
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
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    content: { type: String, default: '' },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AIJob',
      default: null,
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true },
)

aiMessageSchema.index({ conversationId: 1, createdAt: 1 })
aiMessageSchema.index({ siteId: 1, createdAt: -1 })

export const AIMessage = mongoose.models.AIMessage || mongoose.model('AIMessage', aiMessageSchema)
