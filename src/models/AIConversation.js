import mongoose from 'mongoose'

const aiConversationSchema = new mongoose.Schema(
  {
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Website',
      required: true,
      unique: true,
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    summarizedContext: { type: String, default: '' },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true },
)

aiConversationSchema.index({ userId: 1, updatedAt: -1 })

export const AIConversation =
  mongoose.models.AIConversation || mongoose.model('AIConversation', aiConversationSchema)
