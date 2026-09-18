import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createAgentRuntime } from '../runtime.js'
import { createLLMRouter, FakeProvider } from '../llm/index.js'
import { startPreview, stopPreview, previewStatus } from '../preview/index.js'
import {
  executeBrowserTool,
  closeBrowserSession,
  runBrowserValidation,
  SKIPPED_MESSAGE,
  PASSED_MESSAGE,
} from '../browser/index.js'

const HTML = `<!doctype html>
<html>
  <body style="margin:0;background:#fff;color:#111">
    <header class="nav">
      <details class="nav-toggle"><summary>Menu</summary><nav><a href="#about">About</a></nav></details>
      <a href="#about">About</a>
    </header>
    <h1>Studio</h1>
    <a class="btn primary" href="#contact">Book</a>
    <section id="about">
      <form>
        <input id="name" />
        <select id="city"><option value="goa">Goa</option><option value="del">Delhi</option></select>
      </form>
    </section>
    <section id="contact">Contact</section>
  </body>
</html>`

function runtime() {
  return createAgentRuntime({
    llm: createLLMRouter({ providers: [new FakeProvider()] }),
  })
}

async function workspaceWithHtml(html = HTML) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-p5-'))
  await fs.writeFile(path.join(dir, 'index.html'), html)
  return dir
}

function ids(dir, projectId) {
  return { userId: 'user1', projectId, workspaceDir: dir, permission: 'execute' }
}

test('start_preview / preview_status / stop_preview use an isolated loopback server', async () => {
  const dir = await workspaceWithHtml()
  const projectId = `preview-${Date.now()}`
  const started = await startPreview({ projectId, workspaceDir: dir })
  try {
    assert.equal(started.ok, true, started.message)
    assert.match(started.url, /^http:\/\/127\.0\.0\.1:41\d{2}$/)
    const status = previewStatus({ projectId })
    assert.equal(status.running, true)
    assert.equal(status.url, started.url)
    const page = await fetch(started.url)
    const body = await page.text()
    assert.match(body, /Studio/)
  } finally {
    await stopPreview({ projectId })
    assert.equal(previewStatus({ projectId }).running, false)
  }
})

test('page loading, navigation, clicks, forms, and mobile menu drive Chromium', async () => {
  const dir = await workspaceWithHtml()
  const projectId = `tools-${Date.now()}`
  const preview = await startPreview({ projectId, workspaceDir: dir })
  assert.equal(preview.ok, true, preview.message)
  try {
    const opened = await executeBrowserTool({ tool: 'browser_open', projectId, url: preview.url })
    assert.equal(opened.success, true, opened.message)
    assert.equal(opened.ran, true)

    const nav = await executeBrowserTool({ tool: 'browser_click', projectId, selector: 'a[href="#about"]' })
    assert.equal(nav.success, true, nav.message)

    const click = await executeBrowserTool({ tool: 'browser_click', projectId, selector: 'a.btn' })
    assert.equal(click.success, true, click.message)

    const typed = await executeBrowserTool({
      tool: 'browser_type',
      projectId,
      selector: '#name',
      text: 'GetVia',
    })
    assert.equal(typed.success, true, typed.message)

    const selected = await executeBrowserTool({
      tool: 'browser_select',
      projectId,
      selector: '#city',
      value: 'goa',
    })
    assert.equal(selected.success, true, selected.message)

    const scrolled = await executeBrowserTool({ tool: 'browser_scroll', projectId, y: 400 })
    assert.equal(scrolled.success, true, scrolled.message)

    const menu = await executeBrowserTool({
      tool: 'browser_open',
      projectId,
      url: preview.url,
      width: 390,
      height: 844,
    })
    assert.equal(menu.success, true, menu.message)
    const toggled = await executeBrowserTool({
      tool: 'browser_click',
      projectId,
      selector: '.nav-toggle summary',
    })
    assert.equal(toggled.success, true, toggled.message)

    const shot = await executeBrowserTool({ tool: 'browser_screenshot', projectId, workspaceDir: dir, name: 'menu' })
    assert.equal(shot.success, true, shot.message)
    assert.ok((shot.bytes || shot.data?.bytes) > 500)

    const cons = await executeBrowserTool({ tool: 'browser_console', projectId })
    assert.equal(cons.success, true)
    assert.equal(cons.data.errors.length, 0)
  } finally {
    await closeBrowserSession(projectId)
    await stopPreview({ projectId })
  }
})

test('runtime validation captures load + behavior and only passes when Chromium ran', async () => {
  const dir = await workspaceWithHtml()
  const projectId = `qa-${Date.now()}`
  const preview = await startPreview({ projectId, workspaceDir: dir })
  try {
    const qa = await runBrowserValidation({ projectId, workspaceDir: dir, url: preview.url })
    assert.equal(qa.ran, true, qa.message)
    assert.equal(qa.skipped, false)
    assert.equal(qa.passed, true, JSON.stringify(qa.issues))
    assert.equal(qa.message, PASSED_MESSAGE)
    assert.ok(qa.steps.some((s) => s.tool === 'browser_open' && s.success))
    assert.ok(qa.steps.some((s) => s.tool === 'browser_click' && s.success))
    assert.ok(qa.steps.some((s) => s.tool === 'browser_scroll' && s.success))
    assert.ok(qa.steps.some((s) => s.tool === 'browser_console' && s.success))
    assert.ok(qa.steps.some((s) => s.tool === 'browser_network' && s.success))
  } finally {
    await closeBrowserSession(projectId)
    await stopPreview({ projectId })
  }
})

test('console errors fail browser QA', async () => {
  const html = HTML.replace('</body>', '<script>throw new Error("boom-console")</script></body>')
  const dir = await workspaceWithHtml(html)
  const projectId = `console-${Date.now()}`
  const preview = await startPreview({ projectId, workspaceDir: dir })
  try {
    const qa = await runBrowserValidation({ projectId, workspaceDir: dir, url: preview.url })
    assert.equal(qa.ran, true, qa.message)
    assert.equal(qa.passed, false)
    assert.ok(qa.issues.some((i) => i.type === 'console'))
    assert.notEqual(qa.message, PASSED_MESSAGE)
  } finally {
    await closeBrowserSession(projectId)
    await stopPreview({ projectId })
  }
})

test('broken network requests fail browser QA', async () => {
  const html = HTML.replace('</body>', '<img src="http://127.0.0.1:1/missing.png" alt="" /></body>')
  const dir = await workspaceWithHtml(html)
  const projectId = `net-${Date.now()}`
  const preview = await startPreview({ projectId, workspaceDir: dir })
  try {
    const qa = await runBrowserValidation({ projectId, workspaceDir: dir, url: preview.url })
    assert.equal(qa.ran, true, qa.message)
    assert.equal(qa.passed, false)
    assert.ok(qa.issues.some((i) => i.type === 'network'), JSON.stringify(qa.issues))
  } finally {
    await closeBrowserSession(projectId)
    await stopPreview({ projectId })
  }
})

test('Playwright opt-out is SKIPPED and never claimed as a pass', async () => {
  const previous = process.env.AI_SKIP_PLAYWRIGHT
  process.env.AI_SKIP_PLAYWRIGHT = '1'
  try {
    const qa = await runBrowserValidation({
      projectId: `skip-${Date.now()}`,
      url: 'http://127.0.0.1:4100/',
    })
    assert.equal(qa.ran, false)
    assert.equal(qa.skipped, true)
    assert.equal(qa.passed, false)
    assert.match(qa.message, /SKIPPED/)
    assert.notEqual(qa.message, PASSED_MESSAGE)
    assert.ok(!/Browser test passed/i.test(qa.message))
  } finally {
    if (previous == null) delete process.env.AI_SKIP_PLAYWRIGHT
    else process.env.AI_SKIP_PLAYWRIGHT = previous
  }
})

test('browser_open rejects non-loopback URLs', async () => {
  const opened = await executeBrowserTool({
    tool: 'browser_open',
    projectId: `ssrf-${Date.now()}`,
    url: 'http://example.com',
  })
  assert.equal(opened.success, false)
  assert.equal(opened.errorType, 'URL_REJECTED')
})

test('browser repair patches index.html after a console failure', async () => {
  const html = HTML.replace('</body>', '<script>throw new Error("boom-console")</script></body>')
  const dir = await workspaceWithHtml(html)
  const projectId = `repair-${Date.now()}`
  const rt = runtime()
  const ctx = ids(dir, projectId)
  const preview = await startPreview({ projectId, workspaceDir: dir })
  try {
    const qa = await runBrowserValidation({ projectId, workspaceDir: dir, url: preview.url })
    assert.equal(qa.ran, true, qa.message)
    assert.equal(qa.passed, false)
    const { repairBrowserFailure } = await import('../repair/index.js')
    const repaired = await repairBrowserFailure({ runtime: rt, ctx, qa, files: ['index.html'] })
    assert.equal(repaired.ok, true, JSON.stringify(repaired))
    assert.ok(repaired.patched.includes('index.html'))
    const next = await fs.readFile(path.join(dir, 'index.html'), 'utf8')
    assert.ok(!/throw new Error/.test(next))
  } finally {
    await closeBrowserSession(projectId)
    await stopPreview({ projectId })
  }
})

test('preview and browser tools are registered on the runtime', async () => {
  const rt = runtime()
  const dir = await workspaceWithHtml()
  const ctx = ids(dir, `reg-${Date.now()}`)
  const status = await rt.callTool('preview_status', {}, ctx)
  assert.equal(status.success, true)
  assert.equal(status.data.running, false)
  const names = rt.tools.list().map((t) => t.name)
  assert.ok(names.includes('start_preview'))
  assert.ok(names.includes('browser_open'))
  assert.ok(names.includes('browser_select'))
})
