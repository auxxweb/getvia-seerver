import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { executeTool } from '../v2/toolExecutor.js'
import { executeBrowserTool, clickThroughPreview, closeBrowserSession } from '../v2/browserSession.js'

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

const HTML = `<!doctype html>
<html>
  <body style="margin:0;background:#fff;color:#111">
    <header class="nav">
      <details class="nav-toggle"><summary>Menu</summary><nav><a href="#about">About</a></nav></details>
      <a href="#about">About</a>
    </header>
    <h1>Studio</h1>
    <section id="about"><input id="name" /><textarea id="note"></textarea></section>
  </body>
</html>`

test('browser_open/click/type/screenshot tools actually drive Chromium', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-click-'))
  const { server, url } = await serve(HTML)
  const projectId = 'clicktools'
  try {
    const opened = await executeTool({
      tool: 'browser_open',
      userId: 'owner1',
      projectId,
      workspaceDir: dir,
      url,
    })
    assert.equal(opened.success, true, opened.output)

    const clicked = await executeTool({
      tool: 'browser_click',
      userId: 'owner1',
      projectId,
      workspaceDir: dir,
      selector: 'a[href="#about"]',
    })
    assert.equal(clicked.success, true, clicked.output)

    const typed = await executeTool({
      tool: 'browser_type',
      userId: 'owner1',
      projectId,
      workspaceDir: dir,
      selector: '#name',
      text: 'GetVia',
    })
    assert.equal(typed.success, true, typed.output)

    const shot = await executeTool({
      tool: 'browser_screenshot',
      userId: 'owner1',
      projectId,
      workspaceDir: dir,
    })
    assert.equal(shot.success, true, shot.output)
    assert.ok(shot.bytes > 1000)
    assert.ok(shot.path)
    const png = await fs.readFile(path.join(dir, shot.path))
    assert.ok(png.length > 1000)

    const through = await clickThroughPreview({ projectId: 'through1', previewUrl: url, workspaceDir: dir })
    assert.equal(through.success, true, JSON.stringify(through.steps.map((s) => ({ tool: s.tool, success: s.success, output: s.output }))))
    assert.ok(through.screenshots.length >= 1)
  } finally {
    await closeBrowserSession(projectId)
    await closeBrowserSession('through1')
    await new Promise((resolve) => server.close(resolve))
  }
})

test('browser_click reports a real failure instead of a fake pass', async () => {
  const { server, url } = await serve(HTML)
  try {
    await executeBrowserTool({ tool: 'browser_open', projectId: 'failclick', url })
    const clicked = await executeBrowserTool({
      tool: 'browser_click',
      projectId: 'failclick',
      selector: '#does-not-exist',
    })
    assert.equal(clicked.success, false)
    assert.equal(clicked.error, 'BROWSER_TOOL_FAILED')
  } finally {
    await closeBrowserSession('failclick')
    await new Promise((resolve) => server.close(resolve))
  }
})
