import crypto from 'crypto'
import Razorpay from 'razorpay'
import { HttpError } from '../middleware/errorHandler.js'

function getKeyId() {
  return (process.env.RAZORPAY_KEY_ID || '').trim()
}

function getKeySecret() {
  return (process.env.RAZORPAY_KEY_SECRET || '').trim()
}

/** @returns {'test' | 'live' | 'unknown'} */
export function getRazorpayKeyMode() {
  const id = getKeyId()
  if (id.startsWith('rzp_test_')) return 'test'
  if (id.startsWith('rzp_live_')) return 'live'
  return 'unknown'
}

export function assertRazorpayConfigured() {
  const id = getKeyId()
  const secret = getKeySecret()
  if (!id || !secret) {
    throw new HttpError(
      503,
      'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server.',
    )
  }
  if (getRazorpayKeyMode() === 'unknown') {
    throw new HttpError(
      503,
      'RAZORPAY_KEY_ID must start with rzp_live_ (live) or rzp_test_ (test).',
    )
  }
  if (getRazorpayKeyMode() === 'test') {
    console.warn(
      '[razorpay] Test mode keys (rzp_test_). Switch to Live Mode keys (rzp_live_) in Dashboard → API Keys when going live.',
    )
  } else if (getRazorpayKeyMode() === 'live') {
    console.info('[razorpay] Live mode — real payments enabled.')
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
  try {
    const rzp = getClient()
    const order = await rzp.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: receipt.slice(0, 40),
      notes,
    })
    return order
  } catch (err) {
    const status = err?.statusCode ?? err?.error?.statusCode
    if (status === 401) {
      throw new HttpError(
        502,
        'Razorpay rejected your API credentials (401). In Dashboard → API Keys (Live mode), generate a new matching Key ID + Secret (rzp_live_…), update server/.env, and restart the API server.',
      )
    }
    throw err
  }
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
