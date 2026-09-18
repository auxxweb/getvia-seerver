import { executeBrowserTool, closeBrowserSession, SKIPPED_MESSAGE, PASSED_MESSAGE } from './session.js'

function skippedResult(source = {}) {
  return {
    ran: false,
    skipped: true,
    passed: false,
    status: 'SKIPPED',
    message: source.message || SKIPPED_MESSAGE,
    steps: source.steps || [],
    console: [],
    network: [],
    screenshots: [],
    issues: [],
  }
}

function missingTarget(result) {
  return !result.success && /Timeout|waiting for locator|strict mode/i.test(result.message || '')
}

function fail(issues, steps, extra = {}) {
  return {
    ran: true,
    skipped: false,
    passed: false,
    status: 'failed',
    message: issues[0]?.description || extra.message || 'Browser QA failed.',
    issues,
    steps,
    screenshots: extra.screenshots || [],
    console: extra.console || [],
    network: extra.network || [],
  }
}

export async function runBrowserValidation({
  projectId,
  workspaceDir,
  url,
  runtime,
  ctx,
} = {}) {
  const steps = []
  const call = async (tool, input = {}) => {
    const result = runtime
      ? await runtime.callTool(tool, input, ctx)
      : await executeBrowserTool({ tool, projectId, workspaceDir, ...input })
    steps.push({
      tool,
      success: result.success,
      skipped: Boolean(result.skipped),
      message: result.message,
      data: result.data || null,
    })
    return result
  }

  if (!url) return skippedResult({ message: `${SKIPPED_MESSAGE} (no preview URL)` })

  const opened = await call('browser_open', { url, width: 1280, height: 800 })
  if (opened.skipped || opened.errorType === 'BROWSER_SKIPPED') {
    await closeBrowserSession(projectId)
    return skippedResult({ ...opened, steps })
  }
  if (!opened.success) {
    await closeBrowserSession(projectId)
    return fail([{ type: 'load', description: opened.message || 'Page failed to load.' }], steps)
  }

  const issues = []
  const shot = await call('browser_screenshot', { name: 'desktop' })
  const screenshots = shot.success && (shot.path || shot.data?.path) ? [shot.path || shot.data.path] : []

  const nav = await call('browser_click', { selector: 'a[href="#about"], a[href="#contact"], header a, nav a' })
  if (!nav.success && !missingTarget(nav)) issues.push({ type: 'navigation', description: nav.message || 'Navigation click failed.' })

  const button = await call('browser_click', { selector: 'a.btn, button, .btn' })
  if (!button.success && !missingTarget(button)) issues.push({ type: 'click', description: button.message || 'Button click failed.' })

  const typed = await call('browser_type', { selector: 'input:not([type="hidden"]), textarea', text: 'GetVia QA' })
  if (!typed.success && !missingTarget(typed)) issues.push({ type: 'form', description: typed.message })

  const selected = await call('browser_select', { selector: 'select', value: 'goa' })
  if (!selected.success && !missingTarget(selected)) issues.push({ type: 'form', description: selected.message })

  await call('browser_scroll', { y: 400 })
  await new Promise((resolve) => setTimeout(resolve, 400))

  const mobileOpen = await call('browser_open', { url, width: 390, height: 844 })
  if (mobileOpen.success) {
    const menu = await call('browser_click', { selector: '.nav-toggle summary, details.nav-toggle summary, [aria-label="Menu"]' })
    if (menu.success) {
      const shotM = await call('browser_screenshot', { name: 'mobile-menu' })
      if (shotM.path || shotM.data?.path) screenshots.push(shotM.path || shotM.data.path)
    } else if (!missingTarget(menu)) {
      issues.push({ type: 'nav', description: menu.message || 'Mobile menu click failed.' })
    }
  }

  const cons = await call('browser_console')
  const consoleErrors = cons.data?.errors || (cons.message && cons.message !== 'No console errors.' ? [cons.message] : [])
  for (const text of consoleErrors) {
    issues.push({ type: 'console', description: `Console: ${text}` })
  }

  const net = await call('browser_network')
  const networkFailures = net.data?.failures || (net.message && net.message !== 'No network failures.' ? [net.message] : [])
  for (const text of networkFailures) {
    issues.push({ type: 'network', description: `Network: ${text}` })
  }

  await closeBrowserSession(projectId)

  if (issues.length) return fail(issues, steps, { screenshots, console: consoleErrors, network: networkFailures })
  return {
    ran: true,
    skipped: false,
    passed: true,
    status: 'passed',
    message: PASSED_MESSAGE,
    issues: [],
    steps,
    screenshots,
    console: [],
    network: [],
  }
}

export { SKIPPED_MESSAGE, PASSED_MESSAGE }
