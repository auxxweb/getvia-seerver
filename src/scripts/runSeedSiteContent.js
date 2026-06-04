import '../../bootstrap-env.js'
import { connectDb } from '../config/db.js'
import mongoose from 'mongoose'
import { seedSiteContent } from './seedSiteContent.js'

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/getvia'
  await connectDb(uri)
  await seedSiteContent()
  await mongoose.disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
