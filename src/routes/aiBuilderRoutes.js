import { Router } from 'express'
import * as ctrl from '../controllers/aiBuilderController.js'

const r = Router()

r.post('/ai-builder/start', ctrl.startAiBuilder)
r.post('/ai-builder/message', ctrl.postAiBuilderMessage)
r.get('/ai-builder/jobs/:jobId', ctrl.getAiJob)
r.get('/ai-builder/jobs/:jobId/events', ctrl.streamAiJobEvents)
r.post('/ai-builder/jobs/:jobId/cancel', ctrl.cancelAiJob)
r.post('/ai-builder/cancel-active', ctrl.cancelActiveAiJobs)
r.get('/websites/:siteId/usage', ctrl.getAiBuilderUsage)

r.get('/websites/current', ctrl.startAiBuilder)
r.get('/websites/:siteId', ctrl.getAiBuilderState)
r.post('/websites/:siteId/isolated-preview', ctrl.ensureIsolatedPreview)
r.patch('/websites/:siteId/draft', ctrl.patchWebsiteDraft)
r.get('/websites/:siteId/preview', ctrl.getDraftPreviewBundle)
r.get('/websites/:siteId/recommendations', ctrl.getRecommendations)

r.get('/websites/:siteId/versions', ctrl.listWebsiteVersions)
r.get('/websites/:siteId/versions/:versionId', ctrl.getWebsiteVersion)
r.get('/websites/:siteId/versions/:a/compare/:b', ctrl.compareWebsiteVersions)
r.post('/websites/:siteId/versions/:versionId/restore', ctrl.restoreWebsiteVersion)
r.post('/websites/:siteId/versions/:versionId/duplicate', ctrl.duplicateWebsiteVersion)
r.delete('/websites/:siteId/versions/:versionId', ctrl.deleteWebsiteVersionHandler)
r.delete('/websites/:siteId/memory', ctrl.deleteAiBuilderMemory)

r.post('/websites/:siteId/publish', ctrl.publishWebsite)
r.post('/websites/:siteId/rollback', ctrl.rollbackWebsite)

r.get('/websites/:siteId/domains', ctrl.listDomains)
r.post('/websites/:siteId/domains', ctrl.addDomain)
r.post('/websites/:siteId/domains/:domainId/verify', ctrl.verifyDomainHandler)
r.delete('/websites/:siteId/domains/:domainId', ctrl.deleteDomainHandler)

export default r
