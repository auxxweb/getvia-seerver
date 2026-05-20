import { HttpError } from '../middleware/errorHandler.js'
import { generateContent } from '../services/ai.service.js'
import { consumeAiPrompt } from '../services/planEntitlements.service.js'
import { Business } from '../models/Business.js'

export async function aiGenerate(req, res, next) {
  try {
    const { sectionType, inputData } = req.body || {}
    const businessId = inputData?.businessId

    if (req.user?.role === 'BUSINESS_OWNER') {
      if (!businessId) {
        throw new HttpError(400, 'businessId is required for AI generation')
      }
      const business = await Business.findById(businessId)
      if (!business) throw new HttpError(404, 'Business not found')
      if (business.ownerId.toString() !== req.user._id.toString()) {
        throw new HttpError(403, 'Not your business')
      }
      const aiUsage = await consumeAiPrompt(businessId)
      const result = await generateContent(sectionType || 'generic', inputData || {})
      res.json({ ok: true, ...result, aiUsage })
      return
    }

    const result = await generateContent(sectionType || 'generic', inputData || {})
    res.json({ ok: true, ...result })
  } catch (e) {
    next(e)
  }
}
