export const AI_WEBSITE_PROJECT = {
  framework: 'react',
  bundler: 'vite',
  renderer: 'AiGeneratedOnePage',
  layout: 'one-page',
}

export function projectMetaFrom(site, draft) {
  return {
    framework: site?.framework || AI_WEBSITE_PROJECT.framework,
    bundler: site?.bundler || AI_WEBSITE_PROJECT.bundler,
    renderer: site?.renderer || AI_WEBSITE_PROJECT.renderer,
    layout: draft?.websiteState?.layout || AI_WEBSITE_PROJECT.layout,
    engine: site?.engine || draft?.websiteState?.engine || 'ai',
    currentRevision: draft?.revisionNumber ?? null,
    publishedVersionId: site?.publishedVersionId ? String(site.publishedVersionId) : null,
    status: site?.status || 'draft',
  }
}

export function stampProjectOnState(state = {}) {
  const next = state && typeof state === 'object' ? state : {}
  next.engine = 'ai'
  next.layout = next.layout || AI_WEBSITE_PROJECT.layout
  next.templateId = next.templateId ?? null
  next.settings = {
    ...(next.settings || {}),
    framework: AI_WEBSITE_PROJECT.framework,
    bundler: AI_WEBSITE_PROJECT.bundler,
    renderer: AI_WEBSITE_PROJECT.renderer,
  }
  return next
}

export async function ensureWebsiteProjectMeta(site) {
  if (!site) return site
  let dirty = false
  if (site.framework !== AI_WEBSITE_PROJECT.framework) {
    site.framework = AI_WEBSITE_PROJECT.framework
    dirty = true
  }
  if (site.bundler !== AI_WEBSITE_PROJECT.bundler) {
    site.bundler = AI_WEBSITE_PROJECT.bundler
    dirty = true
  }
  if (site.renderer !== AI_WEBSITE_PROJECT.renderer) {
    site.renderer = AI_WEBSITE_PROJECT.renderer
    dirty = true
  }
  if (site.engine !== 'ai') {
    site.engine = 'ai'
    dirty = true
  }
  if (dirty) await site.save()
  return site
}
