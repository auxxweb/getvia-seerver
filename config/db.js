import mongoose from 'mongoose'

/**
 * Resolves Mongo connection string: explicit arg → MONGO_URI → MONGODB_URI.
 */
export function resolveMongoUri(explicit) {
  const u =
    (explicit && String(explicit).trim()) ||
    process.env.MONGO_URI?.trim() ||
    process.env.MONGODB_URI?.trim()
  if (!u) {
    throw new Error('Set MONGO_URI or MONGODB_URI in .env (or pass connectDb(uri))')
  }
  return u
}

function connectOptions() {
  const serverSelectionTimeoutMS = Math.max(
    5_000,
    Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 25_000
  )
  const connectTimeoutMS = Math.max(
    5_000,
    Number(process.env.MONGO_CONNECT_TIMEOUT_MS) || serverSelectionTimeoutMS
  )
  return {
    serverSelectionTimeoutMS,
    connectTimeoutMS,
    /** Atlas and many networks need retries during DNS / cold start */
    retryWrites: true,
  }
}

export async function connectDb(uri) {
  mongoose.set('strictQuery', true)
  const resolved = resolveMongoUri(uri)
  await mongoose.connect(resolved, connectOptions())
  return mongoose.connection
}
