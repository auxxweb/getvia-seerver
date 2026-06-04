/**
 * One-off revenue inspection — run: node scripts/inspect-revenue.mjs
 */
import '../bootstrap-env.js'
import mongoose from 'mongoose'
import { Payment } from '../src/models/Payment.js'
import { PaymentHistory } from '../src/models/PaymentHistory.js'

const uri = process.env.MONGO_URI || process.env.MONGODB_URI
if (!uri) {
  console.error('No MONGO_URI')
  process.exit(1)
}

await mongoose.connect(uri)

const now = new Date()
const from30 = new Date(now)
from30.setUTCDate(from30.getUTCDate() - 30)
const fromKey = from30.toISOString().slice(0, 10)
const toKey = now.toISOString().slice(0, 10)
const rangeStart = new Date(`${fromKey}T00:00:00.000Z`)
const rangeEnd = new Date(`${toKey}T23:59:59.999Z`)

function paiseToInr(p) {
  return `₹${((Number(p) || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
}

const [
  histPaidAll,
  histPaidRange,
  histByStatus,
  paySuccessAll,
  paySuccessRange,
  payByStatus,
  payPending,
  payFailedRange,
] = await Promise.all([
  PaymentHistory.aggregate([
    { $match: { status: 'PAID' } },
    { $group: { _id: null, n: { $sum: 1 }, total: { $sum: '$amountPaise' } } },
  ]),
  PaymentHistory.aggregate([
    { $match: { status: 'PAID', createdAt: { $gte: rangeStart, $lte: rangeEnd } } },
    { $group: { _id: null, n: { $sum: 1 }, total: { $sum: '$amountPaise' } } },
  ]),
  PaymentHistory.aggregate([
    { $group: { _id: '$status', n: { $sum: 1 }, total: { $sum: '$amountPaise' } } },
    { $sort: { n: -1 } },
  ]),
  Payment.aggregate([
    { $match: { status: 'SUCCESS' } },
    { $group: { _id: null, n: { $sum: 1 }, total: { $sum: '$amount' } } },
  ]),
  Payment.aggregate([
    { $match: { status: 'SUCCESS', createdAt: { $gte: rangeStart, $lte: rangeEnd } } },
    { $group: { _id: null, n: { $sum: 1 }, total: { $sum: '$amount' } } },
  ]),
  Payment.aggregate([
    { $group: { _id: '$status', n: { $sum: 1 }, total: { $sum: '$amount' } } },
    { $sort: { n: -1 } },
  ]),
  Payment.countDocuments({ status: 'PENDING' }),
  Payment.countDocuments({ status: 'FAILED', createdAt: { $gte: rangeStart, $lte: rangeEnd } }),
])

const dashboardAllTime = histPaidAll[0]?.total || 0
const dashboardRange =
  (histPaidRange[0]?.total || 0) + (paySuccessRange[0]?.total || 0)

console.log('\n=== What dashboard shows today ===')
console.log('Revenue (all time) — API uses PaymentHistory PAID only:', paiseToInr(dashboardAllTime), `(${dashboardAllTime} paise)`)
console.log('Revenue (30d) — API uses PaymentHistory PAID + Payment SUCCESS in range:', paiseToInr(dashboardRange), `(${dashboardRange} paise)`)
console.log('Failed in 30d (Payment FAILED in range):', payFailedRange)
console.log('Pending (Payment PENDING all-time, not range):', payPending)

console.log('\n=== PaymentHistory by status ===')
for (const r of histByStatus) {
  console.log(`  ${r._id}: ${r.n} rows, sum amountPaise=${r.total} (${paiseToInr(r.total)})`)
}

console.log('\n=== Payment collection by status ===')
for (const r of payByStatus) {
  console.log(`  ${r._id}: ${r.n} rows, sum amount=${r.total} (${paiseToInr(r.total)})`)
}

console.log('\n=== Corrected all-time (both sources, dedupe not applied) ===')
const correctedAll = (histPaidAll[0]?.total || 0) + (paySuccessAll[0]?.total || 0)
console.log('PaymentHistory PAID + Payment SUCCESS:', paiseToInr(correctedAll), '(may double-count if both logged per payment)')

const samplePaidHist = await PaymentHistory.find({ status: 'PAID' })
  .sort({ createdAt: -1 })
  .limit(5)
  .select('amountPaise plan status createdAt razorpayPaymentId')
  .lean()
const sampleSuccess = await Payment.find({ status: 'SUCCESS' })
  .sort({ createdAt: -1 })
  .limit(5)
  .select('amount status createdAt razorpayPaymentId planId')
  .populate('planId', 'name price')
  .lean()

console.log('\n=== Sample PaymentHistory PAID (latest 5) ===')
for (const h of samplePaidHist) {
  console.log(h)
}

console.log('\n=== Sample Payment SUCCESS (latest 5) ===')
for (const p of sampleSuccess) {
  console.log({
    amount: p.amount,
    inr: paiseToInr(p.amount),
    plan: p.planId?.name,
    planPriceInr: p.planId?.price,
    status: p.status,
    createdAt: p.createdAt,
    razorpayPaymentId: p.razorpayPaymentId,
  })
}

await mongoose.disconnect()
