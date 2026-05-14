import { Business } from '../models/Business.js'
import { BadgeRequest } from '../models/BadgeRequest.js'
import { BusinessBadgeAudit } from '../models/BusinessBadgeAudit.js'
import { HttpError } from '../middleware/errorHandler.js'

function serializeAudit(doc) {
  const u = doc.performedBy
  return {
    id: doc._id.toString(),
    action: doc.action,
    badgeType: doc.badgeType,
    adminNotes: doc.adminNotes || '',
    createdAt: doc.createdAt,
    performedByEmail: u && typeof u === 'object' && u.email ? u.email : '',
  }
}

function serializeRequest(doc) {
  const b = doc.businessId
  const u = doc.requestedBy
  const bPopulated =
    b && typeof b === 'object' && b._id != null && (b.name !== undefined || b.publicId !== undefined)
  return {
    id: doc._id.toString(),
    badgeType: doc.badgeType,
    ownerNotes: doc.ownerNotes || '',
    status: doc.status,
    adminNotes: doc.adminNotes || '',
    createdAt: doc.createdAt,
    fulfilledAt: doc.fulfilledAt,
    businessId: bPopulated ? b._id.toString() : String(doc.businessId),
    businessName: bPopulated ? b.name || '' : '',
    businessPublicId: bPopulated ? b.publicId || '' : '',
    requestedByEmail: u && typeof u === 'object' && u.email ? u.email : '',
  }
}

export async function listPendingBadgeRequests(req, res, next) {
  try {
    const items = await BadgeRequest.find({ status: 'PENDING' })
      .sort({ createdAt: -1 })
      .populate('businessId', 'name publicId onboardingCompletedAt')
      .populate('requestedBy', 'email name')
      .lean()

    res.json({ ok: true, items: items.map(serializeRequest) })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /admin/businesses/:id/grant-badge
 * body: { badgeType, verifiedChecklistAccepted?, adminNotes?, badgeRequestId? }
 */
export async function grantBusinessBadge(req, res, next) {
  try {
    const { badgeType: rawType, verifiedChecklistAccepted, adminNotes, badgeRequestId } = req.body || {}
    const badgeType = String(rawType || '').toUpperCase().trim()
    if (!['FEATURED', 'VERIFIED'].includes(badgeType)) {
      throw new HttpError(400, 'badgeType must be FEATURED or VERIFIED')
    }
    if (badgeType === 'VERIFIED' && !verifiedChecklistAccepted) {
      throw new HttpError(
        400,
        'Verified badge requires confirming the verification checklist (documentation reviewed).',
      )
    }

    const b = await Business.findById(req.params.id)
    if (!b) throw new HttpError(404, 'Business not found')

    if (badgeType === 'FEATURED') b.isFeatured = true
    if (badgeType === 'VERIFIED') b.isVerified = true
    await b.save()

    await BusinessBadgeAudit.create({
      businessId: b._id,
      action: 'GRANT',
      badgeType,
      adminNotes: String(adminNotes || '').trim(),
      performedBy: req.user?._id || null,
    })

    if (badgeRequestId) {
      const reqDoc = await BadgeRequest.findById(String(badgeRequestId))
      if (!reqDoc) throw new HttpError(404, 'Badge request not found')
      if (reqDoc.businessId.toString() !== b._id.toString()) {
        throw new HttpError(400, 'Badge request does not belong to this business')
      }
      if (reqDoc.status !== 'PENDING') {
        throw new HttpError(400, 'Badge request is not pending')
      }
      if (reqDoc.badgeType !== badgeType) {
        throw new HttpError(400, 'Badge request type does not match selected badge')
      }
      reqDoc.status = 'FULFILLED'
      reqDoc.adminNotes = String(adminNotes || '').trim()
      reqDoc.fulfilledAt = new Date()
      await reqDoc.save()
    }

    res.json({
      ok: true,
      business: {
        _id: b._id,
        isFeatured: b.isFeatured,
        isVerified: b.isVerified,
      },
    })
  } catch (e) {
    next(e)
  }
}

/**
 * GET /admin/businesses/:id/badge-audit
 */
export async function listBusinessBadgeAudit(req, res, next) {
  try {
    const items = await BusinessBadgeAudit.find({ businessId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('performedBy', 'email name')
      .lean()

    res.json({ ok: true, items: items.map(serializeAudit) })
  } catch (e) {
    next(e)
  }
}

/**
 * POST /admin/businesses/:id/revoke-badge
 * body: { badgeType, adminNotes } — note is required
 */
export async function revokeBusinessBadge(req, res, next) {
  try {
    const { badgeType: rawType, adminNotes: rawNotes } = req.body || {}
    const badgeType = String(rawType || '').toUpperCase().trim()
    if (!['FEATURED', 'VERIFIED'].includes(badgeType)) {
      throw new HttpError(400, 'badgeType must be FEATURED or VERIFIED')
    }
    const adminNotes = String(rawNotes || '').trim()
    if (!adminNotes) {
      throw new HttpError(400, 'A note is required when removing a badge.')
    }

    const b = await Business.findById(req.params.id)
    if (!b) throw new HttpError(404, 'Business not found')

    if (badgeType === 'FEATURED') {
      if (!b.isFeatured) {
        throw new HttpError(400, 'This listing does not currently have the Featured badge.')
      }
      b.isFeatured = false
    }
    if (badgeType === 'VERIFIED') {
      if (!b.isVerified) {
        throw new HttpError(400, 'This listing does not currently have the Verified badge.')
      }
      b.isVerified = false
    }
    await b.save()

    await BusinessBadgeAudit.create({
      businessId: b._id,
      action: 'REVOKE',
      badgeType,
      adminNotes,
      performedBy: req.user?._id || null,
    })

    res.json({
      ok: true,
      business: {
        _id: b._id,
        isFeatured: b.isFeatured,
        isVerified: b.isVerified,
      },
    })
  } catch (e) {
    next(e)
  }
}
