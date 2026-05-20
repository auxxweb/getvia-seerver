/**
 * Single source of truth for demo accounts created by `npm run seed`.
 * `npm run seed:creds` prints these without touching MongoDB.
 */
export const DEMO_CREDENTIALS = {
  superAdmin: {
    role: 'SUPER_ADMIN',
    email: 'superadmin@getvia.local',
    password: 'SuperAdmin123!',
    adminApp: 'admin-super (port 5174)',
  },
  businessOwner: {
    role: 'BUSINESS_OWNER',
    email: 'owner@getvia.local',
    password: 'BusinessOwner123!',
    adminApp: 'admin-business (port 5175)',
  },
  endUser: {
    role: 'USER',
    email: 'user@getvia.local',
    password: 'EndUser123!',
    adminApp: 'end-user app (optional)',
  },
}
