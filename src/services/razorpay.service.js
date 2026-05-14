import crypto from 'crypto'
import Razorpay from 'razorpay'
import { HttpError } from '../middleware/errorHandler.js'

function getKeyId() {
  return process.env.RAZORPAY_KEY_ID || ''
}

function getKeySecret() {
  return process.env.RAZORPAY_KEY_SECRET || ''
}

export function assertRazorpayConfigured() {
  if (!getKeyId() || !getKeySecret()) {
    throw new HttpError(
      503,
      'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server.',
    )
  }
}

function getClient() {
  assertRazorpayConfigured()
  return new Razorpay({
    key_id: getKeyId(),
    key_secret: getKeySecret(),
  })
}

/**
 * @param {{ amountPaise: number, receipt: string, notes?: Record<string, string> }} opts
 */
export async function createRazorpayOrder({ amountPaise, receipt, notes = {} }) {
  const rzp = getClient()
  const order = await rzp.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt: receipt.slice(0, 40),
    notes,
  })
  return order
}

export function verifyRazorpaySignature(orderId, paymentId, signature) {
  assertRazorpayConfigured()
  const body = `${orderId}|${paymentId}`
  const expected = crypto.createHmac('sha256', getKeySecret()).update(body).digest('hex')
  return expected === signature
}

export function getPublicKeyId() {
  return getKeyId()
}
