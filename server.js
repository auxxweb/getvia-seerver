import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import './bootstrap-env.js'
import { validateEnv } from './src/config/validateEnv.js'
import { connectDb } from './config/db.js'
import { createApp } from './app.js'
import { startAnalyticsCronJobs } from './src/jobs/analyticsCron.js'
import { isFirebaseAdminConfigured } from './config/firebase.js'

validateEnv()

const thisServerDir = path.dirname(fileURLToPath(import.meta.url))

const port = Number(process.env.PORT) || 5000
const isProd = process.env.NODE_ENV === 'production'
const uri =
  process.env.MONGO_URI?.trim() ||
  process.env.MONGODB_URI?.trim() ||
  (isProd ? '' : 'mongodb://127.0.0.1:27017/getvia')

if (!uri) {
  console.error('[database] MONGO_URI is required in production.')
  process.exit(1)
}

function maskMongoUri(u) {
  try {
    return u.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')
  } catch {
    return '(invalid URI)'
  }
}

try {
  await connectDb(uri)
} catch (err) {
  console.error('\n[database] Cannot connect to MongoDB.')
  console.error(`  Using: ${maskMongoUri(uri)}`)
  console.error(`  (${err.message})`)
  const msg = String(err.message || '')
  if (/timed out|Server selection|ECONNREFUSED|ENOTFOUND/i.test(msg)) {
    console.error(
      '\n  Atlas checklist:\n' +
        '  • Atlas → Network Access: allow your current IP (or 0.0.0.0/0 for dev only).\n' +
        '  • Use the "Connect your application" string (prefer mongodb+srv://…).\n' +
        '  • If the DB user password has @ # etc., URL-encode it in the URI.\n' +
        '  • Corporate / school Wi‑Fi often blocks outbound 27017 — try another network or VPN.\n' +
        '  • Optional: raise MONGO_SERVER_SELECTION_TIMEOUT_MS (default 25000) in .env.\n',
    )
  }
  console.error('')
  process.exit(1)
}

const app = createApp()
const server = app.listen(port, () => {
  startAnalyticsCronJobs()
  if (!isProd) {
    console.log(`API listening on http://localhost:${port}`)
  } else {
    console.log(`[getvia-api] listening on port ${port}`)
  }
  if (!isProd) {
    const rel = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim()
    const saAbs = rel
      ? path.isAbsolute(rel)
        ? rel
        : path.join(thisServerDir, rel.replace(/^\.\//, ''))
      : path.join(thisServerDir, 'secrets', 'firebase-adminsdk.json')
    console.log(`[getvia-api] This process directory: ${thisServerDir}`)
    console.log(`[getvia-api] Service account JSON: ${saAbs} (exists: ${existsSync(saAbs)})`)
    console.log(
      isFirebaseAdminConfigured()
        ? 'Firebase Admin: ready (service account or FIREBASE_* env).'
        : 'Firebase Admin: NOT configured — add server/secrets/firebase-adminsdk.json and restart.',
    )
  }
})

let shuttingDown = false
function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[getvia-api] ${signal} received — shutting down`)
  server.close(() => {
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('unhandledRejection', (reason) => {
  console.error('[getvia-api] unhandledRejection', reason)
  if (isProd) shutdown('unhandledRejection')
})
process.on('uncaughtException', (err) => {
  console.error('[getvia-api] uncaughtException', err)
  if (isProd) process.exit(1)
})
