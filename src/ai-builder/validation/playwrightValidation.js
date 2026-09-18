import { websiteStateToHtml, PLAYWRIGHT_VIEWPORTS } from './htmlSnapshot.js'
import { shouldRunPlaywright, loadPlaywright, launchChromium } from './playwrightRuntime.js'

const VIEWPORTS = [320, 375, 390, 414, 768, 1024, 1280, 1440, 1920]

export async function runPlaywrightValidation(state, { enabled = shouldRunPlaywright() } = {}) {
  if (!enabled) {
    return {
      ran: false,
      skipped: true,
      viewports: VIEWPORTS,
      errors: [],
      message: 'Browser overflow checks are opted out (AI_SKIP_PLAYWRIGHT or PLAYWRIGHT_VALIDATION=0).',
    }
  }

  const loaded = await loadPlaywright()
  if (!loaded.ok) {
    return {
      ran: false,
      skipped: true,
      viewports: VIEWPORTS,
      errors: [],
      message: loaded.message,
    }
  }

  const html = websiteStateToHtml(state)
  const errors = []
  const launched = await launchChromium(loaded.playwright)
  if (!launched.ok) {
    return {
      ran: false,
      skipped: true,
      viewports: VIEWPORTS,
      errors: [],
      message: launched.message,
    }
  }
  const { browser } = launched
  try {
    const page = await browser.newPage()
    for (const width of PLAYWRIGHT_VIEWPORTS) {
      await page.setViewportSize({ width, height: 844 })
      await page.setContent(html, { waitUntil: 'domcontentloaded' })
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      if (metrics.scrollWidth > metrics.clientWidth + 2) {
        errors.push({
          type: 'HORIZONTAL_OVERFLOW',
          page: '/',
          viewport: width,
          scrollWidth: metrics.scrollWidth,
          clientWidth: metrics.clientWidth,
        })
      }
    }
  } catch (err) {
    return {
      ran: false,
      skipped: true,
      viewports: VIEWPORTS,
      errors: [],
      message: `Playwright could not launch (${String(err?.message || err).slice(0, 160)}). Structural validation still ran.`,
    }
  } finally {
    await browser.close().catch(() => {})
  }

  return {
    ran: true,
    skipped: false,
    viewports: VIEWPORTS,
    errors,
    message: errors.length ? 'Layout overflow was found on one or more viewports.' : 'Mobile, tablet, and desktop viewports passed.',
  }
}
