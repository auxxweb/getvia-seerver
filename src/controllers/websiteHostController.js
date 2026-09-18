import { Website } from '../models/Website.js'
import { findActiveDomainByHost } from '../ai-builder/domains/domainService.js'
import { WebsiteVersion } from '../models/aiBuilderModels.js'

export async function getSiteByHost(req, res, next) {
  try {
    const host = String(req.query.host || req.get('x-forwarded-host') || req.hostname || '')
      .split(',')[0]
      .trim()
      .toLowerCase()
    if (!host) {
      res.json({ ok: true, matched: false })
      return
    }
    const domain = await findActiveDomainByHost(host)
    if (!domain) {
      res.json({ ok: true, matched: false })
      return
    }
    const site = await Website.findById(domain.siteId).lean()
    if (!site?.publishedVersionId) {
      res.json({ ok: true, matched: false })
      return
    }
    const version = await WebsiteVersion.findById(site.publishedVersionId).select('businessId versionNumber').lean()
    const { Business } = await import('../models/Business.js')
    const business = await Business.findById(domain.businessId).select('publicId').lean()
    res.json({
      ok: true,
      matched: true,
      businessId: String(domain.businessId),
      publicId: business?.publicId || '',
      siteId: String(site._id),
      versionNumber: version?.versionNumber,
    })
  } catch (e) {
    next(e)
  }
}
