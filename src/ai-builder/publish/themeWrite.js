import { Business } from '../../models/Business.js'
import { validateCustomThemePatch } from '../../services/theme.service.js'

export async function themeServicePut(businessId, websiteState) {
  const colors = websiteState?.theme?.colors
  const templateId = websiteState?.templateId
  if (!templateId || !colors || typeof colors !== 'object') return
  const { ok, sanitized } = validateCustomThemePatch(templateId, colors)
  if (!ok || !sanitized) return
  const business = await Business.findById(businessId)
  if (!business) return
  const cur =
    business.themeSettings && typeof business.themeSettings.toObject === 'function'
      ? business.themeSettings.toObject()
      : { ...(business.themeSettings || {}) }
  const presets = { ...(cur.themeColorPresets || {}) }
  const prev = presets[templateId] && typeof presets[templateId] === 'object' ? presets[templateId] : {}
  presets[templateId] = { ...prev, ...sanitized }
  business.set('themeSettings', {
    ...cur,
    template: templateId,
    themeColorPresets: presets,
  })
  business.markModified('themeSettings')
  await business.save()
}
