import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'

/** Directory that contains `server.js` and `.env` (parent of `config/`). */
const SERVER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

let initialized = false

function defaultServiceAccountAbsolutePaths() {
  return [
    path.join(SERVER_DIR, 'secrets', 'firebase-adminsdk.json'),
    path.join(SERVER_DIR, 'secrets', 'serviceAccount.json'),
    path.join(SERVER_DIR, 'firebase-adminsdk.json'),
  ]
}

/**
 * Sets FIREBASE_SERVICE_ACCOUNT_PATH when the JSON exists under server/ (bootstrap may have missed import order).
 */
export function ensureFirebaseEnvDefaults() {
  const hasInlineTriple =
    Boolean(process.env.FIREBASE_PROJECT_ID?.trim()) &&
    Boolean(process.env.FIREBASE_CLIENT_EMAIL?.trim()) &&
    Boolean(process.env.FIREBASE_PRIVATE_KEY?.trim())
  if (hasInlineTriple) return

  const cur = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim()
  if (cur) {
    const abs = resolveFromServer(cur)
    if (abs && existsSync(abs)) return
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) return
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) return

  for (const abs of defaultServiceAccountAbsolutePaths()) {
    if (existsSync(abs)) {
      const rel = path.relative(SERVER_DIR, abs).split(path.sep).join('/')
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH = rel.startsWith('.') ? rel : `./${rel}`
      return
    }
  }
}

function resolveFromServer(relOrAbs) {
  if (!relOrAbs) return ''
  const s = String(relOrAbs).trim()
  if (!s) return ''
  return path.isAbsolute(s) ? s : path.join(SERVER_DIR, s)
}

function readPrivateKeyPem() {
  const raw = process.env.FIREBASE_PRIVATE_KEY
  if (raw != null && String(raw).trim() !== '') {
    let v = String(raw).trim()
    v = v.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n')
    return v
  }
  const file = process.env.FIREBASE_PRIVATE_KEY_FILE?.trim()
  if (file) {
    const abs = resolveFromServer(file)
    if (abs && existsSync(abs)) {
      return readFileSync(abs, 'utf8').trim()
    }
  }
  return ''
}

function certFromEnvFields() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim()
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim()
  const privateKey = readPrivateKeyPem()
  if (!projectId || !clientEmail || !privateKey) return null
  try {
    return admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    })
  } catch {
    return null
  }
}

function certFromJsonFile() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  if (rawJson) {
    try {
      return admin.credential.cert(JSON.parse(rawJson))
    } catch {
      return null
    }
  }
  const p = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim()
  if (p) {
    const abs = resolveFromServer(p)
    if (abs && existsSync(abs)) {
      try {
        return admin.credential.cert(JSON.parse(readFileSync(abs, 'utf8')))
      } catch {
        return null
      }
    }
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    try {
      return admin.credential.applicationDefault()
    } catch {
      return null
    }
  }
  return null
}

/**
 * True if env looks complete enough to *try* Admin SDK init.
 * Service account JSON alone is enough (project_id is inside the file).
 */
export function isFirebaseAdminConfigured() {
  ensureFirebaseEnvDefaults()
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) return true
  const svcPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim()
  if (svcPath) {
    const abs = resolveFromServer(svcPath)
    if (abs && existsSync(abs)) return true
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) return true
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim()
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim()
  if (projectId && clientEmail && readPrivateKeyPem()) return true
  return false
}

const FIREBASE_SETUP_HINT =
  ' Fix: Firebase Console → Project settings → Service accounts → Generate new private key → save the JSON as server/secrets/firebase-adminsdk.json (create the folder). Restart the API (npm run dev in server/). Client VITE_* keys are not enough — the API needs this file or FIREBASE_* in server/.env.'

/** Short hint for logs / API errors when `isFirebaseAdminConfigured()` is false. */
export function firebaseAdminConfigGap() {
  if (isFirebaseAdminConfigured()) return ''
  const parts = []
  if (!process.env.FIREBASE_PROJECT_ID?.trim()) parts.push('FIREBASE_PROJECT_ID')
  if (!process.env.FIREBASE_CLIENT_EMAIL?.trim()) parts.push('FIREBASE_CLIENT_EMAIL')

  const pk = process.env.FIREBASE_PRIVATE_KEY
  const pkNonEmpty = pk != null && String(pk).trim() !== ''
  const pkFile = process.env.FIREBASE_PRIVATE_KEY_FILE?.trim()
  const hasJsonPathOrInline =
    Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim()) ||
    Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) ||
    Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim())

  if (!hasJsonPathOrInline && !pkNonEmpty && !pkFile) {
    parts.push('service account JSON (recommended) or FIREBASE_PRIVATE_KEY')
  } else if (pkFile) {
    const abs = resolveFromServer(pkFile)
    if (!abs || !existsSync(abs)) {
      parts.push(`FIREBASE_PRIVATE_KEY_FILE (file not found: ${abs || pkFile})`)
    }
  }

  const jpath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim()
  if (jpath) {
    const abs = resolveFromServer(jpath)
    if (!abs || !existsSync(abs)) {
      parts.push(`FIREBASE_SERVICE_ACCOUNT_PATH (file not found: ${abs || jpath})`)
    }
  }

  if (parts.length) {
    return `Firebase Admin: missing or invalid — ${parts.join('; ')}.${FIREBASE_SETUP_HINT}`
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) {
    return `FIREBASE_SERVICE_ACCOUNT_JSON is invalid or truncated.${FIREBASE_SETUP_HINT}`
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    return `GOOGLE_APPLICATION_CREDENTIALS points to a missing or unreadable file.${FIREBASE_SETUP_HINT}`
  }
  const pid = process.env.FIREBASE_PROJECT_ID?.trim()
  const em = process.env.FIREBASE_CLIENT_EMAIL?.trim()
  const pem = readPrivateKeyPem()
  if (pid && em && pem) {
    return `FIREBASE_PRIVATE_KEY failed validation (PEM format). Prefer saving the JSON key to server/secrets/firebase-adminsdk.json instead.${FIREBASE_SETUP_HINT}`
  }
  return `No Firebase Admin credentials detected.${FIREBASE_SETUP_HINT}`
}

export function ensureFirebaseAdmin() {
  if (initialized) return admin
  ensureFirebaseEnvDefaults()
  const cred = certFromEnvFields() || certFromJsonFile()
  if (!cred) {
    const hint = firebaseAdminConfigGap()
    throw new Error(hint || 'Firebase Admin could not load credentials. Add server/secrets/firebase-adminsdk.json.')
  }
  if (!admin.apps.length) {
    admin.initializeApp({ credential: cred })
  }
  initialized = true
  return admin
}

export async function verifyIdToken(idToken) {
  const app = ensureFirebaseAdmin()
  return app.auth().verifyIdToken(idToken)
}
