import { WebsiteVersion } from '../../models/aiBuilderModels.js'
import { AI_WEBSITE_PROJECT } from '../state/projectMeta.js'

export async function nextVersionNumber(siteId) {
  const last = await WebsiteVersion.findOne({ siteId }).sort({ versionNumber: -1 }).select('versionNumber').lean()
  return (last?.versionNumber || 0) + 1
}

export async function commitVersion({
  site,
  draft,
  userId,
  versionType = 'DRAFT',
  source = 'ai',
  prompt = '',
  changeSet = null,
  parentVersionId = null,
  idempotencyKey = '',
}) {
  if (idempotencyKey) {
    const existing = await WebsiteVersion.findOne({ siteId: site._id, idempotencyKey })
    if (existing) return existing
  }
  const versionNumber = await nextVersionNumber(site._id)
  const snapshot = {
    websiteState: draft.websiteState,
    theme: draft.websiteState?.theme,
    content: draft.websiteState?.content,
    seo: draft.websiteState?.seo,
    functionality: draft.websiteState?.functionality,
    templateId: draft.websiteState?.templateId,
    assetRefs: draft.websiteState?.assetRefs,
    revisionNumber: draft.revisionNumber,
    sourceSnapshot: {
      framework: site.framework || AI_WEBSITE_PROJECT.framework,
      bundler: site.bundler || AI_WEBSITE_PROJECT.bundler,
      renderer: site.renderer || AI_WEBSITE_PROJECT.renderer,
      layout: draft.websiteState?.layout || AI_WEBSITE_PROJECT.layout,
    },
    capturedAt: new Date().toISOString(),
    isolated: draft.isolatedSnapshot || null,
  }
  return WebsiteVersion.create({
    siteId: site._id,
    businessId: site.businessId,
    ownerId: site.ownerId,
    versionNumber,
    parentVersionId: parentVersionId || site.publishedVersionId || null,
    versionType,
    snapshot,
    changeSet,
    changedBy: userId,
    source,
    prompt: String(prompt || '').slice(0, 4000),
    idempotencyKey: idempotencyKey || '',
  })
}

export function friendlyDiff(fromSnap = {}, toSnap = {}) {
  const changes = []
  const a = fromSnap.websiteState || fromSnap
  const b = toSnap.websiteState || toSnap
  if ((a.templateId || fromSnap.templateId) !== (b.templateId || toSnap.templateId)) {
    changes.push({ field: 'template', from: a.templateId, to: b.templateId, summary: 'Template changed' })
  }
  const aHero = a.content?.landing?.bannerTitle
  const bHero = b.content?.landing?.bannerTitle
  if (aHero !== bHero) changes.push({ field: 'hero.heading', from: aHero, to: bHero, summary: 'Hero heading changed' })
  const aImg = a.content?.landing?.bannerImageUrl
  const bImg = b.content?.landing?.bannerImageUrl
  if (aImg !== bImg) changes.push({ field: 'hero.image', summary: 'Hero image changed' })
  const aPrimary = a.theme?.colors?.brandPrimary
  const bPrimary = b.theme?.colors?.brandPrimary
  if (aPrimary !== bPrimary) {
    changes.push({ field: 'theme.primary', from: aPrimary, to: bPrimary, summary: 'Primary color changed' })
  }
  const aSvc = (a.content?.coreServices?.items || []).map((i) => i.title).join('|')
  const bSvc = (b.content?.coreServices?.items || []).map((i) => i.title).join('|')
  if (aSvc !== bSvc) changes.push({ field: 'services.order', summary: 'Services reordered or updated' })
  return changes
}
