import {
  verifyIdToken,
  ensureFirebaseEnvDefaults,
  isFirebaseAdminConfigured,
  ensureFirebaseAdmin,
  firebaseAdminConfigGap,
} from '../config/firebase.js'
import { User } from '../models/user.model.js'

const debug = () => process.env.DEBUG_AUTH === '1' || process.env.DEBUG_AUTH === 'true'

/** Store bcrypt password on business owners when provided (Firebase email/password signup). */
function applyOwnerPasswordIfValid(user, password) {
  if (!password || String(password).length < 8) return
  if (user.role !== 'BUSINESS_OWNER') return
  user.password = password
}

/**
 * @param {string} token - Firebase ID token
 * @returns {Promise<import('firebase-admin/auth').DecodedIdToken>}
 */
export async function verifyFirebaseToken(token) {
  ensureFirebaseEnvDefaults()
  if (debug()) console.log('[auth.service] Verifying Firebase ID token…')
  if (!isFirebaseAdminConfigured()) {
    const msg =
      firebaseAdminConfigGap() ||
      'Firebase Admin is not configured. Place firebase-adminsdk.json in server/secrets/ or set FIREBASE_SERVICE_ACCOUNT_PATH in server/.env.'
    throw Object.assign(new Error(msg), { code: 'FIREBASE_ADMIN_NOT_CONFIGURED' })
  }
  try {
    ensureFirebaseAdmin()
  } catch (e) {
    throw Object.assign(
      new Error(e?.message || 'Firebase Admin failed to initialize (check private key / service account JSON).'),
      { code: 'FIREBASE_ADMIN_INIT_FAILED', cause: e },
    )
  }
  const decoded = await verifyIdToken(token)
  if (debug()) console.log('[auth.service] Firebase OK uid=', decoded.uid, 'email=', decoded.email || '(none)')
  return decoded
}

/**
 * @param {import('firebase-admin/auth').DecodedIdToken} decoded
 * @param {{ registerAsBusinessOwner?: boolean, password?: string }} [options]
 */
export async function findOrCreateUserFromFirebase(decoded, options = {}) {
  const registerAsBusinessOwner = Boolean(options.registerAsBusinessOwner)
  const password = options.password ? String(options.password) : ''
  const uid = decoded.uid
  const phone = decoded.phone_number ? String(decoded.phone_number) : ''
  const emailFromToken = decoded.email ? String(decoded.email).toLowerCase().trim() : ''
  const email = emailFromToken || `${uid}@firebase.getvia.app`
  const displayName =
    (decoded.name && String(decoded.name).trim()) ||
    (emailFromToken ? emailFromToken.split('@')[0] : '') ||
    (phone ? `User ${phone.slice(-4)}` : '')
  const name = displayName || 'User'
  const picture = decoded.picture ? String(decoded.picture).trim() : ''

  let user = await User.findOne({ firebaseUid: uid })
  if (!user) {
    user = await User.findOne({ email })
  }

  if (user) {
    if (user.role === 'SUPER_ADMIN') {
      const err = new Error('NON_USER_ROLE')
      err.code = 'NON_USER_ROLE'
      err.status = 403
      throw err
    }

    if (user.role === 'BUSINESS_OWNER') {
      if (user.firebaseUid && user.firebaseUid !== uid) {
        const err = new Error('FIREBASE_UID_MISMATCH')
        err.code = 'FIREBASE_UID_MISMATCH'
        err.status = 409
        throw err
      }
      user.firebaseUid = uid
      user.name = name || user.name
      if (phone) user.phone = phone
      if (emailFromToken) user.email = emailFromToken
      if (picture) user.photoURL = picture
      applyOwnerPasswordIfValid(user, password)
      await user.save()
      if (debug()) console.log('[auth.service] Updated business owner', user._id.toString())
      return { user, created: false }
    }

    // USER
    if (user.firebaseUid && user.firebaseUid !== uid) {
      const err = new Error('FIREBASE_UID_MISMATCH')
      err.code = 'FIREBASE_UID_MISMATCH'
      err.status = 409
      throw err
    }
    if (registerAsBusinessOwner) {
      user.role = 'BUSINESS_OWNER'
    }
    user.firebaseUid = uid
    user.name = name || user.name
    if (phone) user.phone = phone
    if (emailFromToken) user.email = emailFromToken
    if (picture) user.photoURL = picture
    if (registerAsBusinessOwner) applyOwnerPasswordIfValid(user, password)
    await user.save()
    if (debug()) console.log('[auth.service] Updated user', user._id.toString())
    return { user, created: false }
  }

  const createPayload = {
    firebaseUid: uid,
    name,
    email,
    phone,
    photoURL: picture,
    role: registerAsBusinessOwner ? 'BUSINESS_OWNER' : 'USER',
  }
  if (registerAsBusinessOwner && password.length >= 8) createPayload.password = password
  user = await User.create(createPayload)
  if (debug()) console.log('[auth.service] Created user', user._id.toString())
  return { user, created: true }
}

/**
 * Sign-in only: resolve an existing user from Firebase — never create.
 * @param {import('firebase-admin/auth').DecodedIdToken} decoded
 * @param {{ expectedRole?: string, password?: string }} [options]
 */
export async function loginUserFromFirebase(decoded, options = {}) {
  const expectedRole = options.expectedRole ? String(options.expectedRole).trim() : ''
  const password = options.password ? String(options.password) : ''
  const uid = decoded.uid
  const phone = decoded.phone_number ? String(decoded.phone_number) : ''
  const emailFromToken = decoded.email ? String(decoded.email).toLowerCase().trim() : ''
  const email = emailFromToken || `${uid}@firebase.getvia.app`
  const displayName =
    (decoded.name && String(decoded.name).trim()) ||
    (emailFromToken ? emailFromToken.split('@')[0] : '') ||
    (phone ? `User ${phone.slice(-4)}` : '')
  const name = displayName || 'User'
  const picture = decoded.picture ? String(decoded.picture).trim() : ''

  let user = await User.findOne({ firebaseUid: uid })
  if (!user && emailFromToken) {
    user = await User.findOne({ email: emailFromToken })
  }

  if (!user) {
    const err = new Error('USER_NOT_FOUND')
    err.code = 'USER_NOT_FOUND'
    err.status = 404
    throw err
  }

  if (user.role === 'SUPER_ADMIN') {
    const err = new Error('NON_USER_ROLE')
    err.code = 'NON_USER_ROLE'
    err.status = 403
    throw err
  }

  if (expectedRole && user.role !== expectedRole) {
    const err = new Error('ROLE_MISMATCH')
    err.code = 'ROLE_MISMATCH'
    err.status = 403
    throw err
  }

  if (user.firebaseUid && user.firebaseUid !== uid) {
    const err = new Error('FIREBASE_UID_MISMATCH')
    err.code = 'FIREBASE_UID_MISMATCH'
    err.status = 409
    throw err
  }

  user.firebaseUid = uid
  user.name = name || user.name
  if (phone) user.phone = phone
  if (emailFromToken) user.email = emailFromToken
  if (picture) user.photoURL = picture
  applyOwnerPasswordIfValid(user, password)
  await user.save()
  if (debug()) console.log('[auth.service] Login-only Firebase OK', user._id.toString(), user.role)
  return { user, created: false }
}
