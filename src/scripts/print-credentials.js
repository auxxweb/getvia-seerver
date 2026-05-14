/**
 * Prints demo admin credentials — no MongoDB, no MONGODB_URI required.
 */
import { DEMO_CREDENTIALS as C } from '../config/demoCredentials.js'

function row(label, value) {
  console.log(`  ${label.padEnd(14)} ${value}`)
}

console.log('')
console.log('Getvia — demo credentials (for admin panel testing)')
console.log('─'.repeat(56))
console.log('')
console.log('Super Admin (super admin panel)')
row('Email', C.superAdmin.email)
row('Password', C.superAdmin.password)
row('Role', C.superAdmin.role)
row('Open', C.superAdmin.adminApp)
console.log('')
console.log('Business Owner (business admin panel)')
row('Email', C.businessOwner.email)
row('Password', C.businessOwner.password)
row('Role', C.businessOwner.role)
row('Open', C.businessOwner.adminApp)
console.log('')
console.log('End user (optional)')
row('Email', C.endUser.email)
row('Password', C.endUser.password)
row('Role', C.endUser.role)
console.log('')
console.log('These accounts exist in the database only after you run: npm run seed')
console.log('(requires MongoDB running and MONGODB_URI in .env if not using default).')
console.log('')
