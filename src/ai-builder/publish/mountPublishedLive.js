import path from 'node:path'
import fs from 'node:fs'
import express from 'express'
import { LIVE_PREFIX, publishRootDir } from '../publish/publishIsolatedLive.js'

function frameAncestorHeader() {
  const extra = String(process.env.CLIENT_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const ancestors = [
    "'self'",
    'http://localhost:5175',
    'http://127.0.0.1:5175',
    'https://business.getvia.in',
    'https://admin.getvia.in',
    'https://getvia.in',
    ...extra,
  ]
  return `frame-ancestors ${[...new Set(ancestors)].join(' ')}`
}

/**
 * Serve published isolated Vite dist builds at /ai-live/:siteId/
 * so the public profile can show the same React site as AI Builder.
 */
export function mountPublishedLiveSites(app) {
  const root = publishRootDir()
  try {
    fs.mkdirSync(root, { recursive: true })
  } catch {
    /* ignore */
  }

  app.use(`${LIVE_PREFIX}/:siteId`, (req, res, next) => {
    const siteId = String(req.params.siteId || '').replace(/[^a-fA-F0-9]/g, '')
    if (!siteId) {
      res.status(404).json({ ok: false, error: 'Not found' })
      return
    }
    const dir = path.join(root, siteId)
    if (!fs.existsSync(path.join(dir, 'index.html'))) {
      res.status(404).type('html').send(
        `<!doctype html><html><body style="font-family:system-ui;padding:2rem">
          <h1>Published site not found</h1>
          <p>Publish again from AI Builder to generate the live React site.</p>
        </body></html>`,
      )
      return
    }
    res.removeHeader('X-Frame-Options')
    res.setHeader('Content-Security-Policy', frameAncestorHeader())
    express.static(dir, {
      index: 'index.html',
      fallthrough: true,
      setHeaders(res) {
        res.setHeader('Content-Security-Policy', frameAncestorHeader())
        res.removeHeader('X-Frame-Options')
      },
    })(req, res, () => {
      res.sendFile(path.join(dir, 'index.html'))
    })
  })
}
