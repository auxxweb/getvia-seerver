import { randomBytes } from 'node:crypto'
import { promises as dns } from 'node:dns'
import { WebsiteDomain } from '../../models/aiBuilderModels.js'
import { getCustomDomainCnameTarget } from '../constants.js'
import { aiError, AiErrorCode } from '../errors.js'

const HOST_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/

export function normalizeHostname(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '')
}

export async function connectDomain({ site, user, hostname: rawHost }) {
  const hostname = normalizeHostname(rawHost)
  if (!HOST_RE.test(hostname)) {
    throw aiError(400, 'Enter a valid domain such as www.yourbusiness.com', { code: AiErrorCode.DOMAIN_VERIFY_FAILED })
  }
  if (hostname.endsWith('getvia.in') || hostname === 'localhost') {
    throw aiError(400, 'That host is reserved by GetVia.', { code: AiErrorCode.DOMAIN_VERIFY_FAILED })
  }
  const existing = await WebsiteDomain.findOne({ hostname })
  if (existing && existing.businessId.toString() !== site.businessId.toString()) {
    throw aiError(409, 'This domain is already connected to another business.', { code: AiErrorCode.DOMAIN_IN_USE })
  }
  if (existing) return existing
  return WebsiteDomain.create({
    siteId: site._id,
    businessId: site.businessId,
    ownerId: user._id,
    hostname,
    status: 'PENDING',
    verificationToken: randomBytes(16).toString('hex'),
    cnameTarget: getCustomDomainCnameTarget(),
  })
}

export async function verifyDomain({ domain, site }) {
  if (domain.siteId.toString() !== site._id.toString()) {
    throw aiError(403, 'Not your domain.', { code: AiErrorCode.FORBIDDEN })
  }
  domain.status = 'VERIFYING'
  domain.lastCheckAt = new Date()
  await domain.save()
  const target = (domain.cnameTarget || getCustomDomainCnameTarget()).toLowerCase()
  try {
    const records = await dns.resolveCname(domain.hostname)
    const ok = (records || []).some((r) => String(r).replace(/\.$/, '').toLowerCase() === target)
    if (!ok) {
      domain.status = 'FAILED'
      domain.lastError = `CNAME must point to ${target}`
      await domain.save()
      throw aiError(400, `DNS is not ready yet. Point a CNAME to ${target}.`, {
        code: AiErrorCode.DOMAIN_VERIFY_FAILED,
        retryable: true,
        recoveryAction: 'RETRY',
      })
    }
    domain.status = 'VERIFIED'
    domain.httpsStatus = 'pending'
    domain.verifiedAt = new Date()
    domain.lastError = ''
    await domain.save()
    domain.status = 'ACTIVE'
    domain.httpsStatus = 'active'
    await domain.save()
    return domain
  } catch (err) {
    if (err.code === AiErrorCode.DOMAIN_VERIFY_FAILED) throw err
    domain.status = 'FAILED'
    domain.lastError = 'Could not look up DNS yet. Try again after the CNAME propagates.'
    await domain.save()
    throw aiError(400, domain.lastError, {
      code: AiErrorCode.DOMAIN_VERIFY_FAILED,
      retryable: true,
      recoveryAction: 'RETRY',
    })
  }
}

export async function disconnectDomain({ domain, site }) {
  if (domain.siteId.toString() !== site._id.toString()) {
    throw aiError(403, 'Not your domain.', { code: AiErrorCode.FORBIDDEN })
  }
  domain.status = 'DISCONNECTED'
  await domain.save()
  return domain
}

export async function findActiveDomainByHost(hostname) {
  const host = normalizeHostname(hostname)
  if (!host) return null
  return WebsiteDomain.findOne({ hostname: host, status: { $in: ['VERIFIED', 'ACTIVE'] } })
}
