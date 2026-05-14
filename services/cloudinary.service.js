import { HttpError } from '../src/middleware/errorHandler.js'
import {
  cloudinary,
  configureCloudinary,
  isCloudinaryConfigured,
} from '../config/cloudinary.js'

const DEFAULT_UPLOAD_OPTS = {
  quality: 'auto',
  fetch_format: 'auto',
}

function ensureConfigured() {
  if (!isCloudinaryConfigured()) {
    throw new HttpError(503, 'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.')
  }
  configureCloudinary()
}

/**
 * Upload a raw image buffer to Cloudinary.
 * @param {Buffer} buffer
 * @param {string} folder - e.g. businesses, gallery, categories
 * @returns {Promise<{ secure_url: string, public_id: string, width?: number, height?: number }>}
 */
export async function uploadImage(buffer, folder) {
  ensureConfigured()
  const safeFolder = String(folder || 'misc').replace(/^\/+|\/+$/g, '').replace(/\.\./g, '')
  return new Promise((resolve, reject) => {
    // Node SDK signature is upload_stream(callback, options) — not (options, callback).
    const stream = cloudinary.uploader.upload_stream(
      (result) => {
        if (result?.error) {
          reject(result.error)
          return
        }
        if (!result?.secure_url || !result?.public_id) {
          reject(new Error('Cloudinary returned an invalid response'))
          return
        }
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
          width: result.width,
          height: result.height,
        })
      },
      {
        folder: safeFolder,
        resource_type: 'image',
        ...DEFAULT_UPLOAD_OPTS,
      },
    )
    stream.end(buffer)
  })
}

/**
 * Delete by full public_id (includes folder prefix).
 */
export async function deleteImage(publicId) {
  if (!publicId || typeof publicId !== 'string') return { result: 'noop' }
  ensureConfigured()
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(
      publicId.trim(),
      (result) => {
        if (result?.error) reject(result.error)
        else resolve(result)
      },
      { resource_type: 'image' },
    )
  })
}

/**
 * Thumbnail, medium, and full CDN URLs (optimized delivery).
 */
export function buildImageVariantUrls(publicId) {
  if (!publicId || typeof publicId !== 'string') {
    return { thumbnail: '', medium: '', full: '' }
  }
  if (!isCloudinaryConfigured()) {
    return { thumbnail: '', medium: '', full: '' }
  }
  configureCloudinary()
  const base = { secure: true, quality: 'auto', fetch_format: 'auto' }
  const thumbnail = cloudinary.url(publicId, {
    ...base,
    transformation: [{ width: 300, height: 300, crop: 'fill', gravity: 'auto' }],
  })
  const medium = cloudinary.url(publicId, {
    ...base,
    transformation: [{ width: 800, crop: 'limit' }],
  })
  const full = cloudinary.url(publicId, base)
  return { thumbnail, medium, full }
}

export { isCloudinaryConfigured }
