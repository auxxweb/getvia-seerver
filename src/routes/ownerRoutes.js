import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth.js'
import { HttpError } from '../middleware/errorHandler.js'
import * as owner from '../controllers/businessOwnerController.js'
import * as ai from '../controllers/aiController.js'
import * as preview from '../controllers/previewController.js'
import * as theme from '../controllers/themeController.js'
import * as analyticsDash from '../controllers/analyticsDashboard.controller.js'

const r = Router()
r.use(authenticate(true))
r.use(requireRole('BUSINESS_OWNER'))
r.use((req, _res, next) => {
  if (req.user?.isBlocked && req.user?.role === 'BUSINESS_OWNER') {
    return next(new HttpError(403, 'Your business account has been suspended.'))
  }
  next()
})

r.post('/media/data-url', owner.uploadMediaDataUrl)
r.post('/business/create', owner.createBusiness)
r.put('/business/:id', owner.updateBusiness)
r.put('/business/:id/theme/custom', theme.putBusinessTemplateCustomTheme)
r.delete('/business/:id/theme/custom/:templateId', theme.deleteBusinessTemplateCustomTheme)
r.get('/business/my', owner.myBusinesses)
r.get('/business/:id/detail', owner.getOwnerBusinessDetail)
r.post('/business/:id/preview-token', preview.createBusinessPreviewToken)
r.patch('/business/:id/onboarding/complete', owner.completeOnboarding)
r.get('/business/:id/badge-requests', owner.listMyBadgeRequests)
r.post('/business/:id/badge-requests', owner.createBadgeRequest)
r.put('/business/:id/content', owner.updateBusinessContent)
r.get('/business/:id/analytics', owner.businessAnalytics)
r.get('/business/:id/analytics/dashboard', analyticsDash.businessAnalyticsDashboard)
r.get('/business/:id/analytics/export', analyticsDash.exportBusinessAnalytics)

r.post('/ai/generate', ai.aiGenerate)

export default r
