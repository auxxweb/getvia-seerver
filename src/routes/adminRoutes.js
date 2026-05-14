import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth.js'
import * as admin from '../controllers/adminController.js'
import * as analyticsDash from '../controllers/analyticsDashboard.controller.js'
import * as plans from '../controllers/planAdminController.js'
import * as offerAds from '../controllers/offerAdAdminController.js'
import * as badgeReq from '../controllers/badgeRequestAdminController.js'

const r = Router()
r.use(authenticate(true))
r.use(requireRole('SUPER_ADMIN'))

r.post('/plan/create', plans.createPlan)
r.put('/plan/update/:id', plans.updatePlan)
r.delete('/plan/:id', plans.deletePlan)
r.get('/plan/all', plans.listAllPlans)

r.get('/analytics', admin.platformAnalytics)
r.get('/analytics/dashboard', analyticsDash.platformAnalyticsDashboard)
r.get('/analytics/export', analyticsDash.exportPlatformAnalytics)
r.get('/categories', admin.listCategories)
r.post('/categories', admin.createCategory)
r.put('/categories/:id', admin.updateCategory)
r.delete('/categories/:id', admin.deleteCategory)

r.get('/offer-ads', offerAds.listOfferAds)
r.post('/offer-ads', offerAds.createOfferAd)
r.put('/offer-ads/:id', offerAds.updateOfferAd)
r.delete('/offer-ads/:id', offerAds.deleteOfferAd)
r.get('/events', admin.listEvents)
r.post('/events', admin.createEvent)
r.put('/events/:id', admin.updateEvent)
r.delete('/events/:id', admin.deleteEvent)
r.get('/businesses', admin.listBusinessesAdmin)
r.get('/onboarded-businesses', admin.listOnboardedBusinesses)
r.get('/badge-requests', badgeReq.listPendingBadgeRequests)
r.get('/businesses/:id', admin.getBusinessAdminDetail)
r.post('/businesses/:id/grant-badge', badgeReq.grantBusinessBadge)
r.post('/businesses/:id/revoke-badge', badgeReq.revokeBusinessBadge)
r.get('/businesses/:id/badge-audit', badgeReq.listBusinessBadgeAudit)
r.patch('/businesses/:id/approval', admin.setBusinessApproval)
r.patch('/businesses/:id/flags', admin.setBusinessFlags)
r.patch('/businesses/:id/owner-block', admin.setBusinessOwnerBlocked)
r.get('/businesses/:id/content', admin.getBusinessContentAdmin)
r.patch('/businesses/:id/content', admin.patchBusinessContentAdmin)

export default r
