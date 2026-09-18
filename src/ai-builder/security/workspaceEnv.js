const SECRET_ENV = [
  'OPENAI_API_KEY',
  'OPENAI_API_KEY_WEBSITE_BUILDER',
  'JWT_SECRET',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'MONGO_URI',
  'MONGODB_URI',
  'RAZORPAY_KEY_SECRET',
  'CLOUDINARY_API_SECRET',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_ACCESS_KEY_ID',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'ANTHROPIC_API_KEY',
  'REDIS_URL',
]

/** Child processes (npm, Vite) must not inherit API keys. */
export function sanitizedWorkspaceEnv(base = process.env) {
  const env = { ...base }
  for (const key of SECRET_ENV) delete env[key]
  env.PATH = base.PATH
  env.HOME = base.HOME
  env.LANG = base.LANG
  env.TERM = 'dumb'
  return env
}
