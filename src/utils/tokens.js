import jwt from 'jsonwebtoken'
import crypto from 'crypto'

export function signAccessToken(payload, secret, expiresIn) {
  return jwt.sign(payload, secret, { expiresIn })
}

export function signRefreshToken(payload, secret, expiresIn) {
  return jwt.sign(payload, secret, { expiresIn })
}

export function verifyAccessToken(token, secret) {
  return jwt.verify(token, secret)
}

export function verifyRefreshToken(token, secret) {
  return jwt.verify(token, secret)
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}
