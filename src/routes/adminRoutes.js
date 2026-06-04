import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth.js'
import * as admin from '../controllers/adminController.js'
import * as analyticsDash from '../controllers/analyticsDashboard.controller.js'
import * as plans from '../controllers/planAdminController.js'
import * as offerAds from '../controllers/offerAdAdminController.js'
import * as badgeReq from '../controllers/badgeRequestAdminController.js'
import * as homeHero from '../controllers/homeHeroBannerController.js'
import * as homeConnect from '../controllers/homeConnectSectionController.js'
import * as homeFeaturedEvents from '../controllers/homeFeaturedEventController.js'
import * as bizProfiles from '../controllers/adminBusinessProfileController.js'
import * as site from '../controllers/siteContentController.js'
import * as subscriptionRevenue from '../controllers/subscriptionRevenueAdminController.js'
import * as adminSettings from '../controllers/adminSettingsController.js'

const r = Router()
r.use(authenticate(true))
r.use(requireRole('SUPER_ADMIN'))

r.post('/plan/create', plans.createPlan)
r.put('/plan/update/:id', plans.updatePlan)
r.delete('/plan/:id', plans.deletePlan)
r.get('/plan/all', plans.listAllPlans)

r.get('/analytics', admin.platformAnalytics)
r.get('/subscriptions/revenue', subscriptionRevenue.getSubscriptionRevenueDashboard)
r.get('/analytics/dashboard', analyticsDash.platformAnalyticsDashboard)
r.get('/analytics/export', analyticsDash.exportPlatformAnalytics)
r.get('/home-hero', homeHero.getAdminHomeHero)
r.put('/home-hero', homeHero.upsertAdminHomeHero)
r.get('/home-connect', homeConnect.getAdminHomeConnect)
r.put('/home-connect', homeConnect.upsertAdminHomeConnect)

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
r.get('/home-featured-events', homeFeaturedEvents.listAdminHomeFeaturedEvents)
r.post('/home-featured-events', homeFeaturedEvents.createAdminHomeFeaturedEvent)
r.put('/home-featured-events/:id', homeFeaturedEvents.updateAdminHomeFeaturedEvent)
r.delete('/home-featured-events/:id', homeFeaturedEvents.deleteAdminHomeFeaturedEvent)
r.post('/business-profiles', bizProfiles.createBusinessProfile)
r.post('/business-profiles/link-existing', bizProfiles.linkExistingBusinessProfile)
r.get('/business-profiles/:id/owner', bizProfiles.getBusinessProfileOwner)
r.patch('/business-profiles/:id/owner', bizProfiles.updateBusinessProfileOwner)
r.get('/business-profiles/:id/detail', bizProfiles.getBusinessProfileDetail)
r.put('/business-profiles/:id', bizProfiles.updateBusinessProfile)
r.put('/business-profiles/:id/content', bizProfiles.updateBusinessProfileContent)
r.patch('/business-profiles/:id/onboarding/complete', bizProfiles.completeBusinessProfileOnboarding)
r.post('/business-profiles/:id/preview-token', bizProfiles.createBusinessProfilePreviewToken)
r.put('/business-profiles/:id/theme/custom', bizProfiles.putBusinessProfileThemeCustom)
r.delete('/business-profiles/:id/theme/custom/:templateId', bizProfiles.deleteBusinessProfileThemeCustom)
r.post('/business-profiles/media/data-url', bizProfiles.uploadMediaDataUrl)
r.post('/business-profiles/ai/generate', bizProfiles.aiGenerate)

r.get('/users', admin.listPlatformUsers)
r.patch('/users/:id/block', admin.setConsumerBlocked)
r.get('/businesses', admin.listBusinessesAdmin)
r.get('/onboarded-businesses', admin.listOnboardedBusinesses)
r.get('/badge-requests', badgeReq.listPendingBadgeRequests)
r.get('/badge-requests/:requestId', badgeReq.getBadgeRequest)
r.get('/badge-audit', badgeReq.listAllBadgeAudit)
r.get('/businesses/:id', admin.getBusinessAdminDetail)
r.post('/businesses/:id/grant-badge', badgeReq.grantBusinessBadge)
r.post('/businesses/:id/revoke-badge', badgeReq.revokeBusinessBadge)
r.get('/businesses/:id/badge-audit', badgeReq.listBusinessBadgeAudit)
r.patch('/businesses/:id/approval', admin.setBusinessApproval)
r.patch('/businesses/:id/flags', admin.setBusinessFlags)
r.patch('/businesses/:id/owner-block', admin.setBusinessOwnerBlocked)
r.get('/businesses/:id/content', admin.getBusinessContentAdmin)
r.patch('/businesses/:id/content', admin.patchBusinessContentAdmin)
r.patch('/businesses/:id/plan', plans.assignPlanToBusinessAdmin)

r.get('/support-messages', site.listSupportMessagesAdmin)
r.patch('/support-messages/:id', site.patchSupportMessageAdmin)
r.get('/help-articles', site.listHelpArticlesAdmin)
r.post('/help-articles', site.createHelpArticleAdmin)
r.put('/help-articles/:id', site.updateHelpArticleAdmin)
r.delete('/help-articles/:id', site.deleteHelpArticleAdmin)
r.get('/legal-documents', site.listLegalDocumentsAdmin)
r.put('/legal-documents', site.upsertLegalDocumentAdmin)

r.get('/settings/account', adminSettings.getAccount)
r.patch('/settings/account', adminSettings.updateAccount)
r.post('/settings/change-password', adminSettings.changePassword)
r.get('/settings/platform', adminSettings.getPlatformSettings)

export default r
