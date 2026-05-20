import { Analytics } from '../models/Analytics.js'
import { AnalyticsEvent } from '../models/analytics/AnalyticsEvent.model.js'
import { LEGACY_TRACK_MAP, EVENT_CATEGORIES } from '../analytics/eventTypes.js'

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function fireTypedAnalyticsEvent(businessId, legacyType) {
  if (legacyType === 'view') return
  const eventType = LEGACY_TRACK_MAP[legacyType]
  if (!eventType || !businessId) return
  void AnalyticsEvent.create({
    businessId,
    eventType,
    category: EVENT_CATEGORIES[eventType] || 'general',
    source: 'server',
    metadata: { legacyTrackType: legacyType },
  }).catch(() => {})
}

export async function ensureAnalytics(businessId) {
  let doc = await Analytics.findOne({ businessId })
  if (!doc) {
    doc = await Analytics.create({ businessId })
  }
  return doc
}

export async function trackEvent(businessId, type) {
  fireTypedAnalyticsEvent(businessId, type)
  const doc = await ensureAnalytics(businessId)
  const day = todayKey()
  let dayRow = doc.dailyStats.find((d) => d.date === day)
  if (!dayRow) {
    dayRow = { date: day, views: 0, clicks: 0, enquiries: 0 }
    doc.dailyStats.push(dayRow)
  }
  if (type === 'view') {
    doc.views += 1
    dayRow.views += 1
  } else if (type === 'click') {
    doc.clicks += 1
    dayRow.clicks += 1
  } else if (type === 'enquiry') {
    doc.enquiries += 1
    dayRow.enquiries += 1
  } else if (type === 'save') {
    doc.savedCount += 1
  }
  await doc.save()
  return doc
}
