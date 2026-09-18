import { MAX_BROWSER_REPAIRS } from '../execution/index.js'
import { runBrowserValidation, SKIPPED_MESSAGE, closeBrowserSession } from '../browser/index.js'
import { repairBrowserFailure } from '../repair/index.js'
import fs from 'node:fs/promises'
import path from 'node:path'

async function hasReactEntry(workspaceDir) {
  try {
    await fs.access(path.join(workspaceDir, 'src/main.jsx'))
    return true
  } catch {
    return false
  }
}

export async function verifyInBrowser({ runtime, ctx, task, plan, go, record, runBuild }) {
  const started = await runtime.callTool('start_preview', {}, ctx)
  task.preview = started.data || started
  if (started.skipped || !started.success) {
    const browser = {
      ran: false,
      skipped: true,
      passed: false,
      status: 'SKIPPED',
      message: started.message || SKIPPED_MESSAGE,
    }
    task.browser = browser
    record(task, 'VERIFY', browser.message, { role: 'reviewer', detail: browser })
    return browser
  }
  if (started.data?.kind === 'static' && (await hasReactEntry(ctx.workspaceDir))) {
    const browser = {
      ran: false,
      skipped: true,
      passed: false,
      status: 'SKIPPED',
      message: `${SKIPPED_MESSAGE} Static preview cannot execute React/JSX; set PREVIEW_ENABLED=1 for Vite.`,
    }
    task.browser = browser
    record(task, 'VERIFY', browser.message, { role: 'reviewer', detail: browser })
    return browser
  }

  let browser = await runBrowserValidation({
    runtime,
    ctx,
    url: started.data.url,
    projectId: ctx.projectId,
    workspaceDir: ctx.workspaceDir,
  })
  task.browser = browser
  record(task, 'VERIFY', browser.message, { role: 'reviewer', detail: browser })

  let attempts = 0
  while (browser.ran && !browser.passed && attempts < MAX_BROWSER_REPAIRS) {
    if (!go('REPAIRING', { phase: 'REPAIR', role: 'debugger', message: `Browser repair ${attempts + 1}.` })) {
      return task.browser
    }
    const repaired = await repairBrowserFailure({ runtime, ctx, qa: browser, files: plan.files })
    attempts += 1
    task.repairAttempts += 1
    task.filesChanged = [...new Set([...task.filesChanged, ...repaired.patched])]
    record(task, 'REPAIR', repaired.ok ? `Browser patched ${repaired.patched.join(', ')}` : 'No browser repair patch', {
      role: 'debugger',
      detail: repaired,
    })
    if (!repaired.ok) break
    if (!go('BUILDING', { phase: 'OBSERVE', role: 'debugger', message: 'Rebuilding after browser repair.' })) return task.browser
    const build = await runBuild(runtime, ctx)
    task.build = build
    if (!build.ok) break
    await runtime.callTool('stop_preview', {}, ctx)
    await closeBrowserSession(ctx.projectId)
    const again = await runtime.callTool('start_preview', {}, ctx)
    if (!again.success) break
    if (!go('REVIEWING', { phase: 'VERIFY', role: 'reviewer', message: 'Retesting the preview.' })) return task.browser
    browser = await runBrowserValidation({
      runtime,
      ctx,
      url: again.data.url,
      projectId: ctx.projectId,
      workspaceDir: ctx.workspaceDir,
    })
    task.browser = browser
    task.preview = again.data
    record(task, 'VERIFY', browser.message, { role: 'reviewer', detail: browser })
  }

  return task.browser
}

export async function stopPreviewQuiet(runtime, ctx) {
  await closeBrowserSession(ctx.projectId).catch(() => {})
  await runtime.callTool('stop_preview', {}, ctx).catch(() => {})
}
