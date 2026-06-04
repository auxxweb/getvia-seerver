/**
 * Delete user(s) and owned business data by email.
 * Usage: node scripts/delete-user-by-email.mjs test@gmail.com
 */
import '../bootstrap-env.js'
import mongoose from 'mongoose'
import { User } from '../src/models/User.js'
import { Business } from '../src/models/Business.js'
import { BusinessContent } from '../src/models/BusinessContent.js'
import { BusinessPlanUsage } from '../src/models/BusinessPlanUsage.js'
import { BadgeRequest } from '../src/models/BadgeRequest.js'
import { BusinessBadgeAudit } from '../src/models/BusinessBadgeAudit.js'
import { BusinessEnquiry } from '../src/models/BusinessEnquiry.js'
import { Payment } from '../src/models/Payment.js'
import { PaymentHistory } from '../src/models/PaymentHistory.js'
import { Review } from '../src/models/Review.js'
import { Analytics } from '../src/models/Analytics.js'
import { BusinessAnalytics } from '../src/models/analytics/BusinessAnalytics.model.js'
import { AnalyticsDaily } from '../src/models/analytics/AnalyticsDaily.model.js'
import { AnalyticsMonthly } from '../src/models/analytics/AnalyticsMonthly.model.js'
import { AnalyticsRealtime } from '../src/models/analytics/AnalyticsRealtime.model.js'
import { AnalyticsEvent } from '../src/models/analytics/AnalyticsEvent.model.js'
import { SupportMessage } from '../src/models/SupportMessage.js'

const email = String(process.argv[2] || '')
  .trim()
  .toLowerCase()
if (!email) {
  console.error('Usage: node scripts/delete-user-by-email.mjs <email>')
  process.exit(1)
}

const uri = process.env.MONGO_URI || process.env.MONGODB_URI
if (!uri) {
  console.error('No MONGO_URI')
  process.exit(1)
}

await mongoose.connect(uri)

const users = await User.find({ email }).lean()
if (!users.length) {
  console.log(`No users found with email ${email}`)
  await mongoose.disconnect()
  process.exit(0)
}

const userIds = users.map((u) => u._id)
const ownedBusinessIds = users.map((u) => u.ownedBusinessId).filter(Boolean)
const businessesByOwner = await Business.find({ ownerId: { $in: userIds } }).select('_id publicId name').lean()
const businessIdSet = new Set([
  ...ownedBusinessIds.map(String),
  ...businessesByOwner.map((b) => String(b._id)),
])
const businessIds = [...businessIdSet].map((id) => new mongoose.Types.ObjectId(id))

console.log('\nUsers to delete:')
for (const u of users) {
  console.log(`  - ${u._id} ${u.email} role=${u.role} name=${u.name}`)
}

console.log('\nBusinesses to delete:')
const bizRows =
  businessIds.length > 0
    ? await Business.find({ _id: { $in: businessIds } }).select('publicId name ownerId').lean()
    : []
for (const b of bizRows) {
  console.log(`  - ${b._id} /${b.publicId} "${b.name}"`)
}

if (!businessIds.length && !userIds.length) {
  await mongoose.disconnect()
  process.exit(0)
}

const bizFilter = businessIds.length ? { businessId: { $in: businessIds } } : null
const bizFilterAlt = businessIds.length ? { _id: { $in: businessIds } } : null

async function del(label, model, filter) {
  if (!filter) return 0
  const r = await model.deleteMany(filter)
  console.log(`  ${label}: ${r.deletedCount}`)
  return r.deletedCount
}

console.log('\nDeleting related records…')
if (bizFilter) {
  await del('BusinessContent', BusinessContent, bizFilter)
  await del('BusinessPlanUsage', BusinessPlanUsage, bizFilter)
  await del('BadgeRequest (business)', BadgeRequest, bizFilter)
  await del('BusinessBadgeAudit', BusinessBadgeAudit, bizFilter)
  await del('BusinessEnquiry', BusinessEnquiry, bizFilter)
  await del('Payment (business)', Payment, bizFilter)
  await del('PaymentHistory (business)', PaymentHistory, bizFilter)
  await del('Review (business)', Review, bizFilter)
  await del('Analytics (legacy)', Analytics, bizFilter)
  await del('BusinessAnalytics', BusinessAnalytics, bizFilter)
  await del('AnalyticsDaily', AnalyticsDaily, { businessId: { $in: businessIds } })
  await del('AnalyticsMonthly', AnalyticsMonthly, { businessId: { $in: businessIds } })
  await del('AnalyticsRealtime', AnalyticsRealtime, { businessId: { $in: businessIds } })
  await del('AnalyticsEvent (business)', AnalyticsEvent, { businessId: { $in: businessIds } })
  await del('Business', Business, bizFilterAlt)
}

await del('Payment (user)', Payment, { userId: { $in: userIds } })
await del('PaymentHistory (user)', PaymentHistory, { userId: { $in: userIds } })
await del('Review (user)', Review, { userId: { $in: userIds } })
await del('BadgeRequest (requestedBy)', BadgeRequest, { requestedBy: { $in: userIds } })
await del('AnalyticsEvent (user)', AnalyticsEvent, { userId: { $in: userIds } })
await del('SupportMessage', SupportMessage, { userId: { $in: userIds } })

if (businessIds.length) {
  const pullBiz = { $pull: { savedBusinesses: { $in: businessIds }, recentlyViewed: { $in: businessIds } } }
  const pulled = await User.updateMany(
    { $or: [{ savedBusinesses: { $in: businessIds } }, { recentlyViewed: { $in: businessIds } }] },
    pullBiz,
  )
  console.log(`  User refs pulled from others: ${pulled.modifiedCount} users updated`)
}

const userDel = await User.deleteMany({ _id: { $in: userIds } })
console.log(`  Users deleted: ${userDel.deletedCount}`)

console.log('\nDone.')
await mongoose.disconnect()
