import { Plan } from '../models/Plan.js'
import { Business } from '../models/Business.js'
import { Payment } from '../models/Payment.js'
import { PaymentHistory } from '../models/PaymentHistory.js'
import { HttpError } from '../middleware/errorHandler.js'
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
  getPublicKeyId,
  getRazorpayKeyMode,
  assertRazorpayConfigured,
} from '../services/razorpay.service.js'

function inrToPaise(inr) {
  return Math.round(Number(inr) * 100)
}

/** Map purchased plan display name to legacy `Business.plan` enum for existing feature gates. */
function legacyPlanTier(planName) {
  const n = String(planName || '')
    .toUpperCase()
    .trim()
  if (['FREE', 'CORE', 'PRO', 'PREMIUM'].includes(n)) return n
  return 'PRO'
}

async function syncPaymentHistory({ userId, businessId, plan, payment, status, raw = null }) {
  try {
    await PaymentHistory.create({
      userId,
      businessId,
      razorpayOrderId: payment?.razorpayOrderId || '',
      razorpayPaymentId: payment?.razorpayPaymentId || '',
      amountPaise: payment?.amount ?? 0,
      currency: payment?.currency || 'INR',
      plan: legacyPlanTier(plan.name),
      status,
      raw,
    })
  } catch {
    /* non-blocking audit log */
  }
}

async function assertOwnerBusiness(businessId, userId) {
  const b = await Business.findById(businessId)
  if (!b) throw new HttpError(404, 'Business not found')
  if (b.ownerId.toString() !== userId.toString()) {
    throw new HttpError(403, 'Not your business')
  }
  return b
}

async function resolveBusinessIdForOwner(user) {
  let businessId = user.ownedBusinessId
  if (businessId) return businessId
  const first = await Business.findOne({ ownerId: user._id }).select('_id').lean()
  if (!first) throw new HttpError(400, 'No business found; create a business first')
  return first._id
}

/**
 * Apply subscription dates and plan reference on a business document.
 * @param {import('mongoose').Document} business
 * @param {object} plan lean or doc
 */
export async function applySubscriptionToBusiness(business, plan) {
  const now = new Date()
  const days = Number(plan.validity) || 365
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  business.planId = plan._id
  business.subscriptionStatus = 'ACTIVE'
  business.subscriptionStart = now
  business.subscriptionEnd = end
  business.planExpiresAt = end
  business.plan = legacyPlanTier(plan.name)
  await business.save()
  return Business.findById(business._id).populate('planId').lean()
}

export async function listActivePlansPublic(_req, res, next) {
  try {
    const plans = await Plan.find({ isActive: true }).sort({ price: 1 }).lean()
    res.json({ ok: true, plans })
  } catch (e) {
    next(e)
  }
}

export async function createPaymentOrder(req, res, next) {
  try {
    const { planId, businessId: bodyBusinessId } = req.body
    if (!planId) throw new HttpError(400, 'planId is required')

    const businessId = bodyBusinessId
      ? bodyBusinessId
      : (await resolveBusinessIdForOwner(req.user)).toString()

    await assertOwnerBusiness(businessId, req.user._id)

    const plan = await Plan.findById(planId).lean()
    if (!plan || !plan.isActive) throw new HttpError(404, 'Plan not found or inactive')

    const amountPaise = inrToPaise(plan.price)

    if (amountPaise < 1) {
      const pending = await Payment.create({
        businessId,
        planId: plan._id,
        userId: req.user._id,
        amount: 0,
        currency: 'INR',
        status: 'SUCCESS',
      })
      const businessDoc = await Business.findById(businessId)
      const populated = await applySubscriptionToBusiness(businessDoc, plan)
      await syncPaymentHistory({
        userId: req.user._id,
        businessId,
        plan,
        payment: pending,
        status: 'PAID',
      })
      return res.json({
        ok: true,
        free: true,
        business: populated,
        plan: {
          _id: plan._id,
          name: plan.name,
          price: plan.price,
          validity: plan.validity,
        },
        paymentId: pending._id.toString(),
      })
    }

    assertRazorpayConfigured()

    const pending = await Payment.create({
      businessId,
      planId: plan._id,
      userId: req.user._id,
      amount: amountPaise,
      currency: 'INR',
      status: 'PENDING',
    })

    const receipt = `gv_${pending._id.toString().slice(-24)}`
    let order
    try {
      order = await createRazorpayOrder({
        amountPaise,
        receipt,
        notes: {
          businessId: String(businessId),
          planId: String(plan._id),
          paymentId: String(pending._id),
        },
      })
    } catch (err) {
      pending.status = 'FAILED'
      await pending.save()
      const msg =
        err?.error?.description ||
        err?.message ||
        'Could not create Razorpay order. Check server payment keys.'
      throw new HttpError(502, msg)
    }

    pending.razorpayOrderId = order.id
    await pending.save()

    await syncPaymentHistory({
      userId: req.user._id,
      businessId,
      plan,
      payment: pending,
      status: 'CREATED',
    })

    res.json({
      ok: true,
      free: false,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: getPublicKeyId(),
        keyMode: getRazorpayKeyMode(),
      },
      plan: {
        _id: plan._id,
        name: plan.name,
        price: plan.price,
        validity: plan.validity,
      },
      paymentId: pending._id.toString(),
    })
  } catch (e) {
    next(e)
  }
}

/** Activate a zero-rupee plan without Razorpay (explicit client path). */
export async function activateFreePlan(req, res, next) {
  try {
    const { planId, businessId: bodyBusinessId } = req.body
    if (!planId) throw new HttpError(400, 'planId is required')

    const businessId = bodyBusinessId
      ? bodyBusinessId
      : (await resolveBusinessIdForOwner(req.user)).toString()

    await assertOwnerBusiness(businessId, req.user._id)

    const plan = await Plan.findById(planId).lean()
    if (!plan || !plan.isActive) throw new HttpError(404, 'Plan not found or inactive')

    if (inrToPaise(plan.price) > 0) {
      throw new HttpError(400, 'This plan requires payment. Use create-order and Razorpay checkout.')
    }

    const pending = await Payment.create({
      businessId,
      planId: plan._id,
      userId: req.user._id,
      amount: 0,
      currency: 'INR',
      status: 'SUCCESS',
    })

    const businessDoc = await Business.findById(businessId)
    const populated = await applySubscriptionToBusiness(businessDoc, plan)
    await syncPaymentHistory({
      userId: req.user._id,
      businessId,
      plan,
      payment: pending,
      status: 'PAID',
    })

    res.json({ ok: true, free: true, business: populated })
  } catch (e) {
    next(e)
  }
}

export async function verifyPayment(req, res, next) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } = req.body

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new HttpError(400, 'Missing Razorpay payment fields')
    }
    if (!planId) throw new HttpError(400, 'planId is required')

    const okSig = verifyRazorpaySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    )
    if (!okSig) throw new HttpError(400, 'Invalid payment signature')

    const payment = await Payment.findOne({
      razorpayOrderId: razorpay_order_id,
      userId: req.user._id,
    })
    if (!payment) throw new HttpError(404, 'Payment record not found')

    if (payment.planId.toString() !== String(planId)) {
      throw new HttpError(400, 'planId does not match order')
    }

    const businessId = payment.businessId
    await assertOwnerBusiness(businessId, req.user._id)

    if (payment.status === 'SUCCESS') {
      const business = await Business.findById(businessId).populate('planId').lean()
      return res.json({ ok: true, alreadyVerified: true, business })
    }

    const plan = await Plan.findById(planId).lean()
    if (!plan) throw new HttpError(404, 'Plan not found')

    const expectedPaise = inrToPaise(plan.price)
    if (payment.amount !== expectedPaise) {
      throw new HttpError(400, 'Amount mismatch')
    }

    payment.razorpayPaymentId = razorpay_payment_id
    payment.status = 'SUCCESS'
    await payment.save()

    const businessDoc = await Business.findById(businessId)
    const populated = await applySubscriptionToBusiness(businessDoc, plan)

    await syncPaymentHistory({
      userId: req.user._id,
      businessId,
      plan,
      payment,
      status: 'PAID',
      raw: { razorpay_order_id, razorpay_payment_id },
    })

    res.json({ ok: true, business: populated })
  } catch (e) {
    next(e)
  }
}

export async function recordPaymentFailure(req, res, next) {
  try {
    const { razorpay_order_id, planId, error } = req.body
    if (!razorpay_order_id) throw new HttpError(400, 'razorpay_order_id is required')

    const payment = await Payment.findOne({
      razorpayOrderId: razorpay_order_id,
      userId: req.user._id,
    })
    if (!payment) {
      return res.json({ ok: true, recorded: false })
    }

    if (payment.status !== 'SUCCESS') {
      payment.status = 'FAILED'
      await payment.save()
    }

    const plan = planId
      ? await Plan.findById(planId).lean()
      : await Plan.findById(payment.planId).lean()

    if (plan) {
      await syncPaymentHistory({
        userId: req.user._id,
        businessId: payment.businessId,
        plan,
        payment,
        status: 'FAILED',
        raw: error || null,
      })
    }

    res.json({ ok: true, recorded: true })
  } catch (e) {
    next(e)
  }
}
