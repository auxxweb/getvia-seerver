import { Business } from '../models/Business.js'
import { User } from '../models/User.js'
import { HttpError } from '../middleware/errorHandler.js'
import { signAccessToken } from '../utils/tokens.js'
import {
  applyBusinessContentUpdate,
  applyBusinessUpdate,
  completeBusinessOnboarding,
  createBusinessForOwner,
  getBusinessDetailBundle,
} from '../services/businessProfileMutations.js'
import { sanitizeBusinessGeoFields } from '../services/businessGeoSanitize.js'
import { validateCustomThemePatch } from '../services/theme.service.js'
import { uploadMediaDataUrl } from './businessOwnerController.js'
import { aiGenerate } from './aiController.js'

function jwtSecret() {
  return process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET
}

async function loadBusiness(id) {
  const business = await Business.findById(id)
  if (!business) throw new HttpError(404, 'Business not found')
  return business
}

/**
 * POST /admin/business-profiles
 * Body: { email, password, name?, businessName? }
 */
async function findBusinessOwner(businessId) {
  const business = await Business.findById(businessId)
  if (!business) throw new HttpError(404, 'Business not found')
  const owner = await User.findById(business.ownerId).select('+password')
  if (!owner || owner.role !== 'BUSINESS_OWNER') {
    throw new HttpError(404, 'Business owner not found')
  }
  return { business, owner }
}

/**
 * POST /admin/business-profiles/link-existing
 * Body: { email, password, businessName? }
 */
export async function linkExistingBusinessProfile(req, res, next) {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase()
    const password = String(req.body?.password || '')
    const businessName = String(req.body?.businessName || '').trim()

    if (!email) throw new HttpError(400, 'Owner email is required')
    if (!password) throw new HttpError(400, 'Password is required')

    const owner = await User.findOne({ email }).select('+password')
    if (!owner) throw new HttpError(404, 'No account found with this email')
    if (owner.role !== 'BUSINESS_OWNER') {
      throw new HttpError(400, 'This email is not a business owner account')
    }
    if (owner.isBlocked) throw new HttpError(403, 'This business owner account is suspended')
    if (!owner.password) {
      throw new HttpError(
        400,
        'This account uses Google sign-in only. Set a password from the business panel or create a new owner email.',
      )
    }
    if (!(await owner.comparePassword(password))) {
      throw new HttpError(401, 'Invalid password for this account')
    }

    let business
    let created = false
    if (owner.ownedBusinessId) {
      business = await Business.findById(owner.ownedBusinessId)
      if (!business) {
        owner.ownedBusinessId = null
        await owner.save()
      }
    }
    if (!business) {
      business = await createBusinessForOwner(owner._id, {
        name: businessName || 'New business',
      })
      created = true
    }

    res.json({
      ok: true,
      linked: true,
      createdBusiness: created,
      owner: owner.toSafeObject(),
      business: business.toObject(),
    })
  } catch (e) {
    next(e)
  }
}

/**
 * GET /admin/business-profiles/:id/owner
 */
export async function getBusinessProfileOwner(req, res, next) {
  try {
    const { owner, business } = await findBusinessOwner(req.params.id)
    res.json({
      ok: true,
      owner: {
        id: owner._id.toString(),
        name: owner.name,
        email: owner.email,
        phone: owner.phone || '',
        isBlocked: owner.isBlocked,
        hasPassword: Boolean(owner.password),
      },
      business: {
        id: business._id.toString(),
        name: business.name,
        publicId: business.publicId,
        onboardingCompletedAt: business.onboardingCompletedAt,
      },
    })
  } catch (e) {
    next(e)
  }
}

/**
 * PATCH /admin/business-profiles/:id/owner
 * Body: { name?, email?, password?, phone? }
 */
export async function updateBusinessProfileOwner(req, res, next) {
  try {
    const { owner, business } = await findBusinessOwner(req.params.id)
    const name = req.body?.name !== undefined ? String(req.body.name).trim() : undefined
    const email =
      req.body?.email !== undefined ? String(req.body.email).trim().toLowerCase() : undefined
    const password = req.body?.password !== undefined ? String(req.body.password) : undefined
    const phone = req.body?.phone !== undefined ? String(req.body.phone).trim() : undefined

    if (email) {
      const dup = await User.findOne({ email, _id: { $ne: owner._id } })
      if (dup) throw new HttpError(409, 'Email already used by another account')
      owner.email = email
    }
    if (name !== undefined) {
      if (!name) throw new HttpError(400, 'Owner name cannot be empty')
      owner.name = name
    }
    if (phone !== undefined) owner.phone = phone
    if (password) {
      if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters')
      owner.password = password
    }

    await owner.save()

    res.json({
      ok: true,
      owner: {
        id: owner._id.toString(),
        name: owner.name,
        email: owner.email,
        phone: owner.phone || '',
        isBlocked: owner.isBlocked,
        hasPassword: Boolean(owner.password),
      },
      business: {
        id: business._id.toString(),
        name: business.name,
        publicId: business.publicId,
      },
    })
  } catch (e) {
    next(e)
  }
}

export async function createBusinessProfile(req, res, next) {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase()
    const password = String(req.body?.password || '')
    const name = String(req.body?.name || '').trim() || email.split('@')[0] || 'Business owner'
    const businessName = String(req.body?.businessName || '').trim() || 'New business'

    if (!email) throw new HttpError(400, 'Owner email is required')
    if (!password || password.length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters')
    }

    const exists = await User.findOne({ email })
    if (exists) throw new HttpError(409, 'Email already registered')

    const owner = await User.create({
      name,
      email,
      password,
      role: 'BUSINESS_OWNER',
    })

    const business = await createBusinessForOwner(owner._id, { name: businessName })

    res.status(201).json({
      ok: true,
      owner: owner.toSafeObject(),
      business: business.toObject(),
    })
  } catch (e) {
    next(e)
  }
}

export async function getBusinessProfileDetail(req, res, next) {
  try {
    const businessDoc = await Business.findById(req.params.id)
    if (!businessDoc) throw new HttpError(404, 'Business not found')
    sanitizeBusinessGeoFields(businessDoc)
    if (businessDoc.isModified()) await businessDoc.save()

    const bundle = await getBusinessDetailBundle(req.params.id)
    res.json({ ok: true, ...bundle })
  } catch (e) {
    next(e)
  }
}

export async function updateBusinessProfile(req, res, next) {
  try {
    const business = await loadBusiness(req.params.id)
    await applyBusinessUpdate(business, req.body)
    res.json({ ok: true, business })
  } catch (e) {
    next(e)
  }
}

export async function updateBusinessProfileContent(req, res, next) {
  try {
    await loadBusiness(req.params.id)
    const content = await applyBusinessContentUpdate(req.params.id, req.body)
    res.json({ ok: true, content })
  } catch (e) {
    next(e)
  }
}

export async function completeBusinessProfileOnboarding(req, res, next) {
  try {
    const business = await loadBusiness(req.params.id)
    await completeBusinessOnboarding(business)
    res.json({ ok: true, business })
  } catch (e) {
    next(e)
  }
}

export async function createBusinessProfilePreviewToken(req, res, next) {
  try {
    const business = await Business.findById(req.params.id).select('_id ownerId').lean()
    if (!business) throw new HttpError(404, 'Business not found')
    const secret = jwtSecret()
    if (!secret) throw new HttpError(500, 'JWT_SECRET is not configured')
    const token = signAccessToken(
      { sub: business.ownerId.toString(), biz: business._id.toString(), typ: 'biz-preview' },
      secret,
      '10m',
    )
    res.json({ ok: true, token })
  } catch (e) {
    next(e)
  }
}

function themeSettingsToPlain(cur) {
  if (!cur || typeof cur !== 'object') return {}
  return typeof cur.toObject === 'function' ? cur.toObject() : { ...cur }
}

export async function putBusinessProfileThemeCustom(req, res, next) {
  try {
    const business = await loadBusiness(req.params.id)
    const { templateId, colors } = req.body || {}
    if (!templateId || typeof templateId !== 'string') {
      throw new HttpError(400, 'templateId is required')
    }
    const { ok, error, sanitized } = validateCustomThemePatch(templateId, colors)
    if (!ok) throw new HttpError(400, error)

    const cur = themeSettingsToPlain(business.themeSettings)
    const presets = { ...(cur.themeColorPresets || {}) }
    const prev = presets[templateId] && typeof presets[templateId] === 'object' ? presets[templateId] : {}
    presets[templateId] = { ...prev, ...sanitized }

    business.set('themeSettings', { ...cur, themeColorPresets: presets })
    business.markModified('themeSettings')
    await business.save()
    res.json({ ok: true, business })
  } catch (e) {
    next(e)
  }
}

export async function deleteBusinessProfileThemeCustom(req, res, next) {
  try {
    const business = await loadBusiness(req.params.id)
    const { templateId } = req.params
    if (!templateId) throw new HttpError(400, 'templateId is required')

    const cur = themeSettingsToPlain(business.themeSettings)
    const presets = { ...(cur.themeColorPresets || {}) }
    delete presets[templateId]

    business.set('themeSettings', { ...cur, themeColorPresets: presets })
    business.markModified('themeSettings')
    await business.save()
    res.json({ ok: true, business })
  } catch (e) {
    next(e)
  }
}

export { uploadMediaDataUrl, aiGenerate }
