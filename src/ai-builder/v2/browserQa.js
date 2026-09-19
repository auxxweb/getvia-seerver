import fs from 'node:fs/promises'
import path from 'node:path'
import { shouldRunPlaywright, loadPlaywright, launchChromium } from '../validation/playwrightRuntime.js'
import { assertInsideWorkspace } from '../security/pathPolicy.js'
import { clickThroughPreview, closeBrowserSession } from './browserSession.js'
import { isBenignExternalResourceFailure, isTrustedResourceHost } from '../design-resources/allowlist.js'

export const QA_VIEWPORTS = [
  { width: 360, height: 800, name: 'mobile' },
  { width: 390, height: 844, name: 'mobile-lg' },
  { width: 768, height: 1024, name: 'tablet' },
  { width: 1280, height: 800, name: 'desktop' },
]

const FAST_QA_VIEWPORTS = [
  { width: 1280, height: 800, name: 'desktop' },
]

const FULL_FAST_QA_VIEWPORTS = [
  { width: 390, height: 844, name: 'mobile-lg' },
  { width: 1280, height: 800, name: 'desktop' },
]

export function isBenignConsole(text) {
  const value = String(text || '')
  if (
    /unique ["']key["'] prop|Each child in a list should have a unique|was passed a child from App|Download the React DevTools|Failed to load resource:.*favicon|net::ERR_ABORTED|WebSocket connection to|\[vite\] (connected|connecting)/i.test(
      value,
    )
  ) {
    return true
  }
  return isBenignExternalResourceFailure(value) || isTrustedResourceHost(value)
}

function unavailable(message, extra = {}) {
  return {
    ran: false,
    skipped: true,
    status: 'unavailable',
    approved: false,
    issues: [],
    screenshots: [],
    viewports: QA_VIEWPORTS,
    message,
    ...extra,
  }
}

function skipped(message, extra = {}) {
  return {
    ran: false,
    skipped: true,
    status: 'skipped',
    approved: true,
    issues: [],
    screenshots: [],
    viewports: QA_VIEWPORTS,
    message,
    ...extra,
  }
}

async function inspectDom() {
  const issues = []
  const doc = document.documentElement
  if (doc.scrollWidth > doc.clientWidth + 24) {
    issues.push({
      severity: 'high',
      type: 'overflow',
      description: `Horizontal overflow (${doc.scrollWidth}px > ${doc.clientWidth}px)`,
    })
  }
  const h1 = document.querySelector('h1')
  if (!h1 || !String(h1.textContent || '').trim()) {
    issues.push({ severity: 'high', type: 'typography', description: 'Main H1 is missing or empty' })
  }
  const nav = document.querySelector('header, .nav, nav')
  if (!nav) {
    issues.push({ severity: 'high', type: 'layout', description: 'No header/navigation landmark found' })
  }
  for (const img of Array.from(document.images || [])) {
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) {
      issues.push({
        severity: 'high',
        type: 'image',
        description: `Broken image ${String(img.getAttribute('src') || '').slice(0, 80)}`,
      })
    }
  }
  for (const el of document.querySelectorAll('h1, .hero, .nav, header, .section')) {
    const box = el.getBoundingClientRect()
    if (box.width > window.innerWidth + 24) {
      issues.push({
        severity: 'high',
        type: 'overflow',
        description: `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} overflows the viewport`,
      })
    }
  }
  const styles = getComputedStyle(document.body)
  const bg = styles.backgroundColor
  const fg = styles.color
  if (bg && fg && bg === fg) {
    issues.push({ severity: 'high', type: 'contrast', description: 'Body text color matches background' })
  }
  return issues
}

async function saveScreenshot(workspaceDir, name, buffer) {
  if (!workspaceDir || !buffer?.length) return { viewport: name, bytes: buffer?.length || 0, path: null }
  const rel = `.getvia/qa/${name}.png`
  const inside = assertInsideWorkspace(workspaceDir, rel)
  if (!inside.ok) return { viewport: name, bytes: buffer.length, path: null }
  await fs.mkdir(path.dirname(inside.path), { recursive: true })
  await fs.writeFile(inside.path, buffer)
  return { viewport: name, bytes: buffer.length, path: rel }
}

export async function browserQa({
  previewUrl,
  workspaceDir,
  enabled = shouldRunPlaywright(),
  fast = false,
  captureScreenshots = !fast,
} = {}) {
  if (!previewUrl) {
    return unavailable('No preview URL to open in the browser.')
  }
  if (!enabled) {
    return skipped('Browser QA skipped on this server (PLAYWRIGHT_VALIDATION=0 or AI_SKIP_PLAYWRIGHT=1).')
  }

  const loaded = await loadPlaywright()
  if (!loaded.ok) return unavailable(loaded.message, { code: loaded.code })

  const launched = await launchChromium(loaded.playwright)
  if (!launched.ok) return unavailable(launched.message, { code: launched.code })

  const issues = []
  const screenshots = []
  const consoleErrors = []
  const networkFailures = []
  let primaryScreenshot = null
  const { browser } = launched
  let page
  try {
    page = await browser.newPage()
    page.on('pageerror', (err) => consoleErrors.push(String(err?.message || err)))
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      const loc = msg.location()?.url || ''
      const text = loc ? `${msg.text()} ${loc}` : msg.text()
      if (isBenignConsole(text) || isBenignExternalResourceFailure(msg.text(), loc)) return
      consoleErrors.push(text)
    })
    page.on('requestfailed', (req) => {
      const url = req.url()
      if (/favicon|apple-touch-icon/i.test(url)) return
      if (isTrustedResourceHost(url) || isBenignExternalResourceFailure('failed', url)) return
      networkFailures.push(`${req.failure()?.errorText || 'failed'} ${url}`.slice(0, 180))
    })

    const viewports = fast ? (captureScreenshots ? FULL_FAST_QA_VIEWPORTS : FAST_QA_VIEWPORTS) : QA_VIEWPORTS
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await new Promise((resolve) => setTimeout(resolve, fast && !captureScreenshots ? 150 : 250))
      const found = await page.evaluate(inspectDom)
      for (const issue of found) {
        issues.push({ ...issue, viewport: `${vp.width}x${vp.height}`, target: issue.target || 'src/App.jsx' })
      }
      if (!fast && vp.width <= 390) {
        const toggle = page.locator('.nav-toggle summary, .nav-toggle, button.menu, [aria-label="Menu"]')
        if ((await toggle.count()) > 0) {
          try {
            await toggle.first().click({ timeout: 3_000 })
            await new Promise((resolve) => setTimeout(resolve, 150))
            const opened = await page.locator('details.nav-toggle[open], .nav-toggle[open]').count()
            const links = await page.locator('.nav-toggle nav a, .nav-toggle a').count()
            if (!opened && !links) {
              issues.push({
                severity: 'high',
                type: 'nav',
                description: 'Mobile menu did not reveal navigation links',
                viewport: `${vp.width}x${vp.height}`,
                target: 'src/App.jsx',
              })
            }
          } catch (err) {
            issues.push({
              severity: 'high',
              type: 'nav',
              description: `Mobile menu could not be opened (${String(err?.message || err).slice(0, 120)})`,
              viewport: `${vp.width}x${vp.height}`,
              target: 'src/App.jsx',
            })
          }
        }
      }
      if (captureScreenshots) {
        try {
          const buf = await page.screenshot({ type: 'png', fullPage: false })
          if (vp.name === 'mobile') primaryScreenshot = buf
          screenshots.push(await saveScreenshot(workspaceDir, `${vp.name}-${vp.width}x${vp.height}`, buf))
        } catch {
          /* screenshot optional */
        }
      }
    }

    for (const text of consoleErrors.slice(0, 8)) {
      if (isBenignConsole(text)) continue
      issues.push({ severity: 'high', type: 'runtime', description: `Console: ${text}`, target: 'src/App.jsx' })
    }
  } catch (err) {
    return unavailable(`Browser could not open preview (${String(err?.message || err).slice(0, 180)}).`)
  } finally {
    await browser.close().catch(() => {})
  }

  const clickId = `click-${String(previewUrl).replace(/[^a-z0-9]+/gi, '').slice(-24) || 'qa'}`
  let clickThrough = { skipped: true }
  if (!fast) {
    try {
      clickThrough = await clickThroughPreview({ projectId: clickId, previewUrl, workspaceDir })
      if (!clickThrough.success) {
        issues.push({
          severity: 'medium',
          type: 'nav',
          description: clickThrough.output || 'Click-through did not complete.',
          target: 'src/App.jsx',
        })
      }
    } finally {
      await closeBrowserSession(clickId)
    }
  }

  const high = issues.filter((i) => i.severity === 'high')
  return {
    ran: true,
    skipped: false,
    status: high.length ? 'failed' : 'passed',
    approved: high.length === 0,
    issues,
    screenshots,
    primaryScreenshot,
    console: consoleErrors.slice(0, 12),
    network: networkFailures.slice(0, 12),
    viewports: QA_VIEWPORTS,
    clickThrough,
    message: high.length ? 'Browser QA found layout/runtime issues.' : 'Browser QA passed on configured viewports.',
  }
}
