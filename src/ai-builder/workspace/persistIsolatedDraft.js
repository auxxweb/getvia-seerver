import fs from 'node:fs/promises'
import path from 'node:path'
import { commitVersion } from '../versions/versionService.js'
import { stampProjectOnState } from '../state/projectMeta.js'
import { ensureJsxRuntimeImports, repairWorkspaceJsx } from './fixJsxRuntime.js'
import { readCodexThreadId } from '../codex/workspaceContext.js'

export const ISOLATED_SNAPSHOT_FILES = [
  'src/data/business.json',
  'src/data/design.json',
  'src/App.jsx',
  'src/index.css',
  'src/design-system/tokens.js',
  'index.html',
]

export async function captureIsolatedSnapshot(workspaceDir) {
  const files = {}
  let business = null
  for (const rel of ISOLATED_SNAPSHOT_FILES) {
    try {
      const contents = await fs.readFile(path.join(workspaceDir, rel), 'utf8')
      if (contents.length > 400_000) continue
      files[rel] = contents
      if (rel === 'src/data/business.json') business = JSON.parse(contents)
    } catch {
      /* file may not exist yet */
    }
  }
  return {
    business,
    files,
    savedAt: new Date().toISOString(),
  }
}

export function applyBusinessToWebsiteState(state, business) {
  const plain =
    state && typeof state === 'object'
      ? JSON.parse(JSON.stringify(typeof state.toObject === 'function' ? state.toObject() : state))
      : {}
  const next = stampProjectOnState(plain)
  const hero = business?.hero || {}
  next.settings = {
    ...(next.settings || {}),
    hasAiDesign: true,
    businessName: business?.name || next.settings?.businessName || '',
  }
  next.theme = {
    ...(next.theme || {}),
    look: business?.look || next.theme?.look,
    colors: business?.colors && Object.keys(business.colors).length ? business.colors : next.theme?.colors,
  }
  next.content = next.content || {}
  next.content.landing = {
    ...(next.content.landing || {}),
    bannerTitle: hero.title || next.content.landing?.bannerTitle || business?.name || '',
    bannerDescription: hero.subtitle || next.content.landing?.bannerDescription || '',
    bannerCtaLabel: hero.primaryCta?.label || next.content.landing?.bannerCtaLabel || '',
    bannerCtaLink: hero.primaryCta?.href || next.content.landing?.bannerCtaLink || '#contact',
  }
  if (business?.about?.body) {
    next.content.landing.welcomeTitle = business.about.title || next.content.landing.welcomeTitle
    next.content.landing.welcomeDescription = business.about.body
  }
  if (Array.isArray(business?.sections) && business.sections.length) {
    next.sectionOrder = business.sections
    next.sectionVisibility = {
      ...(next.sectionVisibility || {}),
      ...Object.fromEntries(business.sections.map((id) => [id, true])),
    }
  }
  return next
}

export async function restoreIsolatedSnapshot(workspaceDir, snapshot) {
  const files = snapshot?.files && typeof snapshot.files === 'object' ? snapshot.files : {}
  const written = []
  for (const [rel, contents] of Object.entries(files)) {
    if (!ISOLATED_SNAPSHOT_FILES.includes(rel) || typeof contents !== 'string') continue
    const full = path.join(workspaceDir, rel)
    await fs.mkdir(path.dirname(full), { recursive: true })
    const next = /\.(jsx|js)$/.test(rel) ? ensureJsxRuntimeImports(contents) : contents
    await fs.writeFile(full, next, 'utf8')
    written.push(rel)
  }
  return { ok: written.length > 0, written }
}

export async function persistIsolatedDraft({
  site,
  draft,
  workspaceDir,
  userId,
  prompt = '',
  jobId = null,
  preview = null,
} = {}) {
  if (!draft || !workspaceDir) return { ok: false, skipped: true }
  await repairWorkspaceJsx(workspaceDir)
  const snapshot = await captureIsolatedSnapshot(workspaceDir)
  if (!snapshot.files['src/data/business.json'] && !snapshot.files['src/App.jsx']) {
    return { ok: false, skipped: true, code: 'NO_WORKSPACE_FILES' }
  }
  draft.isolatedSnapshot = snapshot
  draft.markModified?.('isolatedSnapshot')
  if (snapshot.business) {
    draft.websiteState = applyBusinessToWebsiteState(draft.websiteState, snapshot.business)
    draft.markModified?.('websiteState')
    draft.contentOverlay = draft.websiteState?.content
    draft.themeOverlay = draft.websiteState?.theme
  }
  draft.revisionNumber = Number(draft.revisionNumber || 1) + 1
  if (jobId) draft.lastJobId = jobId
  if (preview?.ok) {
    draft.isolatedPreviewUrl = preview.url || draft.isolatedPreviewUrl || ''
    draft.isolatedPreviewPort = preview.port ?? draft.isolatedPreviewPort ?? null
  }
  const threadId = await readCodexThreadId(workspaceDir)
  if (threadId) {
    draft.codexThreadId = threadId
    if (site && typeof site.save === 'function') {
      site.codexThreadId = threadId
      try {
        await site.save()
      } catch {
        /* website row may be a lean object */
      }
    }
  }
  await draft.save()
  let version = null
  if (site && userId) {
    try {
      version = await commitVersion({
        site,
        draft,
        userId,
        versionType: 'DRAFT',
        source: 'ai',
        prompt,
        changeSet: { isolated: true, files: Object.keys(snapshot.files), autoSaved: true },
      })
    } catch {
      version = null
    }
  }
  return {
    ok: true,
    revision: draft.revisionNumber,
    version,
    savedAt: snapshot.savedAt,
    files: Object.keys(snapshot.files),
  }
}
