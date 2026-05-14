import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth.js'
import * as user from '../controllers/userController.js'

const r = Router()
r.use(authenticate(true))

r.get('/me', requireRole('USER', 'BUSINESS_OWNER', 'SUPER_ADMIN'), user.me)
r.get('/review/status', requireRole('USER'), user.reviewStatus)
r.post('/review', requireRole('USER'), user.createReview)
r.post('/save-business', requireRole('USER', 'BUSINESS_OWNER', 'SUPER_ADMIN'), user.saveBusiness)
r.post('/analytics/track', requireRole('USER', 'BUSINESS_OWNER', 'SUPER_ADMIN'), user.trackAnalytics)

export default r
