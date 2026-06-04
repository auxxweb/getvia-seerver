import { User } from '../../models/user.model.js'
import { Business } from '../models/Business.js'
import { BadgeRequest } from '../models/BadgeRequest.js'
import { HttpError } from '../middleware/errorHandler.js'
import { issueTokens } from '../../controllers/auth.controller.js'

function accountPayload(user, passwordField) {
  const safe = user.toSafeObject()
  safe.hasPassword = Boolean(passwordField)
  safe.canChangePassword = safe.hasPassword
  return safe
}

/** GET /admin/settings/account */
export async function getAccount(req, res, next) {
  try {
    if (req.user.role !== 'SUPER_ADMIN') {
      throw new HttpError(403, 'Super admin only')
    }
    const user = await User.findById(req.user._id).select('+password')
    if (!user) throw new HttpError(404, 'User not found')
    res.json({ ok: true, account: accountPayload(user, user.password) })
  } catch (e) {
    next(e)
  }
}

/** PATCH /admin/settings/account — name and phone */
export async function updateAccount(req, res, next) {
  try {
    if (req.user.role !== 'SUPER_ADMIN') {
      throw new HttpError(403, 'Super admin only')
    }
    const user = await User.findById(req.user._id).select('+password')
    if (!user) throw new HttpError(404, 'User not found')

    const { name, phone } = req.body || {}

    if (name !== undefined) {
      const trimmed = String(name).trim()
      if (!trimmed) throw new HttpError(400, 'Name is required')
      if (trimmed.length > 120) throw new HttpError(400, 'Name is too long')
      user.name = trimmed
    }

    if (phone !== undefined) {
      user.phone = String(phone || '').trim().slice(0, 32)
    }

    await user.save()
    res.json({ ok: true, account: accountPayload(user, user.password) })
  } catch (e) {
    next(e)
  }
}

/** POST /admin/settings/change-password */
export async function changePassword(req, res, next) {
  try {
    if (req.user.role !== 'SUPER_ADMIN') {
      throw new HttpError(403, 'Super admin only')
    }

    const currentPassword = String(req.body?.currentPassword || '')
    const newPassword = String(req.body?.newPassword || '')
    const confirmPassword = String(req.body?.confirmPassword || '')

    if (!newPassword || newPassword.length < 8) {
      throw new HttpError(400, 'New password must be at least 8 characters')
    }
    if (newPassword.length > 128) {
      throw new HttpError(400, 'New password is too long')
    }
    if (newPassword !== confirmPassword) {
      throw new HttpError(400, 'New password and confirmation do not match')
    }

    const user = await User.findById(req.user._id).select('+password +refreshTokens')
    if (!user) throw new HttpError(404, 'User not found')

    if (!user.password) {
      throw new HttpError(
        400,
        'This account does not use a password. Contact platform support to reset access.',
      )
    }

    if (!currentPassword || !(await user.comparePassword(currentPassword))) {
      throw new HttpError(401, 'Current password is incorrect')
    }

    if (currentPassword === newPassword) {
      throw new HttpError(400, 'New password must be different from your current password')
    }

    user.password = newPassword
    user.refreshTokens = []
    await user.save()

    const tokens = await issueTokens(user)
    res.json({
      ok: true,
      message: 'Password updated. Other sessions have been signed out.',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      account: accountPayload(user, user.password),
    })
  } catch (e) {
    next(e)
  }
}

/** GET /admin/settings/platform — portals, env hints, pending work counts */
export async function getPlatformSettings(req, res, next) {
  try {
    if (req.user.role !== 'SUPER_ADMIN') {
      throw new HttpError(403, 'Super admin only')
    }

    const [pendingBadges, onboardedBusinesses, consumers, businessOwners] = await Promise.all([
      BadgeRequest.countDocuments({ status: 'PENDING' }),
      Business.countDocuments({ onboardingCompletedAt: { $ne: null } }),
      User.countDocuments({ role: 'USER' }),
      User.countDocuments({ role: 'BUSINESS_OWNER' }),
    ])

    const consumerSite =
      String(process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL || '').trim() ||
      'http://localhost:5173'
    const businessAdmin =
      String(
        process.env.BUSINESS_ADMIN_URL ||
          process.env.VITE_BUSINESS_ADMIN_URL ||
          '',
      ).trim() || 'http://localhost:5175'

    res.json({
      ok: true,
      portals: {
        consumerSite,
        businessAdmin,
        superAdmin: String(process.env.SUPER_ADMIN_URL || '').trim() || 'http://localhost:5174',
      },
      apiPublicUrl:
        String(process.env.API_PUBLIC_URL || process.env.PUBLIC_API_URL || '').trim() || null,
      counts: {
        pendingBadgeRequests: pendingBadges,
        onboardedBusinesses,
        consumers,
        businessOwners,
      },
    })
  } catch (e) {
    next(e)
  }
}
