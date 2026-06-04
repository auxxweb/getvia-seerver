import mongoose from 'mongoose'
import { AnalyticsDaily } from '../../models/analytics/AnalyticsDaily.model.js'
import { AnalyticsMonthly } from '../../models/analytics/AnalyticsMonthly.model.js'
import { AnalyticsRealtime } from '../../models/analytics/AnalyticsRealtime.model.js'
import { AnalyticsEvent } from '../../models/analytics/AnalyticsEvent.model.js'
import { BusinessAnalytics } from '../../models/analytics/BusinessAnalytics.model.js'
import { AdminAnalytics } from '../../models/analytics/AdminAnalytics.model.js'
import { Review } from '../../models/Review.js'
import { Business } from '../../models/Business.js'
import { User } from '../../models/User.js'
import { PaymentHistory } from '../../models/PaymentHistory.js'

function utcDateKey(d) {
  return new Date(d).toISOString().slice(0, 10)
}

function addDays(d, n) {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + n)
  return x
}

/** Display label for super-admin analytics (matches onboarded list: planId.name, not legacy enum only). */
export function formatBusinessPlanDisplay(row) {
  const name =
    (row.planName && String(row.planName).trim()) ||
    (row.planTier && String(row.planTier).trim()) ||
    'FREE'
  const now = Date.now()
  const endMs = row.subscriptionEnd ? new Date(row.subscriptionEnd).getTime() : null
  const expiresMs = row.planExpiresAt ? new Date(row.planExpiresAt).getTime() : null
  const status = row.subscriptionStatus

  const timeExpired =
    (Number.isFinite(endMs) && endMs < now) ||
    (Number.isFinite(expiresMs) && expiresMs < now)

  if (status === 'CANCELLED') return `${name} (cancelled)`
  if (status === 'EXPIRED' || timeExpired) return `${name} (expired)`
  return name
}

function rangeBoundsUtc(from, to) {
  return {
    start: new Date(`${from}T00:00:00.000Z`),
    end: new Date(`${to}T23:59:59.999Z`),
  }
}

async function signupsByDay(Model, start, end) {
  const rows = await Model.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ])
  return rows.map((r) => ({ date: r._id, count: r.count }))
}

export function resolveDateRange(q) {
  const preset = String(q.preset || 'last_30d').toLowerCase()
  const now = new Date()
  const today = utcDateKey(now)
  let from
  let to = today
  if (preset === 'today') {
    from = today
  } else if (preset === 'yesterday') {
    from = utcDateKey(addDays(now, -1))
    to = from
  } else if (preset === 'last_7d') {
    from = utcDateKey(addDays(now, -6))
  } else if (preset === 'last_14d') {
    from = utcDateKey(addDays(now, -13))
  } else if (preset === 'last_90d') {
    from = utcDateKey(addDays(now, -89))
  } else if (preset === 'last_30d') {
    from = utcDateKey(addDays(now, -29))
  } else {
    from = q.from ? String(q.from).slice(0, 10) : utcDateKey(addDays(now, -29))
    to = q.to ? String(q.to).slice(0, 10) : today
  }
  return { from, to, preset }
}

function counterGet(counters, key) {
  if (!counters || typeof counters !== 'object') return 0
  return Number(counters[key] || 0)
}

function mergeDailyRows(rows) {
  const merged = {
    counters: {},
    byDevice: {},
    byBrowser: {},
    byCountry: {},
    byCity: {},
    bySource: {},
    bySection: {},
    heatmap: {},
  }
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.counters || {})) {
      merged.counters[k] = (merged.counters[k] || 0) + Number(v || 0)
    }
    for (const mapKey of ['byDevice', 'byBrowser', 'byCountry', 'byCity', 'bySource', 'bySection', 'heatmap']) {
      for (const [k, v] of Object.entries(r[mapKey] || {})) {
        merged[mapKey][k] = (merged[mapKey][k] || 0) + Number(v || 0)
      }
    }
  }
  return merged
}

export async function getBusinessDashboard(businessId, query) {
  const { from, to } = resolveDateRange(query)
  const bid = new mongoose.Types.ObjectId(String(businessId))

  const daily = await AnalyticsDaily.find({
    scope: 'business',
    businessId: bid,
    dateKey: { $gte: from, $lte: to },
  }).lean()

  const merged = mergeDailyRows(daily)

  const uniqueVisitors = await AnalyticsEvent.distinct('visitorId', {
    businessId: bid,
    visitorId: { $nin: ['', null] },
    createdAt: {
      $gte: new Date(`${from}T00:00:00.000Z`),
      $lte: new Date(`${to}T23:59:59.999Z`),
    },
  }).then((a) => a.length)

  const snap = await BusinessAnalytics.findOne({ businessId: bid }).lean()
  const reviewSummary = snap?.reviewSummary || {}
  if (!reviewSummary.count) {
    const r = await Review.aggregate([
      { $match: { businessId: bid } },
      { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
    ])
    reviewSummary.count = r[0]?.n || 0
    reviewSummary.avg = Math.round((r[0]?.avg || 0) * 10) / 10
  }

  const views = counterGet(merged.counters, 'PROFILE_VIEW') + counterGet(merged.counters, 'PAGE_VISIT')
  const clicks =
    counterGet(merged.counters, 'WHATSAPP_CLICK') +
    counterGet(merged.counters, 'CALL_CLICK') +
    counterGet(merged.counters, 'WEBSITE_CLICK') +
    counterGet(merged.counters, 'SHARE_CLICK') +
    counterGet(merged.counters, 'DIRECTION_CLICK')

  const trend = daily
    .map((d) => ({
      date: d.dateKey,
      views: counterGet(d.counters, 'PROFILE_VIEW') + counterGet(d.counters, 'PAGE_VISIT'),
      clicks:
        counterGet(d.counters, 'WHATSAPP_CLICK') +
        counterGet(d.counters, 'CALL_CLICK') +
        counterGet(d.counters, 'WEBSITE_CLICK'),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const topSections = Object.entries(merged.bySection || {})
    .map(([key, score]) => ({ key, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)

  const heatmap = Object.entries(merged.heatmap || {})
    .map(([key, value]) => {
      const m = key.match(/^d(\d+)_h(\d+)$/)
      return m ? { day: Number(m[1]), hour: Number(m[2]), value } : null
    })
    .filter(Boolean)

  const out = {
    range: { from, to },
    kpis: {
      profileViews: counterGet(merged.counters, 'PROFILE_VIEW'),
      pageVisits: counterGet(merged.counters, 'PAGE_VISIT'),
      profileCardClicks: counterGet(merged.counters, 'PROFILE_CARD_CLICK'),
      whatsappClicks: counterGet(merged.counters, 'WHATSAPP_CLICK'),
      callClicks: counterGet(merged.counters, 'CALL_CLICK'),
      websiteClicks: counterGet(merged.counters, 'WEBSITE_CLICK'),
      saveBusiness: counterGet(merged.counters, 'SAVE_BUSINESS'),
      shareClicks: counterGet(merged.counters, 'SHARE_CLICK'),
      directionClicks: counterGet(merged.counters, 'DIRECTION_CLICK'),
      bookingClicks: counterGet(merged.counters, 'BOOKING_CLICK'),
      qrScans: counterGet(merged.counters, 'QR_SCAN'),
      nfcTaps: counterGet(merged.counters, 'NFC_TAP'),
      sectionViews: counterGet(merged.counters, 'SECTION_VIEW'),
      uniqueVisitors,
      returningVisitors: 0,
      ctr: views > 0 ? Math.round((clicks / views) * 10000) / 100 : 0,
      conversionRate: views > 0 ? Math.round((counterGet(merged.counters, 'BOOKING_CLICK') / views) * 10000) / 100 : 0,
    },
    reviewSummary,
    device: merged.byDevice,
    browser: merged.byBrowser,
    geography: { countries: merged.byCountry, cities: merged.byCity },
    trafficSources: merged.bySource,
    topSections,
    trend,
    heatmap,
    snapshot: snap,
  }

  return out
}

async function livePlatformSnapshot() {
  const [users, businesses, activeBiz, reviews, payments] = await Promise.all([
    User.countDocuments(),
    Business.countDocuments(),
    Business.countDocuments({ approvalStatus: 'APPROVED' }),
    Review.countDocuments(),
    PaymentHistory.aggregate([
      { $match: { status: 'PAID' } },
      { $group: { _id: null, revenuePaise: { $sum: '$amountPaise' } } },
    ]),
  ])
  const revenuePaise = payments[0]?.revenuePaise || 0
  const planBreakdown = await Business.aggregate([
    { $match: { approvalStatus: 'APPROVED' } },
    { $group: { _id: '$plan', n: { $sum: 1 } } },
  ])
  return {
    totals: {
      users,
      businesses,
      activeBusinesses: activeBiz,
      reviews,
      revenuePaise,
      revenueDisplay: (revenuePaise / 100).toFixed(2),
    },
    subscriptionByPlan: Object.fromEntries(planBreakdown.map((p) => [p._id || 'UNKNOWN', p.n])),
    dauToday: 0,
    mauApprox: 0,
    eventVolume24h: 0,
  }
}

export async function getPlatformDashboard(query) {
  const { from, to } = resolveDateRange(query)
  const { start: rangeStart, end: rangeEnd } = rangeBoundsUtc(from, to)
  const daily = await AnalyticsDaily.find({
    scope: 'platform',
    businessId: null,
    dateKey: { $gte: from, $lte: to },
  })
    .sort({ dateKey: 1 })
    .lean()

  const merged = mergeDailyRows(daily)
  const adminDoc = await AdminAnalytics.findOne({ key: 'platform' }).lean()
  const admin =
    adminDoc?.totals?.users != null ? adminDoc : { ...(adminDoc || {}), ...(await livePlatformSnapshot()) }

  const [userGrowth, businessGrowth, usersByRole, businessOwners] = await Promise.all([
    signupsByDay(User, rangeStart, rangeEnd),
    signupsByDay(Business, rangeStart, rangeEnd),
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    User.countDocuments({ role: 'BUSINESS_OWNER' }),
  ])

  const topBusinesses = await AnalyticsDaily.aggregate([
    {
      $match: {
        scope: 'business',
        dateKey: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: '$businessId',
        views: { $sum: { $ifNull: ['$counters.PROFILE_VIEW', 0] } },
        engagement: {
          $sum: {
            $add: [
              { $ifNull: ['$counters.WHATSAPP_CLICK', 0] },
              { $ifNull: ['$counters.CALL_CLICK', 0] },
              { $ifNull: ['$counters.SHARE_CLICK', 0] },
            ],
          },
        },
      },
    },
    { $sort: { views: -1 } },
    { $limit: 20 },
    {
      $lookup: {
        from: 'businesses',
        localField: '_id',
        foreignField: '_id',
        as: 'biz',
      },
    },
    { $unwind: { path: '$biz', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'plans',
        localField: 'biz.planId',
        foreignField: '_id',
        as: 'planDoc',
      },
    },
    { $unwind: { path: '$planDoc', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        businessId: '$_id',
        name: '$biz.name',
        publicId: '$biz.publicId',
        category: '$biz.category',
        planName: '$planDoc.name',
        planTier: '$biz.plan',
        subscriptionStatus: '$biz.subscriptionStatus',
        subscriptionEnd: '$biz.subscriptionEnd',
        planExpiresAt: '$biz.planExpiresAt',
        views: 1,
        engagement: 1,
      },
    },
  ])

  const topBusinessesFormatted = topBusinesses.map((row) => ({
    businessId: row.businessId,
    name: row.name,
    publicId: row.publicId,
    category: row.category,
    plan: formatBusinessPlanDisplay(row),
    views: row.views,
    engagement: row.engagement,
  }))

  const categoryTrend = await Business.aggregate([
    { $match: { approvalStatus: 'APPROVED' } },
    { $group: { _id: '$category', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 15 },
  ])

  const trend = daily.map((d) => ({
    date: d.dateKey,
    views: counterGet(d.counters, 'PROFILE_VIEW') + counterGet(d.counters, 'PAGE_VISIT'),
    events: Object.values(d.counters || {}).reduce((a, b) => a + Number(b || 0), 0),
  }))

  const heatmap = Object.entries(merged.heatmap || {})
    .map(([key, value]) => {
      const m = key.match(/^d(\d+)_h(\d+)$/)
      return m ? { day: Number(m[1]), hour: Number(m[2]), value } : null
    })
    .filter(Boolean)

  return {
    range: { from, to },
    snapshot: admin,
    usersByRole: usersByRole.map((r) => ({ role: r._id || 'UNKNOWN', count: r.count })),
    businessOwners,
    userGrowth,
    businessGrowth,
    kpis: {
      platformViews: counterGet(merged.counters, 'PROFILE_VIEW') + counterGet(merged.counters, 'PAGE_VISIT'),
      whatsappClicks: counterGet(merged.counters, 'WHATSAPP_CLICK'),
      callClicks: counterGet(merged.counters, 'CALL_CLICK'),
      shareClicks: counterGet(merged.counters, 'SHARE_CLICK'),
      uniqueVisitors: 0,
    },
    device: merged.byDevice,
    browser: merged.byBrowser,
    geography: { countries: merged.byCountry, cities: merged.byCity },
    trafficSources: merged.bySource,
    topBusinesses: topBusinessesFormatted,
    topCategories: categoryTrend.map((c) => ({ category: c._id || '—', count: c.n })),
    trend,
    heatmap,
  }
}

export async function getRealtimeBuckets(scope, businessId, limit = 36) {
  const filter =
    scope === 'platform'
      ? { scope: 'platform', businessId: null }
      : { scope: 'business', businessId: new mongoose.Types.ObjectId(String(businessId)) }
  return AnalyticsRealtime.find(filter)
    .sort({ bucketStart: -1 })
    .limit(limit)
    .lean()
}

export function toCsvRowsBusiness(dashboard) {
  const { kpis, trend, topSections, range } = dashboard
  const lines = [
    ['from', range.from],
    ['to', range.to],
    ['metric', 'value'],
    ...Object.entries(kpis).map(([k, v]) => [k, v]),
    [],
    ['date', 'views', 'clicks'],
    ...trend.map((t) => [t.date, t.views, t.clicks]),
    [],
    ['section', 'views'],
    ...topSections.map((s) => [s.key, s.score]),
  ]
  return lines
}

export function toCsvRowsPlatform(dashboard) {
  const { kpis, trend, topBusinesses, range } = dashboard
  const lines = [
    ['from', range.from],
    ['to', range.to],
    ['metric', 'value'],
    ...Object.entries(kpis).map(([k, v]) => [k, v]),
    [],
    ['date', 'views', 'events'],
    ...trend.map((t) => [t.date, t.views, t.events]),
    [],
    ['business', 'publicId', 'plan', 'views', 'engagement'],
    ...topBusinesses.map((b) => [b.name, b.publicId, b.plan, b.views, b.engagement]),
  ]
  return lines
}
