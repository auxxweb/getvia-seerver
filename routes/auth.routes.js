import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from 'express'
import * as auth from '../controllers/auth.controller.js'
import { ensureFirebaseEnvDefaults, isFirebaseAdminConfigured } from '../config/firebase.js'

const r = Router()

/** Parent of routes/ — the server package root (where server.js and secrets/ live). */
const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Dev-only: proves which Node process and files the browser is hitting.
 * GET http://localhost:5000/api/auth/_diagnostics
 */
r.get('/_diagnostics', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ ok: false, error: 'Not found', apiBuild: 'getvia-api-v3' })
  }
  ensureFirebaseEnvDefaults()
  const rel = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() || null
  const abs = rel
    ? path.isAbsolute(rel)
      ? rel
      : path.join(serverDir, rel.replace(/^\.\//, ''))
    : path.join(serverDir, 'secrets', 'firebase-adminsdk.json')
  res.json({
    ok: true,
    apiBuild: 'getvia-api-v3',
    cwd: process.cwd(),
    serverDir,
    firebaseAdminConfigured: isFirebaseAdminConfigured(),
    FIREBASE_SERVICE_ACCOUNT_PATH: rel,
    serviceAccountAbsolutePath: abs,
    serviceAccountFileExists: existsSync(abs),
  })
})

r.post('/firebase-login', auth.firebaseLogin)
r.post('/register', auth.register)
r.post('/register-business', auth.registerBusinessOwner)
r.post('/login', auth.login)
r.post('/refresh', auth.refresh)
r.post('/logout', auth.logout)

export default r
