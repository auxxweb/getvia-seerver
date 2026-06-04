import { Business } from '../models/Business.js'
import { Plan } from '../models/Plan.js'
import { Payment } from '../models/Payment.js'
import { PaymentHistory } from '../models/PaymentHistory.js'
import { User } from '../models/User.js'
import { resolveDateRange } from '../services/analytics/analyticsQuery.service.js'

function paiseToInr(paise) {
  const n = Number(paise) || 0
  return `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function startOfDayUtc(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`)
}

function endOfDayUtc(dateKey) {
  return new Date(`${dateKey}T23:59:59.999Z`)
}

function daysUntil(date) {
  if (!date) return null
  const end = new Date(date)
  const now = new Date()
  return Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
}

function deriveLifecycle(business, plan) {
  const now = Date.now()
  const endMs = business.subscriptionEnd ? new Date(business.subscriptionEnd).getTime() : null
  const hasPaidPlan = plan && Number(plan.price) > 0
  const hasPlan = Boolean(business.planId)

  if (!hasPlan) {
    return { status: 'none', label: 'No plan', daysUntilExpiry: null }
  }

  if (!hasPaidPlan) {
    return { status: 'free', label: 'Free tier', daysUntilExpiry: endMs ? daysUntil(business.subscriptionEnd) : null }
  }

  if (business.subscriptionStatus === 'EXPIRED' || (endMs != null && endMs < now)) {
    return { status: 'expired', label: 'Expired', daysUntilExpiry: daysUntil(business.subscriptionEnd) }
  }

  const days = endMs ? daysUntil(business.subscriptionEnd) : null
  if (days != null && days <= 7) {
    return { status: 'expiring_soon', label: 'Expiring soon', daysUntilExpiry: days }
  }
  if (days != null && days <= 30) {
    return { status: 'expiring_30', label: 'Expiring (30d)', daysUntilExpiry: days }
  }

  return {
    status: 'active',
    label: business.subscriptionStatus === 'ACTIVE' ? 'Active' : 'Active',
    daysUntilExpiry: days,
  }
}

function monthlyRecurringFromPlan(plan) {
  if (!plan || Number(plan.price) <= 0) return 0
  const validity = Math.max(1, Number(plan.validity) || 30)
  return Math.round((Number(plan.price) * 100 * 30) / validity)
}

function serializeSubscriptionRow(business, owner, plan, paidTotalPaise = 0) {
  const lifecycle = deriveLifecycle(business, plan)
  return {
    businessId: business._id.toString(),
    businessName: business.name || '',
    publicId: business.publicId || '',
    ownerName: owner?.name || '',
    ownerEmail: owner?.email || '',
    planId: plan?._id?.toString() || (business.planId ? String(business.planId) : ''),
    planName: plan?.name || business.plan || '—',
    planPrice: plan?.price ?? 0,
    subscriptionStatus: business.subscriptionStatus || '—',
    lifecycleStatus: lifecycle.status,
    lifecycleLabel: lifecycle.label,
    daysUntilExpiry: lifecycle.daysUntilExpiry,
    subscriptionStart: business.subscriptionStart,
    subscriptionEnd: business.subscriptionEnd,
    totalPaidPaise: paidTotalPaise,
    totalPaidDisplay: paiseToInr(paidTotalPaise),
    approvalStatus: business.approvalStatus,
    onboardingCompletedAt: business.onboardingCompletedAt,
  }
}

function serializePaymentRow(doc, source) {
  const business = doc.businessId
  const user = doc.userId
  const plan = doc.planId
  const bPop =
    business && typeof business === 'object' && business._id != null
  const uPop = user && typeof user === 'object' && user._id != null
  const pPop = plan && typeof plan === 'object' && plan._id != null

  const amountPaise = source === 'payment' ? doc.amount : doc.amountPaise
  const status = source === 'payment' ? doc.status : doc.status
  const createdAt = doc.createdAt

  return {
    id: doc._id.toString(),
    source,
    businessId: bPop ? business._id.toString() : doc.businessId ? String(doc.businessId) : '',
    businessName: bPop ? business.name || '' : '',
    publicId: bPop ? business.publicId || '' : '',
    ownerEmail: uPop ? user.email || '' : '',
    ownerName: uPop ? user.name || '' : '',
    planName: pPop ? plan.name : doc.plan || '—',
    planPrice: pPop ? plan.price : null,
    amountPaise,
    amountDisplay: paiseToInr(amountPaise),
    currency: doc.currency || 'INR',
    status,
    razorpayOrderId: doc.razorpayOrderId || '',
    razorpayPaymentId: doc.razorpayPaymentId || '',
    createdAt,
  }
}

/**
 * GET /admin/subscriptions/revenue
 * Query: preset, status (all|active|expiring|expired|free), page, limit
 */
export async function getSubscriptionRevenueDashboard(req, res, next) {
  try {
    const { from, to, preset } = resolveDateRange(req.query)
    const rangeStart = startOfDayUtc(from)
    const rangeEnd = endOfDayUtc(to)
    const statusFilter = String(req.query.status || 'all').toLowerCase()
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
    const limit = Math.min(100, Math.max(10, parseInt(String(req.query.limit || '50'), 10) || 50))

    const now = new Date()
    const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const [
      totalRevenueAgg,
      rangeRevenueHistory,
      rangeRevenuePayments,
      businesses,
      plans,
      paymentRows,
      historyRows,
      failedInRange,
      pendingPayments,
      paidByBusiness,
    ] = await Promise.all([
      PaymentHistory.aggregate([
        { $match: { status: 'PAID' } },
        { $group: { _id: null, total: { $sum: '$amountPaise' } } },
      ]),
      PaymentHistory.aggregate([
        {
          $match: {
            status: 'PAID',
            createdAt: { $gte: rangeStart, $lte: rangeEnd },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            amountPaise: { $sum: '$amountPaise' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Payment.aggregate([
        {
          $match: {
            status: 'SUCCESS',
            createdAt: { $gte: rangeStart, $lte: rangeEnd },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            amountPaise: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Business.find({ planId: { $ne: null } })
        .populate('ownerId', 'name email isBlocked')
        .populate('planId', 'name price validity isActive')
        .sort({ subscriptionEnd: 1 })
        .lean(),
      Plan.find().lean(),
      Payment.find()
        .populate('businessId', 'name publicId')
        .populate('userId', 'name email')
        .populate('planId', 'name price')
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
      PaymentHistory.find()
        .populate({ path: 'businessId', select: 'name publicId' })
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
      Payment.countDocuments({
        status: 'FAILED',
        createdAt: { $gte: rangeStart, $lte: rangeEnd },
      }),
      Payment.countDocuments({ status: 'PENDING' }),
      PaymentHistory.aggregate([
        { $match: { status: 'PAID', businessId: { $ne: null } } },
        { $group: { _id: '$businessId', total: { $sum: '$amountPaise' } } },
      ]),
    ])

    const paidMap = new Map(paidByBusiness.map((r) => [String(r._id), r.total]))

    const planById = new Map(plans.map((p) => [p._id.toString(), p]))

    let activePaid = 0
    let expiring7 = 0
    let expiring30 = 0
    let expired = 0
    let freeTier = 0
    let mrrPaise = 0
    const planMix = new Map()

    const subscriptionRows = businesses.map((b) => {
      const plan =
        b.planId && typeof b.planId === 'object'
          ? b.planId
          : planById.get(String(b.planId)) || null
      const owner = b.ownerId && typeof b.ownerId === 'object' ? b.ownerId : null
      const paidTotal = paidMap.get(b._id.toString()) || 0
      const lifecycle = deriveLifecycle(b, plan)

      if (plan && Number(plan.price) > 0) {
        const pid = plan._id.toString()
        const prev = planMix.get(pid) || { planId: pid, planName: plan.name, count: 0, mrrPaise: 0 }
        prev.count += 1
        if (lifecycle.status === 'active' || lifecycle.status === 'expiring_soon' || lifecycle.status === 'expiring_30') {
          const m = monthlyRecurringFromPlan(plan)
          mrrPaise += m
          prev.mrrPaise += m
        }
        planMix.set(pid, prev)
      }

      if (lifecycle.status === 'active') activePaid += 1
      else if (lifecycle.status === 'expiring_soon') expiring7 += 1
      else if (lifecycle.status === 'expiring_30') expiring30 += 1
      else if (lifecycle.status === 'expired') expired += 1
      else if (lifecycle.status === 'free') freeTier += 1

      return serializeSubscriptionRow(b, owner, plan, paidTotal)
    })

    const filteredSubs = subscriptionRows.filter((row) => {
      if (statusFilter === 'all') return true
      if (statusFilter === 'at_risk') {
        return (
          row.lifecycleStatus === 'expiring_soon' ||
          row.lifecycleStatus === 'expiring_30' ||
          row.lifecycleStatus === 'expired'
        )
      }
      if (statusFilter === 'active') return row.lifecycleStatus === 'active'
      if (statusFilter === 'expiring') {
        return row.lifecycleStatus === 'expiring_soon' || row.lifecycleStatus === 'expiring_30'
      }
      if (statusFilter === 'expired') return row.lifecycleStatus === 'expired'
      if (statusFilter === 'free') return row.lifecycleStatus === 'free'
      return true
    })

    const totalSubs = filteredSubs.length
    const skip = (page - 1) * limit
    const subscriptionsPage = filteredSubs.slice(skip, skip + limit)

    const trendMap = new Map()
    for (const row of rangeRevenueHistory) {
      trendMap.set(row._id, (trendMap.get(row._id) || 0) + (row.amountPaise || 0))
    }
    for (const row of rangeRevenuePayments) {
      trendMap.set(row._id, (trendMap.get(row._id) || 0) + (row.amountPaise || 0))
    }
    const revenueTrend = [...trendMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amountPaise]) => ({
        date,
        amountPaise,
        amountDisplay: paiseToInr(amountPaise),
      }))

    const seenPaymentIds = new Set(
      paymentRows.filter((p) => p.razorpayPaymentId).map((p) => p.razorpayPaymentId),
    )
    const mergedPayments = [
      ...paymentRows.map((p) => serializePaymentRow(p, 'payment')),
      ...historyRows
        .filter((h) => !h.razorpayPaymentId || !seenPaymentIds.has(h.razorpayPaymentId))
        .map((h) => serializePaymentRow(h, 'history')),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    const rangeRevenuePaise = revenueTrend.reduce((s, r) => s + r.amountPaise, 0)
    const totalRevenuePaise = totalRevenueAgg[0]?.total || 0

    res.json({
      ok: true,
      range: { from, to, preset },
      summary: {
        totalRevenuePaise,
        totalRevenueDisplay: paiseToInr(totalRevenuePaise),
        revenueInRangePaise: rangeRevenuePaise,
        revenueInRangeDisplay: paiseToInr(rangeRevenuePaise),
        mrrEstimatePaise: mrrPaise,
        mrrEstimateDisplay: paiseToInr(mrrPaise),
        arrEstimateDisplay: paiseToInr(mrrPaise * 12),
        activePaidSubscriptions: activePaid,
        expiringWithin7Days: expiring7,
        expiringWithin30Days: expiring30 + expiring7,
        expiredSubscriptions: expired,
        freeTierSubscriptions: freeTier,
        totalWithPlan: businesses.length,
        failedPaymentsInRange: failedInRange,
        pendingPayments,
        businessOwners: await User.countDocuments({ role: 'BUSINESS_OWNER' }),
      },
      planMix: [...planMix.values()].sort((a, b) => b.count - a.count).map((p) => ({
        ...p,
        mrrDisplay: paiseToInr(p.mrrPaise),
      })),
      revenueTrend,
      subscriptions: subscriptionsPage,
      payments: mergedPayments.slice(0, 100),
      pagination: {
        page,
        limit,
        total: totalSubs,
        totalPages: Math.max(1, Math.ceil(totalSubs / limit)),
      },
      thresholds: {
        expiringSoonBefore: in7d.toISOString(),
        expiring30Before: in30d.toISOString(),
      },
    })
  } catch (e) {
    next(e)
  }
}
