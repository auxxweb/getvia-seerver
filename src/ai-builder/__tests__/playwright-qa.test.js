import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import { browserQa, isBenignConsole } from '../v2/browserQa.js'
import { visualQa } from '../v2/visualQa.js'
import { shouldRunPlaywright } from '../validation/playwrightRuntime.js'

function serve(html) {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(html)
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ server, url: `http://127.0.0.1:${port}/` })
    })
  })
}

test('Playwright visual QA is enabled by default', () => {
  const previous = process.env.AI_SKIP_PLAYWRIGHT
  delete process.env.AI_SKIP_PLAYWRIGHT
  assert.equal(shouldRunPlaywright(), true)
  if (previous != null) process.env.AI_SKIP_PLAYWRIGHT = previous
})

test('React unique-key console noise does not fail visual QA', () => {
  assert.equal(isBenignConsole('Each child in a list should have a unique "key" prop. Check the render method of `div`.'), true)
  assert.equal(isBenignConsole('Uncaught ReferenceError: React is not defined'), false)
})

test('browser QA opens Chromium, screenshots viewports, and can pass', async () => {
  const { server, url } = await serve(`<!doctype html>
<html>
  <body style="background:#fff;color:#111;margin:0">
    <header class="nav"><a href="#about">About</a></header>
    <h1>Fashion That Speaks Her Style.</h1>
    <section class="section" id="about"><p>Hello</p></section>
  </body>
</html>`)
  try {
    const browser = await browserQa({ previewUrl: url })
    assert.equal(browser.ran, true, browser.message)
    assert.equal(browser.skipped, false)
    assert.ok(browser.screenshots.length >= 4)
    const visual = visualQa({
      browser,
      structural: { approved: true, issues: [] },
      spec: { look: 'modern' },
    })
    assert.equal(visual.status, 'passed', JSON.stringify(browser.issues))
    assert.equal(visual.approved, true)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('browser QA fails when the mobile layout overflows', async () => {
  const { server, url } = await serve(`<!doctype html>
<html>
  <body style="background:#fff;color:#111;margin:0">
    <header class="nav"><span>Nav</span></header>
    <h1>Wide</h1>
    <div style="width:1600px;height:40px;background:#000">overflow</div>
  </body>
</html>`)
  try {
    const browser = await browserQa({ previewUrl: url })
    assert.equal(browser.ran, true, browser.message)
    assert.equal(browser.approved, false)
    assert.ok(browser.issues.some((issue) => issue.type === 'overflow'))
    const visual = visualQa({ browser, structural: { approved: true, issues: [] } })
    assert.equal(visual.status, 'failed')
    assert.equal(visual.approved, false)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
