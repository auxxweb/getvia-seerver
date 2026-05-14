import { Business } from '../models/Business.js'
import { HttpError } from '../middleware/errorHandler.js'
import { validateCustomThemePatch } from '../services/theme.service.js'

function themeSettingsToPlain(cur) {
  if (!cur || typeof cur !== 'object') return {}
  return typeof cur.toObject === 'function' ? cur.toObject() : { ...cur }
}

/**
 * PUT /owner/business/:id/theme/custom
 * Body: { templateId, colors: { [key]: "#RRGGBB" } }
 */
export async function putBusinessTemplateCustomTheme(req, res, next) {
  try {
    const { id } = req.params
    const { templateId, colors } = req.body || {}
    if (!templateId || typeof templateId !== 'string') {
      throw new HttpError(400, 'templateId is required')
    }

    const business = await Business.findById(id)
    if (!business) throw new HttpError(404, 'Business not found')
    if (business.ownerId.toString() !== req.user._id.toString()) {
      throw new HttpError(403, 'Not your business')
    }

    const { ok, error, sanitized } = validateCustomThemePatch(templateId, colors)
    if (!ok) throw new HttpError(400, error)

    const cur = themeSettingsToPlain(business.themeSettings)
    const presets = { ...(cur.themeColorPresets || {}) }
    const prev = presets[templateId] && typeof presets[templateId] === 'object' ? presets[templateId] : {}
    presets[templateId] = { ...prev, ...sanitized }

    business.set('themeSettings', {
      ...cur,
      themeColorPresets: presets,
    })
    business.markModified('themeSettings')
    await business.save()
    res.json({ ok: true, business })
  } catch (e) {
    next(e)
  }
}

/**
 * DELETE /owner/business/:id/theme/custom/:templateId
 * Removes all custom color overrides for that template preset bucket.
 */
export async function deleteBusinessTemplateCustomTheme(req, res, next) {
  try {
    const { id, templateId } = req.params
    if (!templateId) throw new HttpError(400, 'templateId is required')

    const business = await Business.findById(id)
    if (!business) throw new HttpError(404, 'Business not found')
    if (business.ownerId.toString() !== req.user._id.toString()) {
      throw new HttpError(403, 'Not your business')
    }

    const cur = themeSettingsToPlain(business.themeSettings)
    const presets = { ...(cur.themeColorPresets || {}) }
    delete presets[templateId]

    business.set('themeSettings', {
      ...cur,
      themeColorPresets: presets,
    })
    business.markModified('themeSettings')
    await business.save()
    res.json({ ok: true, business })
  } catch (e) {
    next(e)
  }
}
