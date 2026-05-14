import { HttpError } from '../src/middleware/errorHandler.js'
import {
  uploadImage,
  deleteImage,
  buildImageVariantUrls,
  isCloudinaryConfigured,
} from '../services/cloudinary.service.js'

const OWNER_FOLDERS = new Set(['businesses', 'offers', 'gallery'])
const ADMIN_FOLDERS = new Set(['categories', 'events', 'banners'])

function allowedFolderForRole(role, folder) {
  if (role === 'BUSINESS_OWNER') return OWNER_FOLDERS.has(folder)
  if (role === 'SUPER_ADMIN') return ADMIN_FOLDERS.has(folder) || OWNER_FOLDERS.has(folder)
  return false
}

/**
 * POST /api/upload/image
 * multipart: file, folder; optional: replacePublicId (delete after successful upload)
 */
export async function uploadImageHandler(req, res, next) {
  try {
    if (!isCloudinaryConfigured()) {
      throw new HttpError(503, 'Cloudinary is not configured on this server.')
    }
    if (!req.file?.buffer) {
      throw new HttpError(400, 'Missing image file (field name: file)')
    }
    const folder = String(req.body.folder || 'businesses')
      .trim()
      .replace(/^\/+|\/+$/g, '')
    if (!folder || folder.includes('..')) {
      throw new HttpError(400, 'Invalid folder')
    }
    if (!allowedFolderForRole(req.user.role, folder)) {
      throw new HttpError(403, `Folder "${folder}" is not allowed for your role`)
    }

    const replacePublicId =
      typeof req.body.replacePublicId === 'string' ? req.body.replacePublicId.trim() : ''

    const uploaded = await uploadImage(req.file.buffer, folder)

    if (replacePublicId && replacePublicId !== uploaded.public_id) {
      try {
        await deleteImage(replacePublicId)
      } catch {
        /* best-effort cleanup */
      }
    }

    const urls = buildImageVariantUrls(uploaded.public_id)
    res.status(201).json({
      ok: true,
      secure_url: uploaded.secure_url,
      public_id: uploaded.public_id,
      urls,
    })
  } catch (e) {
    next(e)
  }
}

/**
 * DELETE /api/upload/image  (JSON body: { publicId })
 */
export async function deleteImageHandler(req, res, next) {
  try {
    if (!isCloudinaryConfigured()) {
      throw new HttpError(503, 'Cloudinary is not configured on this server.')
    }
    const publicId = String(req.body?.publicId || '').trim()
    if (!publicId) {
      throw new HttpError(400, 'publicId is required')
    }
    await deleteImage(publicId)
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
}
