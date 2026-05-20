import cloudinary from 'cloudinary'

/**
 * Cloudinary SDK — configure from env.
 * @see https://cloudinary.com/documentation/node_integration
 */
export function configureCloudinary() {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const api_key = process.env.CLOUDINARY_API_KEY?.trim()
  const api_secret = process.env.CLOUDINARY_API_SECRET?.trim()
  if (!cloud_name || !api_key || !api_secret) {
    return false
  }
  cloudinary.config({
    cloud_name,
    api_key,
    api_secret,
    secure: true,
  })
  return true
}

export function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
      process.env.CLOUDINARY_API_KEY?.trim() &&
      process.env.CLOUDINARY_API_SECRET?.trim(),
  )
}

export { cloudinary }
