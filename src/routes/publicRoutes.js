import { Router } from 'express'
import * as pub from '../controllers/businessPublicController.js'
import * as sub from '../controllers/subscriptionPaymentController.js'
import * as preview from '../controllers/previewController.js'
import { optionalAuthenticate } from '../middleware/auth.js'

const r = Router()

r.get('/plans', sub.listActivePlansPublic)
r.get('/preview/:token', preview.getBusinessPreviewByToken)
r.get('/categories', pub.listPublicCategories)
r.get('/business/search', pub.searchBusinesses)
r.get('/business/nearby', pub.nearbyBusinesses)
r.get('/business/trending', pub.trending)
r.get('/business/verified-partners', pub.verifiedPartners)
r.get('/offers', pub.offersFeed)
r.get('/offer-ads', pub.offerAds)
r.get('/business/:id', optionalAuthenticate(), pub.getBusinessById)

export default r
