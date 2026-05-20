import { HttpError } from '../middleware/errorHandler.js'
import { generateAnalyticsInsights } from '../services/analyticsInsights.service.js'
import { getPlanUsageSummary, resolveBusinessEntitlements } from '../services/planEntitlements.service.js'
import { Business } from '../models/Business.js'

async function assertOwnerBusiness(req, businessId) {
  const business = await Business.findById(businessId)
  if (!business) throw new HttpError(404, 'Business not found')
  if (business.ownerId.toString() !== req.user._id.toString()) {
    throw new HttpError(403, 'Not your business')
  }
  return business
}

export async function getBusinessPlanUsage(req, res, next) {
  try {
    const { id } = req.params
    await assertOwnerBusiness(req, id)
    const summary = await getPlanUsageSummary(id)
    res.json({ ok: true, ...summary })
  } catch (e) {
    next(e)
  }
}

export async function getBusinessAnalyticsInsights(req, res, next) {
  try {
    const { id } = req.params
    await assertOwnerBusiness(req, id)
    const { entitlements } = await resolveBusinessEntitlements(id)
    if (!entitlements.aiInsightsEnabled) {
      return res.json({
        ok: true,
        enabled: false,
        suggestions: [],
        message: 'AI insights are not included in your current plan.',
      })
    }
    const preset = String(req.query.preset || 'last_30d')
    const result = await generateAnalyticsInsights(id, preset)
    res.json({ ok: true, enabled: true, ...result })
  } catch (e) {
    next(e)
  }
}
