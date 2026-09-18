import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createAgentRuntime } from '../runtime.js'
import { createLLMRouter, FakeProvider } from '../llm/index.js'
import { AGENT_RUNTIME_PHASE } from '../index.js'
import {
  fromGetviaToolResult,
  loadBusinessProfile,
  clearBusinessProfileCache,
  CACHE_TTL_MS,
} from '../getvia/adapter.js'
import { normalizeBusinessProfile } from '../getvia/profile.js'
import { businessJsonFromProfile, assertNoFabrication, sectionsFromProfile } from '../getvia/workspaceData.js'
import { runGetviaWebsiteJob } from '../getvia/job.js'
import { assertProductionGuards, withTimeout } from '../getvia/production.js'
import { isAgentRuntimeEnabled } from '../../src/ai-builder/runtimeFlags.js'

const TMP = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp')

function gossipGirlsGetviaPayload() {
  return {
    identity: {
      name: 'Gossip Girls',
      category: 'Salon',
      subcategory: 'Hair',
      description: 'A color studio for lived-in blondes and brunettes.',
      logo: 'https://cdn.example/gossip-girls/logo.png',
    },
    location: {
      formattedAddress: '12 Church Street, Bengaluru',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
    },
    contact: {
      phone: '+91 98765 43210',
      email: 'hello@gossipgirls.example',
      whatsappHref: 'https://wa.me/919876543210',
      socialLinks: { instagram: 'https://instagram.com/gossipgirls.example' },
    },
    openingHours: [{ day: 'Tue–Sun', open: '10:00', close: '20:00' }],
    content: {
      landing: { welcomeDescription: 'Color, cuts, and conversation.' },
      coreServices: [{ title: 'Lived-in color', description: 'Soft, grown-out color' }],
      catalogue: [{ name: 'Gloss treatment', description: 'Shine service', price: '1800' }],
      offers: [{ title: 'New guest gloss', description: 'First-visit gloss' }],
      gallery: ['https://cdn.example/gossip-girls/1.jpg'],
    },
    reviews: { recent: [{ rating: 5, comment: 'Best color in town.' }] },
    assets: {
      logo: { url: 'https://cdn.example/gossip-girls/logo.png' },
      images: ['https://cdn.example/gossip-girls/1.jpg'],
    },
    plan: { planName: 'secret-plan', aiRemaining: 9 },
    raw: { business: { ownerSecret: 'do-not-leak', mongoUri: 'mongodb://secret' }, content: { _id: 'abc' } },
  }
}

function sparseGetviaPayload() {
  return {
    identity: { name: 'Sparse Studio', description: 'A quiet listing with almost no public facts.' },
    location: {},
    contact: { socialLinks: {} },
    openingHours: [],
    content: { landing: {}, coreServices: [], catalogue: [], offers: [], gallery: [] },
    reviews: { recent: [] },
    assets: { images: [] },
    raw: { business: { apiKey: 'sk-test' } },
  }
}

function runtime() {
  return createAgentRuntime({
    llm: createLLMRouter({ providers: [new FakeProvider()] }),
  })
}

async function withIsolatedNpm(fn) {
  const previous = process.env.AI_ISOLATED_RUNTIME
  const skip = process.env.AI_SKIP_WORKSPACE_NPM
  process.env.AI_ISOLATED_RUNTIME = '1'
  delete process.env.AI_SKIP_WORKSPACE_NPM
  try {
    return await fn()
  } finally {
    if (previous == null) delete process.env.AI_ISOLATED_RUNTIME
    else process.env.AI_ISOLATED_RUNTIME = previous
    if (skip == null) delete process.env.AI_SKIP_WORKSPACE_NPM
    else process.env.AI_SKIP_WORKSPACE_NPM = skip
  }
}

async function tmpDir(prefix) {
  await fs.mkdir(TMP, { recursive: true })
  return fs.mkdtemp(path.join(TMP, prefix))
}

test('Phase 7 flags are set and the live queue stays off by default', () => {
  assert.equal(AGENT_RUNTIME_PHASE, 8)
  assert.equal(isAgentRuntimeEnabled(), false)
})

test('adapter maps GetVia payload to BusinessProfile and drops raw Mongo', () => {
  const payload = gossipGirlsGetviaPayload()
  const profile = fromGetviaToolResult(payload)
  assert.equal(profile.name, 'Gossip Girls')
  assert.match(profile.description, /color studio/i)
  assert.equal(profile.logo, 'https://cdn.example/gossip-girls/logo.png')
  assert.ok(profile.images.includes('https://cdn.example/gossip-girls/1.jpg'))
  assert.equal(profile.address, '12 Church Street, Bengaluru')
  assert.equal(profile.location.city, 'Bengaluru')
  assert.equal(profile.phone, '+91 98765 43210')
  assert.equal(profile.whatsapp, 'https://wa.me/919876543210')
  assert.equal(profile.email, 'hello@gossipgirls.example')
  assert.match(profile.hours, /Tue/)
  assert.equal(profile.socialLinks.instagram, 'https://instagram.com/gossipgirls.example')
  assert.ok(profile.categories.includes('Salon'))
  assert.equal(profile.services[0].name, 'Lived-in color')
  assert.equal(profile.products[0].name, 'Gloss treatment')
  assert.equal(profile.offers[0].name, 'New guest gloss')
  assert.equal(profile.reviews[0].quote, 'Best color in town.')
  assert.equal(profile.reviews[0].name, undefined)
  const dumped = JSON.stringify(profile)
  assert.equal(profile.raw, undefined)
  assert.doesNotMatch(dumped, /ownerSecret|mongoUri|secret-plan|do-not-leak/)
  assert.ok(payload.raw.business.ownerSecret, 'adapter must not mutate the GetVia payload')
})

test('missing GetVia facts are omitted, never fabricated', () => {
  const profile = fromGetviaToolResult(sparseGetviaPayload())
  assert.equal(profile.name, 'Sparse Studio')
  assert.equal(profile.phone, '')
  assert.equal(profile.whatsapp, '')
  assert.equal(profile.address, '')
  assert.equal(profile.hours, '')
  assert.deepEqual(profile.products, [])
  assert.deepEqual(profile.offers, [])
  assert.deepEqual(profile.reviews, [])
  assert.ok(profile.missing.includes('phone'))
  assert.ok(profile.missing.includes('reviews'))
  const json = businessJsonFromProfile(profile)
  assert.equal(json.phone, undefined)
  assert.equal(json.whatsapp, undefined)
  assert.equal(json.address, undefined)
  assert.equal(json.hours, undefined)
  assert.equal(json.products, undefined)
  assert.equal(json.offers, undefined)
  assert.equal(json.reviews, undefined)
  assert.ok(!json.sections.includes('reviews'))
  assert.ok(!json.sections.includes('offers'))
  assert.ok(!json.sections.includes('contact'))
  assert.deepEqual(assertNoFabrication(profile, json), { ok: true, issues: [] })
  assert.ok(profile.placeholders.some((row) => row.field === 'phone' && /GetVia listing/.test(row.message)))
})

test('loadBusinessProfile caches, maps 403, and reports API failures', async () => {
  clearBusinessProfileCache()
  let calls = 0
  const fetchProfile = async () => {
    calls += 1
    return gossipGirlsGetviaPayload()
  }
  const first = await loadBusinessProfile({ businessId: 'biz1', ownerId: 'owner1', fetchProfile, now: 1_000 })
  const second = await loadBusinessProfile({
    businessId: 'biz1',
    ownerId: 'owner1',
    fetchProfile,
    now: 1_000 + CACHE_TTL_MS - 1,
  })
  assert.equal(first.ok, true)
  assert.equal(second.cached, true)
  assert.equal(calls, 1)

  const forbidden = await loadBusinessProfile({
    businessId: 'biz2',
    ownerId: 'owner1',
    fetchProfile: async () => {
      const err = new Error('Not your business')
      err.status = 403
      throw err
    },
  })
  assert.equal(forbidden.ok, false)
  assert.equal(forbidden.errorType, 'FORBIDDEN')

  const unauth = await loadBusinessProfile({ businessId: 'biz3' })
  assert.equal(unauth.errorType, 'UNAUTHORIZED')

  const down = await loadBusinessProfile({
    businessId: 'biz4',
    ownerId: 'owner1',
    fetchProfile: async () => {
      throw new Error('ECONNRESET')
    },
  })
  assert.equal(down.errorType, 'API_FAILURE')
})

test('production guards cover auth, permissions, secrets path, and timeouts', async () => {
  const auth = assertProductionGuards({})
  assert.equal(auth.ok, false)
  assert.ok(auth.issues.some((row) => row.type === 'authentication'))
  const home = assertProductionGuards({
    userId: 'u1',
    projectId: 'p1',
    businessId: 'b1',
    workspaceDir: process.env.HOME,
  })
  assert.ok(home.issues.some((row) => row.type === 'permissions'))
  const timed = await withTimeout(new Promise(() => {}), 20).then(
    () => null,
    (err) => err,
  )
  assert.equal(timed.code, 'TIMEOUT')
})

test('Create a modern website for Gossip Girls using the Getvia business profile', async () => {
  const dir = await tmpDir('getvia-')
  const payload = gossipGirlsGetviaPayload()
  const result = await withIsolatedNpm(() =>
    runGetviaWebsiteJob({
      userId: 'user1',
      projectId: 'site1',
      businessId: 'biz1',
      workspaceDir: dir,
      keepPreview: false,
      runtime: runtime(),
      profile: payload,
      prompt: 'Create a modern website for Gossip Girls using the Getvia business profile.',
    }),
  )
  assert.equal(result.ok, true, result.message)
  assert.equal(result.intent, 'CREATE')
  assert.equal(result.profile.name, 'Gossip Girls')
  assert.equal(result.profile.raw, undefined)
  assert.ok(result.design?.spec?.direction)
  assert.ok(result.build?.ok)
  assert.ok(result.review?.ok)
  assert.ok(result.stages.includes('OBSERVE'))
  assert.ok(result.stages.includes('THINK'))
  assert.ok(result.stages.includes('ACT'))
  assert.ok(result.stages.includes('VERIFY'))
  assert.deepEqual(result.pipeline, [
    'getvia',
    'profile',
    'design',
    'implementation',
    'build',
    'preview',
    'browserQA',
    'visualQA',
    'review',
  ])
  if (result.browser?.ran) assert.equal(result.browser.passed, true)
  else assert.equal(result.browser?.skipped, true)

  const json = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
  const app = await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8')
  const design = JSON.parse(await fs.readFile(path.join(dir, 'src/data/design.json'), 'utf8'))
  assert.equal(json.name, 'Gossip Girls')
  assert.equal(json.phone, '+91 98765 43210')
  assert.equal(json.address, '12 Church Street, Bengaluru')
  assert.equal(json.services[0].name, 'Lived-in color')
  assert.equal(json.offers[0].name, 'New guest gloss')
  assert.equal(json.reviews[0].quote, 'Best color in town.')
  assert.match(app, /business\.name/)
  assert.ok(json.sections.includes('hours'))
  assert.ok(json.sections.includes('offers'))
  assert.doesNotMatch(app, /Contact us/)
  assert.ok(design.direction)
  assert.deepEqual(assertNoFabrication(normalizeBusinessProfile(result.profile), json), { ok: true, issues: [] })
  assert.ok(sectionsFromProfile(result.profile).includes('reviews'))
})

test('sparse GetVia listings omit contact, hours, offers, and reviews in the generated site', async () => {
  const dir = await tmpDir('sparse-')
  const result = await withIsolatedNpm(() =>
    runGetviaWebsiteJob({
      userId: 'user1',
      projectId: 'site2',
      businessId: 'biz2',
      workspaceDir: dir,
      keepPreview: false,
      runtime: runtime(),
      profile: sparseGetviaPayload(),
      prompt: 'Create a modern website for Sparse Studio using the Getvia business profile.',
    }),
  )
  assert.equal(result.ok, true, result.message)
  const json = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
  assert.equal(json.phone, undefined)
  assert.equal(json.reviews, undefined)
  assert.equal(json.offers, undefined)
  assert.equal(json.hours, undefined)
  assert.ok(!json.sections.includes('reviews'))
  assert.ok(!json.sections.includes('offers'))
  assert.ok(!json.sections.includes('hours'))
  assert.ok(!json.sections.includes('contact'))
  assert.doesNotMatch(JSON.stringify(json), /tel:|\+91|wa\.me/)
})

test('job fails closed on API errors without inventing a listing', async () => {
  const dir = await tmpDir('fail-')
  const result = await runGetviaWebsiteJob({
    userId: 'user1',
    projectId: 'site3',
    businessId: 'biz3',
    workspaceDir: dir,
    keepPreview: false,
    runtime: runtime(),
    prompt: 'Create a modern website.',
    fetchProfile: async () => {
      throw new Error('upstream timeout')
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'API_FAILURE')
  assert.equal(result.profile.name, '')
})
