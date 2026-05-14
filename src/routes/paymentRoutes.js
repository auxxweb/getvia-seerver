import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth.js'
import { HttpError } from '../middleware/errorHandler.js'
import * as pay from '../controllers/subscriptionPaymentController.js'

const r = Router()
r.use(authenticate(true))
r.use(requireRole('BUSINESS_OWNER'))
r.use((req, _res, next) => {
  if (req.user?.isBlocked && req.user?.role === 'BUSINESS_OWNER') {
    return next(new HttpError(403, 'Your business account has been suspended.'))
  }
  next()
})

r.post('/create-order', pay.createPaymentOrder)
r.post('/verify', pay.verifyPayment)

export default r
