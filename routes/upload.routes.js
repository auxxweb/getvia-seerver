import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth.middleware.js'
import { HttpError } from '../src/middleware/errorHandler.js'
import { imageUpload, handleMulterError } from '../middleware/upload.middleware.js'
import * as upload from '../controllers/upload.controller.js'

const r = Router()

r.use(authenticate(true))
r.use(requireRole('BUSINESS_OWNER', 'SUPER_ADMIN'))

r.use((req, _res, next) => {
  if (req.user?.role === 'BUSINESS_OWNER' && req.user?.isBlocked) {
    return next(new HttpError(403, 'Your business account has been suspended.'))
  }
  next()
})

r.get('/delivery-url', upload.getDeliveryUrlHandler)
r.post('/image', imageUpload.single('file'), handleMulterError, upload.uploadImageHandler)
r.delete('/image', upload.deleteImageHandler)

export default r
