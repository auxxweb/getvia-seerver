import mongoose from 'mongoose'
import { AnalyticsEvent } from '../../models/analytics/AnalyticsEvent.model.js'
import { AnalyticsDaily } from '../../models/analytics/AnalyticsDaily.model.js'
import { AnalyticsMonthly } from '../../models/analytics/AnalyticsMonthly.model.js'
import { AnalyticsRealtime } from '../../models/analytics/AnalyticsRealtime.model.js'
import { AnalyticsRollupState } from '../../models/analytics/AnalyticsRollupState.model.js'
import { BusinessAnalytics } from '../../models/analytics/BusinessAnalytics.model.js'
import { AdminAnalytics } from '../../models/analytics/AdminAnalytics.model.js'
import { Business } from '../../models/Business.js'
import { User } from '../../models/User.js'
import { Review } from '../../models/Review.js'
import { PaymentHistory } from '../../models/PaymentHistory.js'

const BATCH = 4000

function utcDateKey(d) {
  return new Date(d).toISOString().slice(0, 10)
}

function monthKey(d) {
  return new Date(d).toISOString().slice(0, 7)
}

function floorToFiveMin(d) {
  const x = new Date(d)
  const m = x.getUTCMinutes()
  x.setUTCMinutes(m - (m % 5), 0, 0)
  return x
}

function safeDim(s) {
  return String(s || 'unknown')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64)
}

/**
 * Incremental rollup from raw events → daily + realtime buckets.
 */
export async function runIncrementalRollup() {
  let state = await AnalyticsRollupState.findById('main')
  if (!state) {
    state = await AnalyticsRollupState.create({ _id: 'main', lastProcessedAt: new Date(0) })
  }
  const since = state.lastProcessedAt
  const events = await AnalyticsEvent.find({ createdAt: { $gt: since } })
    .sort({ createdAt: 1 })
    .limit(BATCH)
    .lean()

  if (!events.length) return { processed: 0 }

  const byBizDay = {}
  const byPlatDay = {}
  const byBizRt = {}
  const byPlatRt = {}

  let maxCreated = since

  for (const e of events) {
    const created = new Date(e.createdAt || e.timestamp)
    if (created > maxCreated) maxCreated = created

    const day = utcDateKey(created)
    const bucket = floorToFiveMin(created)
    const bucketT = bucket.getTime()
    const type = e.eventType
    const dev = safeDim(e.device)
    const bro = safeDim(e.browser)
    const country = safeDim(e.country)
    const city = safeDim(e.city)
    const src = safeDim(e.source)
    const dow = created.getUTCDay()
    const hr = created.getUTCHours()
    const hk = `d${dow}_h${hr}`
    const section = e.metadata?.section || e.metadata?.sectionId || e.metadata?.sectionKey
    const sec = section ? safeDim(section) : null

    const bump = (container, key) => {
      if (!container[key]) {
        container[key] = {
          counters: {},
          byDevice: {},
          byBrowser: {},
          byCountry: {},
          byCity: {},
          bySource: {},
          bySection: {},
          heatmap: {},
        }
      }
      const row = container[key]
      row.counters[type] = (row.counters[type] || 0) + 1
      row.byDevice[dev] = (row.byDevice[dev] || 0) + 1
      row.byBrowser[bro] = (row.byBrowser[bro] || 0) + 1
      row.byCountry[country] = (row.byCountry[country] || 0) + 1
      row.byCity[city] = (row.byCity[city] || 0) + 1
      row.bySource[src] = (row.bySource[src] || 0) + 1
      row.heatmap[hk] = (row.heatmap[hk] || 0) + 1
      if (sec) row.bySection[sec] = (row.bySection[sec] || 0) + 1
    }

    const pk = `${day}`
    bump(byPlatDay, pk)

    const prtk = `${bucketT}`
    if (!byPlatRt[prtk]) byPlatRt[prtk] = { counters: {}, apiEventsIngested: 0 }
    byPlatRt[prtk].counters[type] = (byPlatRt[prtk].counters[type] || 0) + 1
    byPlatRt[prtk].apiEventsIngested += 1

    if (e.businessId) {
      const bid = String(e.businessId)
      const bk = `${bid}|${day}`
      bump(byBizDay, bk)

      const brtk = `${bid}|${bucketT}`
      if (!byBizRt[brtk]) byBizRt[brtk] = { counters: {}, apiEventsIngested: 0 }
      byBizRt[brtk].counters[type] = (byBizRt[brtk].counters[type] || 0) + 1
      byBizRt[brtk].apiEventsIngested += 1
    }
  }

  const opsDaily = []

  for (const [day, row] of Object.entries(byPlatDay)) {
    const inc = {}
    for (const [k, v] of Object.entries(row.counters)) inc[`counters.${k}`] = v
    for (const [k, v] of Object.entries(row.byDevice)) inc[`byDevice.${k}`] = v
    for (const [k, v] of Object.entries(row.byBrowser)) inc[`byBrowser.${k}`] = v
    for (const [k, v] of Object.entries(row.byCountry)) inc[`byCountry.${k}`] = v
    for (const [k, v] of Object.entries(row.byCity)) inc[`byCity.${k}`] = v
    for (const [k, v] of Object.entries(row.bySource)) inc[`bySource.${k}`] = v
    for (const [k, v] of Object.entries(row.heatmap)) inc[`heatmap.${k}`] = v
    opsDaily.push({
      updateOne: {
        filter: { scope: 'platform', businessId: null, dateKey: day },
        update: { $inc: inc, $set: { updatedAtRollup: new Date() } },
        upsert: true,
      },
    })
  }

  for (const [compound, row] of Object.entries(byBizDay)) {
    const [bid, day] = compound.split('|')
    const inc = {}
    for (const [k, v] of Object.entries(row.counters)) inc[`counters.${k}`] = v
    for (const [k, v] of Object.entries(row.byDevice)) inc[`byDevice.${k}`] = v
    for (const [k, v] of Object.entries(row.byBrowser)) inc[`byBrowser.${k}`] = v
    for (const [k, v] of Object.entries(row.byCountry)) inc[`byCountry.${k}`] = v
    for (const [k, v] of Object.entries(row.byCity)) inc[`byCity.${k}`] = v
    for (const [k, v] of Object.entries(row.bySource)) inc[`bySource.${k}`] = v
    for (const [k, v] of Object.entries(row.bySection)) inc[`bySection.${k}`] = v
    for (const [k, v] of Object.entries(row.heatmap)) inc[`heatmap.${k}`] = v
    opsDaily.push({
      updateOne: {
        filter: { scope: 'business', businessId: new mongoose.Types.ObjectId(bid), dateKey: day },
        update: { $inc: inc, $set: { updatedAtRollup: new Date() } },
        upsert: true,
      },
    })
  }

  if (opsDaily.length) await AnalyticsDaily.bulkWrite(opsDaily, { ordered: false })

  const opsRt = []
  for (const [key, row] of Object.entries(byPlatRt)) {
    const bucketStart = new Date(Number(key))
    const inc = {}
    for (const [k, v] of Object.entries(row.counters)) inc[`counters.${k}`] = v
    inc.apiEventsIngested = row.apiEventsIngested
    opsRt.push({
      updateOne: {
        filter: { scope: 'platform', businessId: null, bucketStart },
        update: { $inc: inc, $setOnInsert: { scope: 'platform', businessId: null, bucketStart } },
        upsert: true,
      },
    })
  }
  for (const [key, row] of Object.entries(byBizRt)) {
    const [bid, t] = key.split('|')
    const bucketStart = new Date(Number(t))
    const inc = {}
    for (const [k, v] of Object.entries(row.counters)) inc[`counters.${k}`] = v
    inc.apiEventsIngested = row.apiEventsIngested
    opsRt.push({
      updateOne: {
        filter: {
          scope: 'business',
          businessId: new mongoose.Types.ObjectId(bid),
          bucketStart,
        },
        update: { $inc: inc, $setOnInsert: { scope: 'business', businessId: new mongoose.Types.ObjectId(bid), bucketStart } },
        upsert: true,
      },
    })
  }
  if (opsRt.length) await AnalyticsRealtime.bulkWrite(opsRt, { ordered: false })

  state.lastProcessedAt = maxCreated
  await state.save()

  return { processed: events.length, cursor: maxCreated }
}

/**
 * Fold daily → monthly (UTC month buckets).
 */
export async function runMonthlyRollupFromDaily(referenceDate = new Date()) {
  const mk = monthKey(referenceDate)
  const [y, mo] = mk.split('-').map(Number)
  const start = new Date(Date.UTC(y, mo - 1, 1))
  const end = new Date(Date.UTC(y, mo, 0, 23, 59, 59, 999))
  const fromKey = utcDateKey(start)
  const toKey = utcDateKey(end)

  const bizDays = await AnalyticsDaily.find({
    scope: 'business',
    dateKey: { $gte: fromKey, $lte: toKey },
  }).lean()

  const byBiz = {}
  for (const d of bizDays) {
    const id = String(d.businessId)
    if (!byBiz[id]) {
      byBiz[id] = { counters: {}, byDevice: {}, byCountry: {}, bySource: {} }
    }
    const t = byBiz[id]
    for (const [k, v] of Object.entries(d.counters || {})) {
      t.counters[k] = (t.counters[k] || 0) + Number(v || 0)
    }
    for (const [k, v] of Object.entries(d.byDevice || {})) {
      t.byDevice[k] = (t.byDevice[k] || 0) + Number(v || 0)
    }
    for (const [k, v] of Object.entries(d.byCountry || {})) {
      t.byCountry[k] = (t.byCountry[k] || 0) + Number(v || 0)
    }
    for (const [k, v] of Object.entries(d.bySource || {})) {
      t.bySource[k] = (t.bySource[k] || 0) + Number(v || 0)
    }
  }

  const ops = []
  for (const [bid, row] of Object.entries(byBiz)) {
    const inc = {}
    for (const [k, v] of Object.entries(row.counters)) inc[`counters.${k}`] = v
    for (const [k, v] of Object.entries(row.byDevice)) inc[`byDevice.${k}`] = v
    for (const [k, v] of Object.entries(row.byCountry)) inc[`byCountry.${k}`] = v
    for (const [k, v] of Object.entries(row.bySource)) inc[`bySource.${k}`] = v
    ops.push({
      updateOne: {
        filter: { scope: 'business', businessId: new mongoose.Types.ObjectId(bid), monthKey: mk },
        update: { $inc: inc, $set: { updatedAtRollup: new Date() } },
        upsert: true,
      },
    })
  }
  if (ops.length) await AnalyticsMonthly.bulkWrite(ops, { ordered: false })

  const platDays = await AnalyticsDaily.find({
    scope: 'platform',
    dateKey: { $gte: fromKey, $lte: toKey },
  }).lean()
  const plat = { counters: {}, byDevice: {}, byCountry: {}, bySource: {} }
  for (const d of platDays) {
    for (const [k, v] of Object.entries(d.counters || {})) {
      plat.counters[k] = (plat.counters[k] || 0) + Number(v || 0)
    }
    for (const [k, v] of Object.entries(d.byDevice || {})) {
      plat.byDevice[k] = (plat.byDevice[k] || 0) + Number(v || 0)
    }
    for (const [k, v] of Object.entries(d.byCountry || {})) {
      plat.byCountry[k] = (plat.byCountry[k] || 0) + Number(v || 0)
    }
    for (const [k, v] of Object.entries(d.bySource || {})) {
      plat.bySource[k] = (plat.bySource[k] || 0) + Number(v || 0)
    }
  }
  const incP = {}
  for (const [k, v] of Object.entries(plat.counters)) incP[`counters.${k}`] = v
  for (const [k, v] of Object.entries(plat.byDevice)) incP[`byDevice.${k}`] = v
  for (const [k, v] of Object.entries(plat.byCountry)) incP[`byCountry.${k}`] = v
  for (const [k, v] of Object.entries(plat.bySource)) incP[`bySource.${k}`] = v
  if (Object.keys(incP).length) {
    await AnalyticsMonthly.updateOne(
      { scope: 'platform', businessId: null, monthKey: mk },
      { $inc: incP, $set: { updatedAtRollup: new Date() } },
      { upsert: true },
    )
  }

  let state = await AnalyticsRollupState.findById('main')
  if (!state) state = await AnalyticsRollupState.create({ _id: 'main' })
  state.lastMonthlyAt = new Date()
  await state.save()

  return { monthKey: mk, businesses: ops.length }
}

function sumCounters(rows) {
  const out = {}
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.counters || {})) {
      out[k] = (out[k] || 0) + Number(v || 0)
    }
  }
  return out
}

export async function refreshBusinessAnalyticsSnapshot(businessId) {
  const bid = new mongoose.Types.ObjectId(String(businessId))
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - 30)
  const fromKey = utcDateKey(since)
  const days = await AnalyticsDaily.find({
    scope: 'business',
    businessId: bid,
    dateKey: { $gte: fromKey },
  }).lean()
  const counters = sumCounters(days)
  const views = counters.PROFILE_VIEW || counters.PAGE_VISIT || 0
  const clicks =
    (counters.WHATSAPP_CLICK || 0) +
    (counters.CALL_CLICK || 0) +
    (counters.WEBSITE_CLICK || 0) +
    (counters.SHARE_CLICK || 0)
  const conversion = views > 0 ? { ctr: Math.round((clicks / views) * 10000) / 100 } : { ctr: 0 }

  const reviewAgg = await Review.aggregate([
    { $match: { businessId: bid } },
    { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
  ])
  const reviewSummary = {
    count: reviewAgg[0]?.n || 0,
    avg: Math.round((reviewAgg[0]?.avg || 0) * 10) / 10,
  }

  const topSections = Object.entries(days.reduce((m, d) => {
    for (const [k, v] of Object.entries(d.bySection || {})) {
      m[k] = (m[k] || 0) + Number(v)
    }
    return m
  }, {}))
    .map(([key, score]) => ({ key, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)

  await BusinessAnalytics.findOneAndUpdate(
    { businessId: bid },
    {
      $set: {
        computedAt: new Date(),
        last30d: counters,
        conversion,
        reviewSummary,
        topSections,
      },
    },
    { upsert: true },
  )
}

export async function refreshAdminAnalyticsSnapshot() {
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

  const since24h = new Date(Date.now() - 86400000)
  const eventVolume24h = await AnalyticsEvent.countDocuments({ createdAt: { $gte: since24h } })

  const planBreakdown = await Business.aggregate([
    { $match: { approvalStatus: 'APPROVED' } },
    { $group: { _id: '$plan', n: { $sum: 1 } } },
  ])
  const subscriptionByPlan = Object.fromEntries(planBreakdown.map((p) => [p._id || 'UNKNOWN', p.n]))

  const todayKey = utcDateKey(new Date())
  const dauToday = await AnalyticsEvent.distinct('visitorId', {
    visitorId: { $nin: ['', null] },
    createdAt: { $gte: new Date(`${todayKey}T00:00:00.000Z`) },
  }).then((a) => a.length)

  const mauSince = new Date()
  mauSince.setUTCDate(mauSince.getUTCDate() - 30)
  const mauApprox = await AnalyticsEvent.distinct('visitorId', {
    visitorId: { $nin: ['', null] },
    createdAt: { $gte: mauSince },
  }).then((a) => a.length)

  await AdminAnalytics.findOneAndUpdate(
    { key: 'platform' },
    {
      $set: {
        computedAt: new Date(),
        totals: {
          users,
          businesses,
          activeBusinesses: activeBiz,
          reviews,
          revenuePaise,
          revenueDisplay: (revenuePaise / 100).toFixed(2),
        },
        subscriptionByPlan,
        dauToday,
        mauApprox,
        eventVolume24h,
        apiIngest24h: eventVolume24h,
      },
    },
    { upsert: true },
  )
}

export async function enrichDailyUniqueVisitors(dateKey) {
  const start = new Date(`${dateKey}T00:00:00.000Z`)
  const end = new Date(`${dateKey}T23:59:59.999Z`)
  const pipeline = [
    {
      $match: {
        businessId: { $ne: null },
        createdAt: { $gte: start, $lte: end },
        visitorId: { $nin: ['', null] },
      },
    },
    {
      $group: {
        _id: '$businessId',
        visitors: { $addToSet: '$visitorId' },
      },
    },
    { $project: { _id: 1, n: { $size: '$visitors' } } },
  ]
  const rows = await AnalyticsEvent.aggregate(pipeline)
  const ops = rows.map((r) => ({
    updateOne: {
      filter: { scope: 'business', businessId: r._id, dateKey },
      update: {
        $set: { uniqueVisitors: r.n },
        $setOnInsert: { scope: 'business', businessId: r._id, dateKey, counters: {} },
      },
      upsert: true,
    },
  }))
  if (ops.length) await AnalyticsDaily.bulkWrite(ops, { ordered: false })

  const platVisitors = await AnalyticsEvent.distinct('visitorId', {
    createdAt: { $gte: start, $lte: end },
    visitorId: { $nin: ['', null] },
  })
  await AnalyticsDaily.updateOne(
    { scope: 'platform', businessId: null, dateKey },
    {
      $set: { uniqueVisitors: platVisitors.length },
      $setOnInsert: { scope: 'platform', businessId: null, dateKey, counters: {} },
    },
    { upsert: true },
  )
}
