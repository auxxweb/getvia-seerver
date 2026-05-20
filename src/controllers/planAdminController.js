import { Plan } from '../models/Plan.js'
import { Business } from '../models/Business.js'
import { HttpError } from '../middleware/errorHandler.js'
import {
  parseEntitlementsBody,
  assignPlanToBusiness,
} from '../services/planEntitlements.service.js'

function parseFeatures(input) {
  if (Array.isArray(input)) {
    return input.map((s) => String(s).trim()).filter(Boolean)
  }
  if (typeof input === 'string' && input.trim()) {
    return input
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

export async function createPlan(req, res, next) {
  try {
    const { name, price, validity, features, isActive, entitlements } = req.body
    if (!name || String(name).trim() === '') throw new HttpError(400, 'name is required')
    const priceNum = Number(price)
    if (!Number.isFinite(priceNum) || priceNum < 0) throw new HttpError(400, 'Invalid price')
    const days = Number(validity)
    if (!Number.isFinite(days) || days < 1) throw new HttpError(400, 'Invalid validity (days)')

    const plan = await Plan.create({
      name: String(name).trim(),
      price: priceNum,
      validity: Math.floor(days),
      features: parseFeatures(features),
      entitlements: parseEntitlementsBody(entitlements || req.body),
      isActive: isActive !== false,
      createdBy: req.user._id,
    })
    res.status(201).json({ ok: true, plan })
  } catch (e) {
    next(e)
  }
}

export async function updatePlan(req, res, next) {
  try {
    const { id } = req.params
    const plan = await Plan.findById(id)
    if (!plan) throw new HttpError(404, 'Plan not found')

    const { name, price, validity, features, isActive, entitlements } = req.body
    if (name !== undefined) plan.name = String(name).trim()
    if (price !== undefined) {
      const priceNum = Number(price)
      if (!Number.isFinite(priceNum) || priceNum < 0) throw new HttpError(400, 'Invalid price')
      plan.price = priceNum
    }
    if (validity !== undefined) {
      const days = Number(validity)
      if (!Number.isFinite(days) || days < 1) throw new HttpError(400, 'Invalid validity (days)')
      plan.validity = Math.floor(days)
    }
    if (features !== undefined) plan.features = parseFeatures(features)
    if (isActive !== undefined) plan.isActive = Boolean(isActive)
    if (entitlements !== undefined || req.body.galleryImageLimit !== undefined) {
      plan.entitlements = parseEntitlementsBody(entitlements || req.body)
    }

    await plan.save()
    res.json({ ok: true, plan })
  } catch (e) {
    next(e)
  }
}

export async function deletePlan(req, res, next) {
  try {
    const { id } = req.params
    const plan = await Plan.findById(id)
    if (!plan) throw new HttpError(404, 'Plan not found')

    const refCount = await Business.countDocuments({ planId: id })
    if (refCount > 0) {
      plan.isActive = false
      await plan.save()
      return res.json({
        ok: true,
        plan,
        message: 'Plan is in use; marked inactive instead of deleting.',
      })
    }

    await Plan.deleteOne({ _id: id })
    res.json({ ok: true, deleted: true })
  } catch (e) {
    next(e)
  }
}

export async function listAllPlans(req, res, next) {
  try {
    const plans = await Plan.find().sort({ createdAt: -1 }).lean()
    res.json({ ok: true, plans })
  } catch (e) {
    next(e)
  }
}

export async function assignPlanToBusinessAdmin(req, res, next) {
  try {
    const { id: businessId } = req.params
    const { planId, subscriptionStart, subscriptionEnd } = req.body
    if (!planId) throw new HttpError(400, 'planId is required')

    const business = await assignPlanToBusiness(businessId, planId, {
      subscriptionStart,
      subscriptionEnd,
    })
    await business.populate('planId')
    res.json({ ok: true, business })
  } catch (e) {
    next(e)
  }
}
