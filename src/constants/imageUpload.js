/** Browser file input: allow any image type the OS recognizes. */
export const IMAGE_FILE_ACCEPT = 'image/*'

/** Extensions when MIME is missing or generic (e.g. application/octet-stream). */
export const IMAGE_FILE_EXT_PATTERN =
  /\.(jpe?g|jfif|pjpeg|pjp|png|apng|gif|webp|bmp|dib|tiff?|tif|svg|svgz|heic|heif|avif|ico|cur|jxl|jp2|j2k|psd|xbm|pbm|pgm|ppm|pnm|rw2|cr2|nef|orf|arw|dng)$/i

/**
 * @param {{ mimetype?: string, originalname?: string }} file
 */
export function isAllowedImageUpload(file) {
  const mime = String(file?.mimetype || '').toLowerCase()
  const name = String(file?.originalname || '').toLowerCase()
  if (mime.startsWith('image/')) return true
  return IMAGE_FILE_EXT_PATTERN.test(name)
}
