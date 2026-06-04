/**
 * Fail fast when required production configuration is missing.
 */
export function validateEnv() {
  const isProd = process.env.NODE_ENV === 'production'
  const errors = []

  const mongo = process.env.MONGO_URI?.trim() || process.env.MONGODB_URI?.trim()
  if (!mongo) {
    errors.push('MONGO_URI (or MONGODB_URI) is required')
  }

  const jwtSecret = process.env.JWT_SECRET?.trim()
  const accessSecret = process.env.JWT_ACCESS_SECRET?.trim()
  const refreshSecret = process.env.JWT_REFRESH_SECRET?.trim()

  const hasLegacyJwt = Boolean(jwtSecret && jwtSecret.length >= 32)
  const hasSplitJwt =
    Boolean(accessSecret && accessSecret.length >= 32) &&
    Boolean(refreshSecret && refreshSecret.length >= 32)

  if (!hasLegacyJwt && !hasSplitJwt) {
    errors.push(
      'Set JWT_SECRET (≥32 chars) or both JWT_ACCESS_SECRET and JWT_REFRESH_SECRET (≥32 chars each)',
    )
  }

  if (isProd) {
    if (hasSplitJwt && accessSecret === refreshSecret) {
      errors.push('JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET in production')
    }
    if (hasLegacyJwt && !hasSplitJwt) {
      if (!refreshSecret || refreshSecret.length < 32) {
        errors.push('JWT_REFRESH_SECRET must be set (≥32 chars) in production')
      } else if (refreshSecret === jwtSecret) {
        errors.push('JWT_REFRESH_SECRET must differ from JWT_SECRET in production')
      }
    }

    const origins = process.env.CLIENT_ORIGINS?.trim()
    if (!origins) {
      errors.push('CLIENT_ORIGINS is required in production (comma-separated allowed origins)')
    }

    const analyticsSalt = process.env.ANALYTICS_IP_SALT?.trim()
    if (!analyticsSalt || analyticsSalt.length < 16) {
      errors.push('ANALYTICS_IP_SALT is required in production (≥16 chars, random)')
    }

    if (jwtSecret === 'change-me-min-32-characters-long-secret!!') {
      errors.push('JWT_SECRET must be changed from the example placeholder before production deploy')
    }
  }

  if (errors.length) {
    console.error('\n[env] Configuration errors:')
    for (const e of errors) console.error(`  • ${e}`)
    console.error('')
    if (isProd) process.exit(1)
  }
}
