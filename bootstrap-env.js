/**
 * Load env files from several likely locations so Firebase/Mongo/JWT always resolve.
 * Priority (last file wins for each key): cwd .env → cwd/server/.env → server/.env → server/.env.local
 */
import { existsSync, readFileSync } from 'node:fs'
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverRoot = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(serverRoot, '.env')
const localPath = path.join(serverRoot, '.env.local')

function stripBom(s) {
  if (s.charCodeAt(0) === 0xfeff) return s.slice(1)
  return s
}

/** @param {string} absPath @param {boolean} override */
function mergeEnvFile(absPath, override) {
  if (!existsSync(absPath)) return
  const raw = stripBom(readFileSync(absPath, 'utf8'))
  const parsed = dotenv.parse(raw)
  for (const [key, val] of Object.entries(parsed)) {
    if (override || process.env[key] === undefined) {
      process.env[key] = val
    }
  }
}

const candidates = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), 'server', '.env'),
  envPath,
]

const anyEnvFile = candidates.some((p) => existsSync(p))
if (!anyEnvFile) {
  console.warn(`[env] No .env file found. Tried:`)
  for (const p of candidates) console.warn(`      ${p}`)
  console.warn(`[env] Copy server/.env.example → server/.env and add Firebase + Mongo + JWT.`)
} else {
  mergeEnvFile(candidates[0], false)
  mergeEnvFile(candidates[1], false)
  mergeEnvFile(candidates[2], true)
}

if (existsSync(localPath)) {
  mergeEnvFile(localPath, true)
}

/**
 * Zero-config dev: if the user drops the Firebase JSON key in server/secrets/, use it.
 * Skips if inline FIREBASE_* or another credential method is already set.
 */
function applyDefaultFirebaseServiceAccountJson() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim()) return
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) return
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) return
  const pid = process.env.FIREBASE_PROJECT_ID?.trim()
  const email = process.env.FIREBASE_CLIENT_EMAIL?.trim()
  const pk = process.env.FIREBASE_PRIVATE_KEY?.trim()
  if (pid && email && pk) return

  const files = [
    path.join(serverRoot, 'secrets', 'firebase-adminsdk.json'),
    path.join(serverRoot, 'secrets', 'serviceAccount.json'),
    path.join(serverRoot, 'firebase-adminsdk.json'),
  ]
  for (const abs of files) {
    if (existsSync(abs)) {
      const rel = path.relative(serverRoot, abs).split(path.sep).join('/')
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH = rel.startsWith('.') ? rel : `./${rel}`
      console.log('[env] Firebase Admin: using', process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
      return
    }
  }
}

applyDefaultFirebaseServiceAccountJson()

if (process.env.DEBUG_ENV === '1' || process.env.DEBUG_ENV === 'true') {
  console.log('[env] server root:', serverRoot)
  console.log('[env] cwd:', process.cwd())
  console.log('[env] flags:', {
    hasMongo: Boolean(process.env.MONGO_URI?.trim() || process.env.MONGODB_URI?.trim()),
    hasFirebaseProject: Boolean(process.env.FIREBASE_PROJECT_ID?.trim()),
    hasFirebaseEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL?.trim()),
    hasFirebasePrivateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY?.trim()),
    hasFirebaseKeyFile: Boolean(process.env.FIREBASE_PRIVATE_KEY_FILE?.trim()),
    hasFirebaseServiceAccountPath: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim()),
    hasJwt: Boolean(
      process.env.JWT_SECRET?.trim() ||
        (process.env.JWT_ACCESS_SECRET?.trim() && process.env.JWT_REFRESH_SECRET?.trim()),
    ),
  })
}
