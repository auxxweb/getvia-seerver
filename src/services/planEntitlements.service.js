import { HttpError } from '../middleware/errorHandler.js'
import { Business } from '../models/Business.js'
import { BusinessContent } from '../models/BusinessContent.js'
import { BusinessPlanUsage } from '../models/BusinessPlanUsage.js'
import { Plan } from '../models/Plan.js'
import {
  ALL_TEMPLATE_IDS,
  DEFAULT_FREE_ENTITLEMENTS,
} from '../constants/planEntitlements.js'

export function parsePlanLimit(raw) {
  if (raw === null || raw === undefined || raw === '' || raw === 'unlimited') return null
  if (typeof raw === 'string' && raw.trim().toLowerCase() === 'unlimited') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'Invalid limit value (use 0+ or unlimited)')
  return Math.floor(n)
}

export function parseEntitlementsBody(body = {}) {
  const period = String(body.offerPostingPeriod || 'monthly').toLowerCase()
  if (!['daily', 'weekly', 'monthly'].includes(period)) {
    throw new HttpError(400, 'offerPostingPeriod must be daily, weekly, or monthly')
  }
  return {
    galleryImageLimit: parsePlanLimit(body.galleryImageLimit),
    templateCount: parsePlanLimit(body.templateCount),
    aiPromptsPerMonth: parsePlanLimit(body.aiPromptsPerMonth),
    offerPostingPeriod: period,
    offerPostingLimit: parsePlanLimit(body.offerPostingLimit),
    aiInsightsEnabled: Boolean(body.aiInsightsEnabled),
  }
}

function normalizeEntitlements(raw) {
  const base = { ...DEFAULT_FREE_ENTITLEMENTS, ...(raw || {}) }
  return {
    galleryImageLimit: base.galleryImageLimit ?? null,
    templateCount: base.templateCount ?? null,
    aiPromptsPerMonth: base.aiPromptsPerMonth ?? null,
    offerPostingPeriod: base.offerPostingPeriod || 'monthly',
    offerPostingLimit: base.offerPostingLimit ?? null,
    aiInsightsEnabled: Boolean(base.aiInsightsEnabled),
  }
}

export async function resolveBusinessEntitlements(businessId) {
  const business = await Business.findById(businessId).populate('planId').lean()
  if (!business) throw new HttpError(404, 'Business not found')

  const planDoc = business.planId
  const planName = planDoc?.name || business.plan || 'FREE'
  const entitlements = normalizeEntitlements(planDoc?.entitlements)

  const subscriptionActive =
    !business.subscriptionEnd || new Date(business.subscriptionEnd).getTime() >= Date.now()

  return {
    business,
    planName,
    planId: planDoc?._id?.toString() || null,
    entitlements,
    subscriptionActive,
  }
}

export function allowedTemplateIds(entitlements) {
  const count = entitlements.templateCount
  if (count == null) return [...ALL_TEMPLATE_IDS]
  return ALL_TEMPLATE_IDS.slice(0, Math.max(0, count))
}

function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

export function offerPeriodKey(period, d = new Date()) {
  if (period === 'daily') return dayKey(d)
  if (period === 'weekly') return isoWeekKey(d)
  return monthKey(d)
}

async function getOrCreateUsage(businessId) {
  let row = await BusinessPlanUsage.findOne({ businessId })
  if (!row) {
    row = await BusinessPlanUsage.create({ businessId })
  }
  return row
}

function remaining(used, limit) {
  if (limit == null) return null
  return Math.max(0, limit - used)
}

export async function getPlanUsageSummary(businessId) {
  const { planName, planId, entitlements, subscriptionActive } = await resolveBusinessEntitlements(businessId)
  const usage = await getOrCreateUsage(businessId)
  const content = await BusinessContent.findOne({ businessId }).lean()
  const galleryCount = (content?.gallery || []).filter(Boolean).length

  const aiKey = monthKey()
  const aiUsed = usage.aiPromptsMonthKey === aiKey ? usage.aiPromptsUsed : 0
  const offerKey = offerPeriodKey(entitlements.offerPostingPeriod)
  const offerUsed = usage.offerPeriodKey === offerKey ? usage.offerPostsUsed : 0

  return {
    planName,
    planId,
    subscriptionActive,
    entitlements,
    allowedTemplateIds: allowedTemplateIds(entitlements),
    usage: {
      galleryCount,
      galleryLimit: entitlements.galleryImageLimit,
      galleryRemaining: remaining(galleryCount, entitlements.galleryImageLimit),
      aiPromptsUsed: aiUsed,
      aiPromptsLimit: entitlements.aiPromptsPerMonth,
      aiPromptsRemaining: remaining(aiUsed, entitlements.aiPromptsPerMonth),
      aiPromptsMonthKey: aiKey,
      offerPostsUsed: offerUsed,
      offerPostsLimit: entitlements.offerPostingLimit,
      offerPostsRemaining: remaining(offerUsed, entitlements.offerPostingLimit),
      offerPostingPeriod: entitlements.offerPostingPeriod,
      offerPeriodKey: offerKey,
      aiInsightsEnabled: entitlements.aiInsightsEnabled,
    },
  }
}

export async function assertGalleryWithinPlan(businessId, nextGalleryUrls) {
  const { entitlements } = await resolveBusinessEntitlements(businessId)
  const limit = entitlements.galleryImageLimit
  if (limit == null) return
  const count = (nextGalleryUrls || []).filter(Boolean).length
  if (count > limit) {
    throw new HttpError(
      403,
      `Your plan allows up to ${limit} gallery image${limit === 1 ? '' : 's'}. Upgrade your plan for more.`,
    )
  }
}

export async function assertTemplateAllowed(businessId, templateId) {
  if (!templateId) return
  const { entitlements } = await resolveBusinessEntitlements(businessId)
  const allowed = allowedTemplateIds(entitlements)
  if (!allowed.includes(templateId)) {
    throw new HttpError(
      403,
      `Your plan includes ${allowed.length} template${allowed.length === 1 ? '' : 's'}. Upgrade to unlock more layouts.`,
    )
  }
}

export async function consumeAiPrompt(businessId) {
  const { entitlements } = await resolveBusinessEntitlements(businessId)
  const limit = entitlements.aiPromptsPerMonth
  const usage = await getOrCreateUsage(businessId)
  const key = monthKey()

  if (usage.aiPromptsMonthKey !== key) {
    usage.aiPromptsMonthKey = key
    usage.aiPromptsUsed = 0
  }

  if (limit != null && usage.aiPromptsUsed >= limit) {
    throw new HttpError(
      403,
      `Monthly AI prompt limit reached (${limit}). Upgrade your plan or wait until next month.`,
    )
  }

  usage.aiPromptsUsed += 1
  await usage.save()
  return {
    used: usage.aiPromptsUsed,
    limit,
    remaining: remaining(usage.aiPromptsUsed, limit),
  }
}

export async function assertAndConsumeOfferPosts(businessId, previousOfferCount, nextOfferCount) {
  const delta = Math.max(0, (nextOfferCount || 0) - (previousOfferCount || 0))
  if (delta === 0) return

  const { entitlements } = await resolveBusinessEntitlements(businessId)
  const limit = entitlements.offerPostingLimit
  const usage = await getOrCreateUsage(businessId)
  const key = offerPeriodKey(entitlements.offerPostingPeriod)

  if (usage.offerPeriodKey !== key) {
    usage.offerPeriodKey = key
    usage.offerPostsUsed = 0
  }

  if (limit != null && usage.offerPostsUsed + delta > limit) {
    const periodLabel =
      entitlements.offerPostingPeriod === 'daily'
        ? 'today'
        : entitlements.offerPostingPeriod === 'weekly'
          ? 'this week'
          : 'this month'
    throw new HttpError(
      403,
      `Offer posting limit reached for ${periodLabel} (${limit} per ${entitlements.offerPostingPeriod}). Upgrade your plan for more.`,
    )
  }

  usage.offerPostsUsed += delta
  await usage.save()
}

export async function assignPlanToBusiness(businessId, planId, options = {}) {
  const business = await Business.findById(businessId)
  if (!business) throw new HttpError(404, 'Business not found')

  const plan = await Plan.findById(planId)
  if (!plan) throw new HttpError(404, 'Plan not found')
  if (!plan.isActive) throw new HttpError(400, 'Plan is inactive')

  const start = options.subscriptionStart ? new Date(options.subscriptionStart) : new Date()
  const days = Number(plan.validity) || 365
  const end =
    options.subscriptionEnd != null
      ? new Date(options.subscriptionEnd)
      : new Date(start.getTime() + days * 86400000)

  business.planId = plan._id
  const tier = String(plan.name || '')
    .toUpperCase()
    .trim()
  business.plan = ['FREE', 'CORE', 'PRO', 'PREMIUM'].includes(tier) ? tier : 'PRO'
  business.subscriptionStatus = 'ACTIVE'
  business.subscriptionStart = start
  business.subscriptionEnd = end
  business.planExpiresAt = end
  await business.save()

  return business
}
