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

  const jwt = process.env.JWT_SECRET?.trim()
  if (!jwt || jwt.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters')
  }

  if (isProd) {
    const refresh = process.env.JWT_REFRESH_SECRET?.trim()
    if (!refresh || refresh.length < 32) {
      errors.push('JWT_REFRESH_SECRET must be set (≥32 chars) in production')
    }
    if (refresh && jwt && refresh === jwt) {
      errors.push('JWT_REFRESH_SECRET must differ from JWT_SECRET in production')
    }

    const origins = process.env.CLIENT_ORIGINS?.trim()
    if (!origins) {
      errors.push('CLIENT_ORIGINS is required in production (comma-separated allowed origins)')
    }
  }

  if (errors.length) {
    console.error('\n[env] Configuration errors:')
    for (const e of errors) console.error(`  • ${e}`)
    console.error('')
    if (isProd) process.exit(1)
  }
}
