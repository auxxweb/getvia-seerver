import multer from 'multer'
import { isAllowedImageUpload } from '../src/constants/imageUpload.js'
import { HttpError } from '../src/middleware/errorHandler.js'

const MAX_BYTES = Number(process.env.UPLOAD_MAX_IMAGE_BYTES || 2 * 1024 * 1024)

const storage = multer.memoryStorage()

const imageFileFilter = (_req, file, cb) => {
  if (isAllowedImageUpload(file)) {
    cb(null, true)
    return
  }
  cb(new HttpError(400, 'Only image files are allowed'))
}

export const imageUpload = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
  fileFilter: imageFileFilter,
})

/** Express error handler for Multer errors */
export function handleMulterError(err, _req, _res, next) {
  if (err instanceof HttpError) {
    return next(err)
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new HttpError(400, `Image too large (max ${Math.round(MAX_BYTES / (1024 * 1024))}MB)`))
    }
    return next(new HttpError(400, err.message || 'Upload failed'))
  }
  next(err)
}
