import cron from 'node-cron'
import {
  runIncrementalRollup,
  runMonthlyRollupFromDaily,
  enrichDailyUniqueVisitors,
  refreshAdminAnalyticsSnapshot,
  refreshBusinessAnalyticsSnapshot,
} from '../services/analytics/analyticsRollup.service.js'
import { Business } from '../models/Business.js'

function utcDateKey(d) {
  return new Date(d).toISOString().slice(0, 10)
}

export function startAnalyticsCronJobs() {
  if (process.env.ANALYTICS_CRON_ENABLED === 'false') {
    console.log('[analytics] Cron jobs disabled (ANALYTICS_CRON_ENABLED=false)')
    return
  }

  cron.schedule('*/5 * * * *', async () => {
    try {
      const r = await runIncrementalRollup()
      if (r.processed) console.log(`[analytics] rollup +${r.processed} events`)
    } catch (e) {
      console.error('[analytics] rollup error', e.message)
    }
  })

  cron.schedule('12 * * * *', async () => {
    try {
      const today = utcDateKey(new Date())
      const y = new Date()
      y.setUTCDate(y.getUTCDate() - 1)
      const yday = utcDateKey(y)
      await enrichDailyUniqueVisitors(yday)
      await enrichDailyUniqueVisitors(today)
    } catch (e) {
      console.error('[analytics] unique visitors enrichment', e.message)
    }
  })

  cron.schedule('2 0 1 * *', async () => {
    try {
      const ref = new Date()
      ref.setUTCDate(0)
      await runMonthlyRollupFromDaily(ref)
      console.log('[analytics] monthly rollup completed for', utcDateKey(ref).slice(0, 7))
    } catch (e) {
      console.error('[analytics] monthly rollup', e.message)
    }
  })

  cron.schedule('*/25 * * * *', async () => {
    try {
      await refreshAdminAnalyticsSnapshot()
      const rows = await Business.find({ approvalStatus: 'APPROVED' }).select('_id').limit(800).lean()
      for (const row of rows) {
        await refreshBusinessAnalyticsSnapshot(row._id).catch(() => {})
      }
    } catch (e) {
      console.error('[analytics] snapshot refresh', e.message)
    }
  })

  console.log('[analytics] Cron: rollup 5m, UV hourly, monthly 1st, snapshots 25m')
}
