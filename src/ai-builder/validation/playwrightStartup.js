import { findChromiumExecutable, loadPlaywright, launchChromium, resolvePlaywrightBrowsersDir, shouldRunPlaywright } from './playwrightRuntime.js'

/** Log whether visual QA can run; does not block API startup. */
export async function logPlaywrightReadiness() {
  if (!shouldRunPlaywright()) {
    console.log('[ai-builder] visual QA disabled (PLAYWRIGHT_VALIDATION=0 or AI_SKIP_PLAYWRIGHT=1)')
    return { ok: true, enabled: false }
  }

  const browsersDir = resolvePlaywrightBrowsersDir()
  const exe = findChromiumExecutable(browsersDir)
  const loaded = await loadPlaywright()
  if (!loaded.ok) {
    console.warn(
      `[ai-builder] visual QA enabled but Playwright is missing. Run: cd server && npm run playwright:install`,
    )
    return { ok: false, enabled: true, code: loaded.code, message: loaded.message }
  }

  const launched = await launchChromium(loaded.playwright)
  if (launched.ok) {
    await launched.browser.close().catch(() => {})
    console.log(`[ai-builder] visual QA ready · Chromium at ${exe || browsersDir}`)
    return { ok: true, enabled: true, browsersDir, executable: exe }
  }

  console.warn(
    `[ai-builder] visual QA enabled but Chromium could not launch: ${launched.message} · Run: npx playwright install-deps chromium && npm run playwright:install`,
  )
  return { ok: false, enabled: true, code: launched.code, message: launched.message }
}
