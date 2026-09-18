export function reviewAgent({ build, preview, structural, visual, browser, accessibility, seo, implement } = {}) {
  const issues = []
  const buildPass = Boolean(build?.ok)
  const runtimePass = Boolean(preview?.ok) || Boolean(build?.skipped) || Boolean(preview?.skipped)
  const structuralPass = Boolean(structural?.approved)
  const visualPass = visual?.status === 'passed' || visual?.status === 'skipped'
  const visualSkipped = visual?.status === 'skipped' || browser?.status === 'skipped'
  const visualUnavailable = !visualSkipped && (visual?.status === 'unavailable' || browser?.status === 'unavailable')

  if (!implement?.ok && implement?.ok !== undefined) {
    issues.push({ severity: 'high', type: 'implement', description: implement.message || 'Implementation failed.' })
  }
  if (!buildPass) issues.push({ severity: 'high', type: 'build', description: build?.message || 'Build did not pass.' })
  if (!runtimePass && !visualUnavailable) {
    issues.push({ severity: 'high', type: 'runtime', description: preview?.message || 'Preview did not start.' })
  }
  if (!structuralPass) {
    issues.push(...(structural?.issues || []).filter((i) => i.severity === 'high'))
  }
  if (visualPass === false && !visualUnavailable) {
    issues.push(...(visual?.issues || []).filter((i) => i.severity === 'high'))
  }
  issues.push(...(accessibility?.issues || []).filter((i) => i.severity === 'high'))
  issues.push(...(seo?.issues || []).filter((i) => i.severity === 'high'))

  const allHardPass = buildPass && runtimePass && structuralPass && visualPass
  const approved = allHardPass && issues.length === 0
  return {
    approved,
    visualUnavailable,
    visualSkipped,
    buildPass,
    runtimePass,
    structuralPass,
    visualPass,
    issues,
    message: approved
      ? 'Review approved. Build, runtime, visual QA, and review all passed.'
      : visualUnavailable && buildPass && structuralPass
        ? 'Review cannot approve a visual pass: Playwright/browser QA was unavailable.'
        : `Review rejected: ${(issues[0] && issues[0].description) || 'required gates did not pass.'}`,
  }
}

export function completionMessage({ review, preview, failedStage, error }) {
  if (review?.approved) {
    if (review.visualSkipped) {
      return preview?.ok
        ? 'Build and live preview are ready. Browser checks need Playwright against the preview.'
        : 'Build passed. Preview was not started on this host.'
    }
    return preview?.ok
      ? 'Build, live preview, and browser checks passed.'
      : 'Build and browser checks passed. Preview was not started on this host.'
  }
  if (review?.visualUnavailable && review.buildPass && review.structuralPass) {
    return 'Build and structural checks passed. Browser/visual QA was unavailable, so this is not marked fully complete. Live files are ready; Chromium/Playwright must launch against the preview for a visual pass.'
  }
  return `Failed at ${failedStage || 'review'}: ${error || review?.message || 'required quality gates did not pass.'}`
}
