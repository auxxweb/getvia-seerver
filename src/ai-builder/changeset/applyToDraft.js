import { AIChangeSet, WebsiteDraft, WebsiteValidation } from '../../models/aiBuilderModels.js'
import { executeChangeSet } from './engine.js'
import { aiError, AiErrorCode } from '../errors.js'
import { runWebsiteValidation, runPlaywrightValidation } from '../validation/runWebsiteValidation.js'
import { commitVersion } from '../versions/versionService.js'

export async function applyChangeSetToDraft({
  site,
  draft,
  operations,
  source = 'ai',
  jobId = null,
  prompt = '',
  userId,
  expectedRevision,
  commit = true,
}) {
  const revision = expectedRevision ?? draft.revisionNumber
  if (Number(revision) !== Number(draft.revisionNumber)) {
    throw aiError(409, 'This draft was updated elsewhere. Reload and try again.', {
      code: AiErrorCode.REVISION_CONFLICT,
      retryable: true,
      recoveryAction: 'RELOAD',
    })
  }
  const result = executeChangeSet(draft.websiteState, { operations, prompt })
  const realApplied = (result.applied || []).filter((row) => !row.skipped)
  if (!result.ok || !realApplied.length) {
    const changeDoc = await AIChangeSet.create({
      siteId: site._id,
      businessId: site.businessId,
      jobId,
      status: 'rejected',
      operations: result.operations || operations,
      expectedRevision: revision,
      schemaResult: { ok: false, errors: result.errors || [{ type: 'NO_CHANGE_APPLIED', message: 'No website fields changed.' }] },
      permissionResult: { ok: true },
      source,
    })
    return {
      ok: false,
      code: result.code || 'NO_CHANGE_APPLIED',
      errors: result.errors || [{ type: 'NO_CHANGE_APPLIED', message: 'No website fields changed.' }],
      applied: [],
      changeSetId: changeDoc._id,
    }
  }
  const changeDoc = await AIChangeSet.create({
    siteId: site._id,
    businessId: site.businessId,
    jobId,
    status: 'validated',
    operations: result.operations || operations,
    expectedRevision: revision,
    schemaResult: { ok: true, errors: [] },
    permissionResult: { ok: true },
    source,
  })
  draft.websiteState = result.state
  draft.markModified('websiteState')
  draft.contentOverlay = result.state.content
  draft.themeOverlay = result.state.theme
  draft.revisionNumber = draft.revisionNumber + 1
  draft.lastJobId = jobId
  await draft.save()
  changeDoc.status = 'applied'
  changeDoc.appliedRevision = draft.revisionNumber
  await changeDoc.save()

  let version = null
  if (commit) {
    version = await commitVersion({
      site,
      draft,
      userId,
      versionType: 'DRAFT',
      source,
      prompt,
      changeSet: { operations: result.operations, applied: result.applied },
    })
  }
  return {
    ok: true,
    draft,
    applied: result.applied,
    changeSetId: changeDoc._id,
    version,
  }
}

export async function validateAndStore({ site, draft, profile, jobId }) {
  const report = runWebsiteValidation(draft.websiteState, { profile })
  const browser = await runPlaywrightValidation(draft.websiteState)
  if (browser.ran) {
    // Static HTML overflow checks are advisory — they often false-positive on
    // AI drafts and should not hard-block publish in production.
    for (const err of browser.errors || []) {
      if (err?.type === 'HORIZONTAL_OVERFLOW') report.warnings.push(err)
      else report.errors.push(err)
    }
    report.passed = report.errors.length === 0
    report.skipped = (report.skipped || []).filter((item) => item.type !== 'PLAYWRIGHT_LAYOUT')
    report.playwright = { ran: true, message: browser.message }
  } else {
    report.skipped = (report.skipped || []).map((item) =>
      item.type === 'PLAYWRIGHT_LAYOUT'
        ? { ...item, message: browser.message, viewports: browser.viewports || item.viewports }
        : item,
    )
    report.playwright = { ran: false, skipped: true, message: browser.message }
  }
  const row = await WebsiteValidation.create({
    siteId: site._id,
    businessId: site.businessId,
    draftRevision: draft.revisionNumber,
    jobId,
    passed: report.passed,
    errorItems: report.errors,
    warningItems: report.warnings,
    skipped: report.skipped,
    viewports: report.viewports,
  })
  return { report, row }
}
