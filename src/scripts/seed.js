import '../../bootstrap-env.js'
import mongoose from 'mongoose'
import { connectDb } from '../config/db.js'
import { DEMO_CREDENTIALS } from '../config/demoCredentials.js'
import { User } from '../models/User.js'
import { Business } from '../models/Business.js'
import { BusinessContent } from '../models/BusinessContent.js'
import { Category } from '../models/Category.js'
import { Event } from '../models/Event.js'
import { Analytics } from '../models/Analytics.js'
import { Plan } from '../models/Plan.js'
import { seedSiteContent } from './seedSiteContent.js'

const DEMO = [
  {
    publicId: 'l-1',
    name: 'Ram Residency',
    category: 'Travel & Tours',
    subcategory: 'Hotels',
    address: 'Badrinath Road, Tapovan, Rishikesh',
    lat: 30.0869,
    lng: 78.2676,
  },
  {
    publicId: 'l-2',
    name: 'Fresh Garden',
    category: 'Organic grocery',
    subcategory: 'Retail',
    address: '12 Market Lane, Greenfield',
    lat: 12.97,
    lng: 77.59,
  },
  {
    publicId: 'l-3',
    name: 'Pixelspark Bistro',
    category: 'Fine dining',
    subcategory: 'Restaurant',
    address: 'City Center, Floor 2',
    lat: 28.61,
    lng: 77.23,
  },
]

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/getvia'
  await connectDb(uri)

  const { superAdmin, businessOwner, endUser } = DEMO_CREDENTIALS

  if (!(await User.findOne({ email: superAdmin.email }))) {
    await User.create({
      name: 'Super Admin',
      email: superAdmin.email,
      password: superAdmin.password,
      role: superAdmin.role,
    })
    console.log(`Created super admin: ${superAdmin.email} / ${superAdmin.password}`)
  }

  let owner = await User.findOne({ email: businessOwner.email })
  if (!owner) {
    owner = await User.create({
      name: 'Demo Business Owner',
      email: businessOwner.email,
      password: businessOwner.password,
      role: businessOwner.role,
    })
    console.log(`Created owner: ${businessOwner.email} / ${businessOwner.password}`)
  }

  if (!(await User.findOne({ email: endUser.email }))) {
    await User.create({
      name: 'Demo User',
      email: endUser.email,
      password: endUser.password,
      role: endUser.role,
    })
    console.log(`Created user: ${endUser.email} / ${endUser.password}`)
  }

  const cats = [
    {
      name: 'Dental Clinic',
      description: 'Oral health providers',
      icon: 'dental',
      logoUrl: '',
      coverImageUrl: '',
      subcategories: [
        { title: 'Clinic', description: '', logoUrl: '', coverImageUrl: '' },
        { title: 'Orthodontics', description: '', logoUrl: '', coverImageUrl: '' },
      ],
    },
    {
      name: 'Restaurants',
      description: 'Food & dining',
      icon: 'food',
      logoUrl: '',
      coverImageUrl: '',
      subcategories: [
        { title: 'Fine dining', description: '', logoUrl: '', coverImageUrl: '' },
        { title: 'Cafe', description: '', logoUrl: '', coverImageUrl: '' },
      ],
    },
    {
      name: 'Travel & Tours',
      description: 'Trips & stays',
      icon: 'travel',
      logoUrl: '',
      coverImageUrl: '',
      subcategories: [
        { title: 'Hotels', description: '', logoUrl: '', coverImageUrl: '' },
        { title: 'Packages', description: '', logoUrl: '', coverImageUrl: '' },
      ],
    },
  ]
  for (const c of cats) {
    await Category.findOneAndUpdate({ name: c.name }, c, { upsert: true })
  }

  await Event.findOneAndUpdate(
    { title: 'Summer Expo 2026' },
    {
      title: 'Summer Expo 2026',
      description: 'Featured business expo',
      banner: '',
      date: new Date('2026-06-15'),
      isFeatured: true,
    },
    { upsert: true },
  )

  const superDoc = await User.findOne({ email: superAdmin.email })
  if (superDoc) {
    const tierPlans = [
      {
        name: 'CORE',
        price: 999,
        validity: 365,
        features: ['Standard listing', 'Customer bookings', 'Basic support'],
        isActive: true,
      },
      {
        name: 'PRO',
        price: 1999,
        validity: 365,
        features: ['Everything in CORE', 'Featured placement', 'Listing analytics'],
        isActive: true,
      },
      {
        name: 'PREMIUM',
        price: 4999,
        validity: 365,
        features: ['Everything in PRO', 'Priority support', 'Campaign tools'],
        isActive: true,
      },
    ]
    for (const p of tierPlans) {
      await Plan.findOneAndUpdate(
        { name: p.name },
        { ...p, createdBy: superDoc._id },
        { upsert: true },
      )
    }
  }

  for (const d of DEMO) {
    let b = await Business.findOne({ publicId: d.publicId })
    if (!b) {
      b = await Business.create({
        ownerId: owner._id,
        publicId: d.publicId,
        name: d.name,
        category: d.category,
        subcategory: d.subcategory,
        address: d.address,
        location: { type: 'Point', coordinates: [d.lng, d.lat] },
        description: `${d.name} — verified listing on Getvia.`,
        isVerified: true,
        isFeatured: d.publicId === 'l-1',
        isTrending: true,
        approvalStatus: 'APPROVED',
        onboardingCompletedAt: new Date(),
        plan: 'PRO',
        phone: '8956751544',
        whatsappHref: 'https://wa.me/918956751544',
      })
      await BusinessContent.create({
        businessId: b._id,
        landingSection: {
          title: `Welcome to ${d.name}`,
          description: 'Discover our services and offers.',
          link: '#',
        },
        welcomeSection: { title: 'About us', description: b.description },
        offers: [
          {
            image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400',
            title: '10% off first visit',
            description: 'Limited time welcome offer.',
            link: '#',
          },
        ],
        coreServices: [{ title: 'Consultation', description: 'Book a slot' }],
        catalogue: [{ name: 'Starter pack', price: '₹999', description: 'Popular', image: '' }],
        gallery: [],
      })
      await Analytics.create({ businessId: b._id })
      console.log('Seeded business', d.publicId)
    }
  }

  await seedSiteContent()

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
