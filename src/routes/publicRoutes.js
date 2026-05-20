import { Router } from 'express'
import * as pub from '../controllers/businessPublicController.js'
import * as homeHero from '../controllers/homeHeroBannerController.js'
import * as homeConnect from '../controllers/homeConnectSectionController.js'
import * as homeFeaturedEvents from '../controllers/homeFeaturedEventController.js'
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
r.post('/business/list-by-public-ids', pub.listBusinessesByPublicIds)
r.get('/offers', pub.offersFeed)
r.get('/offer-ads', pub.offerAds)
r.get('/home-hero', homeHero.getPublicHomeHero)
r.get('/home-connect', homeConnect.getPublicHomeConnect)
r.get('/home-featured-events', homeFeaturedEvents.getPublicHomeFeaturedEvents)
r.get('/business/:id', optionalAuthenticate(), pub.getBusinessById)

export default r
