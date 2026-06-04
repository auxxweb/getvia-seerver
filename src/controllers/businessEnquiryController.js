import mongoose from 'mongoose'
import { Business } from '../models/Business.js'
import { BusinessEnquiry } from '../models/BusinessEnquiry.js'
import { User } from '../models/User.js'
import { HttpError } from '../middleware/errorHandler.js'
import { trackEvent } from '../services/analytics.service.js'

async function publicMatch() {
  const blockedOwnerIds = await User.find({ isBlocked: true, role: 'BUSINESS_OWNER' }).distinct('_id')
  return {
    approvalStatus: 'APPROVED',
    ownerId: { $nin: blockedOwnerIds },
  }
}

async function findPublicBusiness(publicId) {
  const id = String(publicId || '').trim()
  if (!id) return null
  const filter = await publicMatch()
  return Business.findOne({ publicId: id, ...filter }).lean()
}

export async function submitPublicEnquiry(req, res, next) {
  try {
    const publicId = String(req.params.publicId || '').trim()
    const business = await findPublicBusiness(publicId)
    if (!business) throw new HttpError(404, 'Business not found')

    const name = String(req.body.name || '').trim()
    const email = String(req.body.email || '').trim()
    const phone = String(req.body.phone || '').trim()
    const message = String(req.body.message || '').trim()

    if (!name) throw new HttpError(400, 'Name is required.')
    if (!message) throw new HttpError(400, 'Message is required.')
    if (!email && !phone) throw new HttpError(400, 'Email or phone is required.')

    const row = await BusinessEnquiry.create({
      businessId: business._id,
      name,
      email,
      phone,
      message,
    })

    await trackEvent(business._id, 'enquiry')

    res.status(201).json({ ok: true, enquiry: row })
  } catch (e) {
    next(e)
  }
}

export async function listOwnerEnquiries(req, res, next) {
  try {
    const businessId = req.params.id
    if (!mongoose.Types.ObjectId.isValid(businessId)) {
      throw new HttpError(400, 'Invalid business id')
    }
    const business = await Business.findOne({ _id: businessId, ownerId: req.user._id }).lean()
    if (!business) throw new HttpError(404, 'Business not found')

    const items = await BusinessEnquiry.find({ businessId: business._id })
      .sort({ createdAt: -1 })
      .lean()

    res.json({ ok: true, items })
  } catch (e) {
    next(e)
  }
}

export async function patchOwnerEnquiry(req, res, next) {
  try {
    const businessId = req.params.id
    const enquiryId = req.params.enquiryId
    if (!mongoose.Types.ObjectId.isValid(businessId) || !mongoose.Types.ObjectId.isValid(enquiryId)) {
      throw new HttpError(400, 'Invalid id')
    }
    const business = await Business.findOne({ _id: businessId, ownerId: req.user._id }).lean()
    if (!business) throw new HttpError(404, 'Business not found')

    const { status } = req.body
    if (status && !['open', 'archived'].includes(status)) {
      throw new HttpError(400, 'Invalid status')
    }

    const row = await BusinessEnquiry.findOneAndUpdate(
      { _id: enquiryId, businessId: business._id },
      status ? { status } : {},
      { new: true },
    ).lean()
    if (!row) throw new HttpError(404, 'Enquiry not found')
    res.json({ ok: true, enquiry: row })
  } catch (e) {
    next(e)
  }
}
