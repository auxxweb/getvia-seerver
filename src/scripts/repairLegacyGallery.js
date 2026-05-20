/**
 * Repair gallery rows wiped by an earlier legacy migration.
 * Uploads files from server/uploads/ to Cloudinary and restores gallery URLs.
 *
 * Usage: node src/scripts/repairLegacyGallery.js [publicId]
 */
import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { Business } from '../models/Business.js'
import { BusinessContent } from '../models/BusinessContent.js'
import { configureCloudinary } from '../../config/cloudinary.js'
import { uploadImage, isCloudinaryConfigured } from '../../services/cloudinary.service.js'
import { LEGACY_UPLOADS_DIR, legacyUploadFilename } from '../services/legacyImageUrls.service.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../../.env') })

const LEGACY_GALLERY_BY_PUBLIC_ID = {
  'biz-1777899076886-rtwz9': [
    'http://localhost:5000/api/uploads/1777899828260-845337adae484aab.png',
    'http://localhost:5000/api/uploads/1777899828405-5b79772e6151d2aa.png',
    'http://localhost:5000/api/uploads/1777899828547-3ecbc663a1ab6e25.png',
  ],
}

async function uploadLegacyFile(legacyUrl) {
  const filename = legacyUploadFilename(legacyUrl)
  if (!filename) return null
  const filePath = path.join(LEGACY_UPLOADS_DIR, filename)
  if (!fs.existsSync(filePath)) {
    console.warn('Missing file on disk:', filePath)
    return null
  }
  const buffer = fs.readFileSync(filePath)
  const uploaded = await uploadImage(buffer, 'gallery')
  return uploaded.secure_url || null
}

async function main() {
  const publicId = process.argv[2] || 'biz-1777899076886-rtwz9'
  configureCloudinary()
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured')
  }
  await mongoose.connect(process.env.MONGODB_URI)

  const business = await Business.findOne({ publicId }).lean()
  if (!business) throw new Error(`Business not found: ${publicId}`)

  const legacyUrls = LEGACY_GALLERY_BY_PUBLIC_ID[publicId]
  if (!legacyUrls?.length) throw new Error(`No legacy gallery map for ${publicId}`)

  const gallery = []
  for (const legacyUrl of legacyUrls) {
    const url = await uploadLegacyFile(legacyUrl)
    if (url) gallery.push(url)
  }

  if (!gallery.length) throw new Error('No gallery images could be uploaded')

  await BusinessContent.updateOne(
    { businessId: business._id },
    { $set: { gallery } },
    { upsert: true },
  )

  console.log(`Restored ${gallery.length} gallery image(s) for ${publicId}:`)
  gallery.forEach((u) => console.log(' ', u))
  await mongoose.disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
