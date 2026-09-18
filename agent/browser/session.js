import fs from 'node:fs/promises'
import path from 'node:path'
import { assertInsideWorkspace } from '../../src/ai-builder/security/pathPolicy.js'
import { shouldRunPlaywright, loadPlaywright, launchChromium } from '../../src/ai-builder/validation/playwrightRuntime.js'
import { isBenignExternalResourceFailure, isTrustedResourceHost } from '../../src/ai-builder/design-resources/allowlist.js'

export const SKIPPED_MESSAGE = 'Browser validation: SKIPPED'
export const PASSED_MESSAGE = 'Browser QA passed.'

const sessions = new Map()

export function assertLoopbackUrl(url) {
  try {
    const parsed = new URL(String(url || ''))
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
      return { ok: false, message: 'Browser may only open 127.0.0.1 preview URLs.' }
    }
    return { ok: true, url: parsed.toString() }
  } catch {
    return { ok: false, message: 'Invalid preview URL.' }
  }
}

export function skippedBrowser(tool, extra = {}) {
  return {
    success: false,
    skipped: true,
    ran: false,
    tool,
    errorType: extra.code || 'BROWSER_SKIPPED',
    message: extra.message || SKIPPED_MESSAGE,
    data: { ran: false, status: 'SKIPPED', message: extra.message || SKIPPED_MESSAGE },
  }
}

async function ensureSession(projectId) {
  const key = String(projectId || '')
  const current = sessions.get(key)
  if (current?.page && !current.page.isClosed?.()) return { ok: true, session: current }
  if (!shouldRunPlaywright()) {
    return { ok: false, skipped: true, code: 'BROWSER_SKIPPED', message: SKIPPED_MESSAGE }
  }
  const loaded = await loadPlaywright()
  if (!loaded.ok) return { ok: false, skipped: true, code: loaded.code, message: `${SKIPPED_MESSAGE} (${loaded.message})` }
  const launched = await launchChromium(loaded.playwright)
  if (!launched.ok) return { ok: false, skipped: true, code: launched.code, message: `${SKIPPED_MESSAGE} (${launched.message})` }
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
    networkFailures.push(`${req.failure()?.errorText || 'failed'} ${url}`.slice(0, 180))
  })
  const session = { browser: launched.browser, page, consoleErrors, networkFailures }
  sessions.set(key, session)
  return { ok: true, session }
}

export async function closeBrowserSession(projectId) {
  const key = String(projectId || '')
  const current = sessions.get(key)
  if (!current) return { success: true, skipped: true, tool: 'browser_close', message: 'No browser session.' }
  await current.browser?.close().catch(() => {})
  sessions.delete(key)
  return { success: true, tool: 'browser_close', message: 'Browser session closed.' }
}

async function saveShot(workspaceDir, buffer, name = 'qa') {
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
  value,
  x,
  y,
  name,
  width,
  height,
} = {}) {
  if (tool === 'browser_close') return closeBrowserSession(projectId)
  if (tool === 'browser_open') {
    const allowed = assertLoopbackUrl(url)
    if (!allowed.ok) return { success: false, tool, errorType: 'URL_REJECTED', message: allowed.message }
  }
  const ready = await ensureSession(projectId)
  if (!ready.ok) return skippedBrowser(tool, ready)
  const { page, consoleErrors, networkFailures } = ready.session
  try {
    if (tool === 'browser_open') {
      const allowed = assertLoopbackUrl(url)
      if (!allowed.ok) return { success: false, tool, errorType: 'URL_REJECTED', message: allowed.message }
      if (width && height) await page.setViewportSize({ width, height })
      await page.goto(allowed.url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await page.waitForLoadState('load', { timeout: 8_000 }).catch(() => {})
      await new Promise((resolve) => setTimeout(resolve, 400))
      return { success: true, tool, ran: true, data: { url: page.url() }, message: page.url() }
    }
    if (tool === 'browser_click') {
      if (!selector) return { success: false, tool, errorType: 'SELECTOR_REQUIRED', message: 'browser_click needs a selector.' }
      const loc = page.locator(selector)
      const visible = loc.locator('visible=true').first()
      const target = (await visible.count()) ? visible : loc.first()
      await target.click({ timeout: 8_000 })
      return { success: true, tool, ran: true, message: `clicked ${selector}` }
    }
    if (tool === 'browser_type') {
      if (!selector) return { success: false, tool, errorType: 'SELECTOR_REQUIRED', message: 'browser_type needs a selector.' }
      const loc = page.locator(selector)
      const visible = loc.locator('visible=true').first()
      const target = (await visible.count()) ? visible : loc.first()
      await target.fill(String(text ?? ''), { timeout: 8_000 })
      return { success: true, tool, ran: true, message: `typed into ${selector}` }
    }
    if (tool === 'browser_select') {
      if (!selector) return { success: false, tool, errorType: 'SELECTOR_REQUIRED', message: 'browser_select needs a selector.' }
      await page.selectOption(selector, String(value ?? ''), { timeout: 8_000 })
      return { success: true, tool, ran: true, message: `selected ${value} in ${selector}` }
    }
    if (tool === 'browser_scroll') {
      await page.mouse.wheel(Number(x || 0), Number(y || 600))
      return { success: true, tool, ran: true, message: 'scrolled' }
    }
    if (tool === 'browser_screenshot') {
      const buf = await page.screenshot({ type: 'png', fullPage: false })
      const saved = await saveShot(workspaceDir, buf, name || 'shot')
      return { success: true, tool, ran: true, data: saved, message: `screenshot ${saved.bytes} bytes`, ...saved }
    }
    if (tool === 'browser_console') {
      return {
        success: true,
        tool,
        ran: true,
        data: { errors: consoleErrors.slice(-20) },
        message: consoleErrors.length ? consoleErrors.slice(-20).join('\n') : 'No console errors.',
      }
    }
    if (tool === 'browser_network') {
      return {
        success: true,
        tool,
        ran: true,
        data: { failures: networkFailures.slice(-20) },
        message: networkFailures.length ? networkFailures.slice(-20).join('\n') : 'No network failures.',
      }
    }
    return { success: false, tool, errorType: 'TOOL_NOT_IMPLEMENTED', message: `${tool} is not a browser tool.` }
  } catch (err) {
    return {
      success: false,
      tool,
      ran: true,
      errorType: 'BROWSER_TOOL_FAILED',
      message: String(err?.message || err).slice(0, 240),
    }
  }
}
