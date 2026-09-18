import fs from 'node:fs/promises'
import path from 'node:path'
import { shouldRunPlaywright, loadPlaywright, launchChromium } from '../validation/playwrightRuntime.js'
import { assertInsideWorkspace } from '../security/pathPolicy.js'
import { isBenignExternalResourceFailure, isTrustedResourceHost } from '../design-resources/allowlist.js'

const sessions = new Map()

function unavailable(tool, message, extra = {}) {
  return { success: false, tool, skipped: true, error: extra.code || 'BROWSER_UNAVAILABLE', output: message, ...extra }
}

async function sessionFor(projectId) {
  const key = String(projectId || '')
  const current = sessions.get(key)
  if (current?.page && !current.page.isClosed?.()) return current
  if (!shouldRunPlaywright()) {
    return { error: unavailable('browser_open', 'Browser tools are opted out (AI_SKIP_PLAYWRIGHT or PLAYWRIGHT_VALIDATION=0).') }
  }
  const loaded = await loadPlaywright()
  if (!loaded.ok) return { error: unavailable('browser_open', loaded.message, { code: loaded.code }) }
  const launched = await launchChromium(loaded.playwright)
  if (!launched.ok) return { error: unavailable('browser_open', launched.message, { code: launched.code }) }
  const page = await launched.browser.newPage()
  const consoleErrors = []
  const networkFailures = []
  const failedResponses = []
  page.on('pageerror', (err) => consoleErrors.push(String(err?.message || err)))
  page.on('response', (res) => {
    if (res.status() >= 400) failedResponses.push(res.url())
  })
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const loc = msg.location()?.url || ''
    const text = msg.text()
    if (isBenignExternalResourceFailure(text, loc)) return
    if (/Failed to load resource: the server responded with a status of 404/i.test(text)) {
      const localFails = failedResponses.filter((url) => !isTrustedResourceHost(url) && !/favicon|apple-touch-icon/i.test(url))
      if (!localFails.length) return
    }
    consoleErrors.push(loc ? `${text} ${loc}` : text)
  })
  page.on('requestfailed', (req) => {
    const url = req.url()
    if (/favicon|apple-touch-icon/i.test(url)) return
    if (isBenignExternalResourceFailure('failed', url) || isTrustedResourceHost(url)) return
    networkFailures.push(`${req.failure()?.errorText || 'failed'} ${req.url()}`.slice(0, 180))
  })
  const row = { browser: launched.browser, page, consoleErrors, networkFailures }
  sessions.set(key, row)
  return row
}

export async function closeBrowserSession(projectId) {
  const key = String(projectId || '')
  const current = sessions.get(key)
  if (!current) return { success: true, tool: 'browser_close', skipped: true, error: null }
  await current.browser?.close().catch(() => {})
  sessions.delete(key)
  return { success: true, tool: 'browser_close', error: null, output: 'Browser session closed.' }
}

async function saveShot(workspaceDir, buffer, name = 'tool') {
  if (!workspaceDir || !buffer?.length) return { bytes: buffer?.length || 0, path: null }
  const rel = `.getvia/qa/${name}-${Date.now()}.png`
  const inside = assertInsideWorkspace(workspaceDir, rel)
  if (!inside.ok) return { bytes: buffer.length, path: null }
  await fs.mkdir(path.dirname(inside.path), { recursive: true })
  await fs.writeFile(inside.path, buffer)
  return { bytes: buffer.length, path: rel }
}

export async function executeBrowserTool({
  tool,
  projectId,
  workspaceDir,
  url,
  selector,
  text,
  x,
  y,
  name,
} = {}) {
  if (tool === 'browser_close') return closeBrowserSession(projectId)
  const session = await sessionFor(projectId)
  if (session.error) return { ...session.error, tool }
  const { page, consoleErrors, networkFailures } = session
  try {
    if (tool === 'browser_open') {
      if (!url) return { success: false, tool, error: 'URL_REQUIRED', output: 'browser_open needs a preview URL.' }
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      return { success: true, tool, error: null, output: page.url() }
    }
    if (tool === 'browser_click') {
      if (!selector) return { success: false, tool, error: 'SELECTOR_REQUIRED', output: 'browser_click needs a selector.' }
      const loc = page.locator(selector)
      const visible = loc.locator('visible=true').first()
      const target = (await visible.count()) ? visible : loc.first()
      await target.click({ timeout: 8_000 })
      return { success: true, tool, error: null, output: `clicked ${selector}` }
    }
    if (tool === 'browser_type') {
      if (!selector) return { success: false, tool, error: 'SELECTOR_REQUIRED', output: 'browser_type needs a selector.' }
      const loc = page.locator(selector)
      const visible = loc.locator('visible=true').first()
      const target = (await visible.count()) ? visible : loc.first()
      await target.fill(String(text ?? ''), { timeout: 8_000 })
      return { success: true, tool, error: null, output: `typed into ${selector}` }
    }
    if (tool === 'browser_scroll') {
      await page.mouse.wheel(Number(x || 0), Number(y || 600))
      return { success: true, tool, error: null, output: 'scrolled' }
    }
    if (tool === 'browser_screenshot') {
      const buf = await page.screenshot({ type: 'png', fullPage: false })
      const saved = await saveShot(workspaceDir, buf, name || 'click')
      return { success: true, tool, error: null, output: `screenshot ${saved.bytes} bytes`, ...saved }
    }
    if (tool === 'inspect_console' || tool === 'browser_console') {
      return { success: true, tool, error: null, output: consoleErrors.slice(-20).join('\n') || 'No console errors.' }
    }
    if (tool === 'inspect_network' || tool === 'browser_network') {
      return { success: true, tool, error: null, output: networkFailures.slice(-20).join('\n') || 'No network failures.' }
    }
    return { success: false, tool, error: 'TOOL_NOT_IMPLEMENTED', output: `${tool} is not a browser tool.` }
  } catch (err) {
    return { success: false, tool, error: 'BROWSER_TOOL_FAILED', output: String(err?.message || err).slice(0, 240) }
  }
}

/** Live click-through: open → screenshot → click → type (if field exists) → screenshot. */
export async function clickThroughPreview({ projectId, previewUrl, workspaceDir } = {}) {
  const steps = []
  const open = await executeBrowserTool({ tool: 'browser_open', projectId, url: previewUrl })
  steps.push(open)
  if (!open.success) return { success: false, steps, error: open.error, output: open.output }

  const before = await executeBrowserTool({ tool: 'browser_screenshot', projectId, workspaceDir, name: 'before' })
  steps.push(before)

  const menu = await executeBrowserTool({
    tool: 'browser_click',
    projectId,
    selector: '.nav-toggle summary, details.nav-toggle summary, [aria-label="Menu"]',
  })
  if (menu.success) steps.push(menu)

  const link = await executeBrowserTool({
    tool: 'browser_click',
    projectId,
    selector: 'a[href="#contact"], a[href="#about"], header a, nav a, a',
  })
  steps.push(link)

  const typed = await executeBrowserTool({
    tool: 'browser_type',
    projectId,
    selector: 'input:not([type="hidden"]), textarea',
    text: 'Hello from GetVia QA',
  })
  if (typed.success) steps.push(typed)

  await executeBrowserTool({ tool: 'browser_scroll', projectId, y: 400 })
  const after = await executeBrowserTool({ tool: 'browser_screenshot', projectId, workspaceDir, name: 'after' })
  steps.push(after)

  const consoleOut = await executeBrowserTool({ tool: 'browser_console', projectId })
  steps.push(consoleOut)

  const failed = steps.filter((row) => !row.success && row.tool !== 'browser_type')
  return {
    success: failed.length === 0 && Boolean(before.success && after.success),
    steps,
    screenshots: steps.filter((row) => row.tool === 'browser_screenshot' && row.path).map((row) => row.path),
    output: failed[0]?.output || 'Click-through completed.',
  }
}
