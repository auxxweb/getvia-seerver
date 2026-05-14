import mongoose from 'mongoose'

const paymentHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', default: null },
    razorpayOrderId: { type: String, default: '' },
    razorpayPaymentId: { type: String, default: '' },
    amountPaise: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    plan: { type: String, enum: ['FREE', 'CORE', 'PRO', 'PREMIUM'], required: true },
    status: {
      type: String,
      enum: ['CREATED', 'PAID', 'FAILED', 'PENDING'],
      default: 'PENDING',
    },
    raw: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
)

export const PaymentHistory = mongoose.model('PaymentHistory', paymentHistorySchema)
