import assert from 'node:assert/strict'
import test from 'node:test'
import {
  sectionsFromGetviaProfile,
  functionalityFromProfile,
  pickFact,
  designDirectionForCategory,
  PRODUCT_RULE,
} from '../getvia/profileContract.js'
import { buildDesignDna } from '../getvia/designDna.js'
import { businessJsonFrom, writeViteScaffold } from '../workspace/viteScaffold.js'
import { classifyDesignMode, noveltyFor } from '../../../agent/core/designMode.js'
import { analyzeIntent } from '../v2/intentAnalyzer.js'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'

const profile = {
  identity: { name: 'LaFemina', category: 'Salon', description: 'Hair and beauty in Pune', logo: 'https://cdn.example/logo.png' },
  location: { city: 'Pune', address: 'Koregaon Park', mapLink: 'https://maps.example/x' },
  contact: {
    phone: '9999999999',
    email: 'hi@lafemina.test',
    whatsappHref: 'https://wa.me/919999999999',
    socialLinks: { instagram: 'https://instagram.com/lafemina' },
  },
  openingHours: [{ day: 'Mon', open: '10:00', close: '19:00', closed: false }],
  content: {
    landing: { bannerTitle: 'Glow', bannerDescription: 'Salon care', welcomeTitle: 'Welcome', welcomeDescription: 'Hair and beauty in Pune' },
    coreServices: [{ title: 'Haircut', description: 'Signature cut' }],
    catalogue: [{ name: 'Serum', description: 'Glow', price: '₹890' }],
    offers: [{ title: 'Bridal package', description: 'Full day' }],
    gallery: ['https://cdn.example/1.jpg'],
    profileFeed: [{ title: 'New lookbook', description: 'Spring' }],
  },
  reviews: { reviewCount: 2, recent: [{ rating: 5, comment: 'Loved it' }] },
}

test('product rule constants stay clear', () => {
  assert.match(PRODUCT_RULE.getvia, /DATA/)
  assert.match(PRODUCT_RULE.ai, /DESIGN/)
})

test('GetVia sections come from profile capabilities, not invented catalogue', () => {
  const sections = sectionsFromGetviaProfile({ profile, prompt: 'Make my salon look like luxury fashion' })
  assert.ok(sections.includes('hero'))
  assert.ok(sections.includes('services'))
  assert.ok(sections.includes('products'))
  assert.ok(sections.includes('offers'))
  assert.ok(sections.includes('gallery'))
  assert.ok(sections.includes('feed'))
  assert.ok(sections.includes('location'))
  assert.ok(sections.includes('hours'))
  assert.ok(sections.includes('social'))
  assert.ok(sections.includes('contact'))
  assert.equal(sections.includes('faq'), false)
  const empty = sectionsFromGetviaProfile({
    profile: { identity: { name: 'Bare' }, content: {}, contact: {}, location: {} },
    prompt: 'Transform my profile',
  })
  assert.deepEqual(
    empty.filter((id) => !['hero', 'about', 'cta', 'contact', 'footer'].includes(id)),
    [],
  )
})

test('businessJsonFrom never invents WhatsApp or placeholder brand names', () => {
  const data = businessJsonFrom({
    profile: {
      identity: { name: 'Real Co', category: 'Retail' },
      contact: { phone: '111' },
      content: {},
    },
    prompt: 'Make my website look completely different',
  })
  assert.equal(data.name, 'Real Co')
  assert.equal(data.whatsapp, '')
  assert.equal(data.source, 'getvia-profile')
  assert.equal(data.functionality.call, true)
  assert.equal(data.functionality.whatsapp, false)
  const blank = businessJsonFrom({ profile: { identity: {}, content: {}, contact: {} }, prompt: 'Redesign' })
  assert.equal(blank.name, '')
  assert.notEqual(blank.name, 'Our studio')
})

test('design modes and novelty follow transform language', () => {
  assert.equal(classifyDesignMode('Make my salon website look like a luxury fashion brand', 'EDIT'), 'REDESIGN')
  assert.equal(noveltyFor('REIMAGINE', 'reimagine', 'REIMAGINE'), 5)
  assert.equal(noveltyFor('REDESIGN', 'create website', 'CREATE'), 3)
  assert.equal(analyzeIntent('Make my website look completely different', { hasSite: true }).type, 'DESIGN')
  const salonDirs = ['soft-luxury', 'minimal-luxury', 'editorial', 'wellness-zen', 'warm-retail', 'magazine']
  const boutiqueDirs = ['editorial', 'magazine', 'image-first', 'neo-minimal', 'brutalist', 'asymmetric']
  assert.ok(salonDirs.includes(designDirectionForCategory('Salon')))
  assert.ok(boutiqueDirs.includes(designDirectionForCategory('Boutique')))
})

test('scaffold writes reusable GetVia section components', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-contract-'))
  const business = businessJsonFrom({ profile, prompt: 'Make my salon look like a luxury fashion brand' })
  const result = await writeViteScaffold({ workspaceDir: dir, business, overwrite: true })
  assert.ok(result.written.includes('src/components/Hero.jsx'))
  assert.ok(result.written.includes('src/components/Contact.jsx'))
  assert.ok(result.written.includes('src/components/Feed.jsx'))
  const app = await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8')
  assert.match(app, /components\/Hero/)
  const contact = await fs.readFile(path.join(dir, 'src/components/Contact.jsx'), 'utf8')
  assert.match(contact, /submitGetviaEnquiry/)
  assert.match(contact, /WhatsApp/)
  const dna = buildDesignDna({
    explore: { chosen: { label: 'Editorial Luxury', direction: 'editorial', heroComposition: 'typographic-column', colorStrategy: { accent: '#111' } } },
    mode: 'REDESIGN',
    novelty: 4,
    category: 'Salon',
  })
  assert.equal(dna.visualDirection, 'Editorial Luxury')
  assert.equal(dna.novelty, 4)
  assert.equal(pickFact('', 'kept'), 'kept')
  assert.equal(functionalityFromProfile(profile).enquiry, true)
})
