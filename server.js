import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import './bootstrap-env.js'
import { connectDb } from './config/db.js'
import { createApp } from './app.js'
import { startAnalyticsCronJobs } from './src/jobs/analyticsCron.js'
import { isFirebaseAdminConfigured } from './config/firebase.js'

const thisServerDir = path.dirname(fileURLToPath(import.meta.url))

const port = Number(process.env.PORT) || 5000
const uri =
  process.env.MONGO_URI?.trim() ||
  process.env.MONGODB_URI?.trim() ||
  'mongodb://127.0.0.1:27017/getvia'

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
        '  • Optional: raise MONGO_SERVER_SELECTION_TIMEOUT_MS (default 25000) in .env.\n'
    )
  }
  console.error('')
  process.exit(1)
}

const app = createApp()
app.listen(port, () => {
  startAnalyticsCronJobs()
  const rel = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim()
  const saAbs = rel
    ? path.isAbsolute(rel)
      ? rel
      : path.join(thisServerDir, rel.replace(/^\.\//, ''))
    : path.join(thisServerDir, 'secrets', 'firebase-adminsdk.json')
  console.log(`API listening on http://localhost:${port}`)
  console.log(`[getvia-api] This process directory: ${thisServerDir}`)
  console.log(`[getvia-api] Service account JSON: ${saAbs} (exists: ${existsSync(saAbs)})`)
  console.log(
    isFirebaseAdminConfigured()
      ? 'Firebase Admin: ready (service account or FIREBASE_* env).'
      : 'Firebase Admin: NOT configured — add server/secrets/firebase-adminsdk.json and restart.',
  )
  console.log(
    `[getvia-api] Verify the browser hits THIS process: http://localhost:${port}/api/auth/_diagnostics (must show apiBuild getvia-api-v3).`,
  )
})
