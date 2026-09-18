import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyWebsiteState } from '../state/websiteState.schema.js'
import { hydrateSectionComponents, findSection, listButtons } from '../mutations/hydrateComponents.js'
import {
  interpretDesignerRequest,
  isFullWebsiteBuildPrompt,
} from '../mutations/interpretDesignerRequest.js'
import { executeChangeSet } from '../changeset/engine.js'
import { runWebsiteValidation } from '../validation/runWebsiteValidation.js'
import { planWebsiteHeuristic } from '../agents/plannerAgent.js'
import { analyzeRequirementsHeuristic } from '../agents/requirementAgent.js'
import { designAgent } from '../agents/designAgent.js'
import { contentOpsFromProfile } from '../agents/contentAgent.js'
import { stampProjectOnState } from '../state/projectMeta.js'

function salonState() {
  const state = emptyWebsiteState()
  state.sectionOrder = ['hero', 'about', 'services', 'gallery', 'contact', 'footer']
  state.sectionVisibility = {
    hero: true,
    about: true,
    services: true,
    gallery: true,
    contact: true,
    footer: true,
  }
  state.content.landing = {
    bannerTitle: 'LaFemina',
    bannerDescription: 'Salon in Thrissur',
    bannerCtaLabel: 'Get in touch',
    bannerCtaLink: '#contact',
  }
  state.content.coreServices = {
    title: 'Services',
    items: [{ id: 's1', title: 'Haircut' }],
  }
  state.settings.hasAiDesign = true
  return hydrateSectionComponents(state)
}

function run(prompt, state = salonState(), selectedElement = { site: true }) {
  const interpreted = interpretDesignerRequest({
    prompt,
    selectedElement,
    state,
    profile: { identity: { name: 'LaFemina', category: 'Beauty Salon' } },
  })
  const applied = interpreted.operations.length
    ? executeChangeSet(state, { operations: interpreted.operations, baseRevision: 10 })
    : { ok: false, state, applied: [], errors: [] }
  return { interpreted, applied }
}

function buildFromBrief(prompt, profile) {
  const requirements = analyzeRequirementsHeuristic(prompt, profile)
  const plan = planWebsiteHeuristic({ profile, requirements })
  const state = stampProjectOnState(emptyWebsiteState())
  const design = designAgent({ plan, state, requirements })
  const content = contentOpsFromProfile(profile, requirements)
  const applied = executeChangeSet(state, { operations: [...design.operations, ...content] })
  return { requirements, plan, applied }
}

const GOSSIP_BRIEF =
  'Create a modern and stylish website for my clothing store called Gossip Store. Make it premium, trendy and attractive to young fashion customers.'
const LAFEMINA_BRIEF =
  'Create a modern, elegant and premium website for my salon LaFemina. Use my GetVia business profile information.'

test('Gossip Store create brief is a real website build, not chat', () => {
  assert.equal(isFullWebsiteBuildPrompt(GOSSIP_BRIEF), true)
  const profile = {
    identity: { name: 'Gossip Store', category: 'Clothing Store', description: 'Trendy fashion in Perinthalmanna' },
    location: { city: 'Perinthalmanna' },
    content: { catalogue: [{ id: 'p1', name: 'Party dress' }] },
  }
  const { plan, applied } = buildFromBrief(GOSSIP_BRIEF, profile)
  assert.equal(applied.ok, true)
  assert.equal(applied.state.engine, 'ai')
  assert.equal(applied.state.settings.framework, 'react')
  assert.equal(applied.state.settings.bundler, 'vite')
  assert.ok(plan.sections.some((s) => s.type === 'hero'))
  assert.ok(applied.state.sectionOrder.includes('hero'))
  assert.ok(applied.state.sectionOrder.includes('contact'))
  assert.equal(applied.state.content.landing.bannerTitle, 'Gossip Store')
  assert.ok(applied.state.theme?.colors)
  const report = runWebsiteValidation(applied.state)
  assert.equal(report.passed, true)
})

test('LaFemina create brief is a real website build', () => {
  assert.equal(isFullWebsiteBuildPrompt(LAFEMINA_BRIEF), true)
  const profile = {
    identity: { name: 'LaFemina', category: 'Beauty Salon', description: 'Bridal and hair care in Thrissur' },
    location: { city: 'Thrissur' },
    content: { coreServices: [{ id: '1', title: 'Haircut' }] },
  }
  const { applied } = buildFromBrief(LAFEMINA_BRIEF, profile)
  assert.equal(applied.ok, true)
  assert.equal(applied.state.settings.framework, 'react')
  assert.equal(applied.state.settings.bundler, 'vite')
  assert.equal(applied.state.content.landing.bannerTitle, 'LaFemina')
  assert.ok(applied.state.sectionOrder.includes('services') || applied.state.sectionOrder.includes('hero'))
  assert.equal(runWebsiteValidation(applied.state).passed, true)
})

test('TEST 1 heading mutation is UPDATE_TEXT and visible in state', () => {
  const { interpreted, applied } = run('Change the hero heading to Beauty That Makes You Feel Beautiful.')
  assert.ok(interpreted.operations.some((op) => op.type === 'UPDATE_TEXT'))
  assert.equal(applied.ok, true)
  assert.equal(findSection(applied.state, 'hero').components.find((c) => c.id === 'hero-heading').props.text, 'Beauty That Makes You Feel Beautiful')
})

test('TEST 2 Book Appointment is ADD_COMPONENT', () => {
  const { interpreted, applied } = run('Add a Book Appointment button to the hero.')
  assert.ok(interpreted.operations.some((op) => op.type === 'ADD_COMPONENT'))
  assert.equal(applied.ok, true)
  const added = listButtons(applied.state, 'hero').find((b) => /book appointment/i.test(b.props.text))
  assert.ok(added)
  assert.equal(added.props.href, '#contact')
  assert.equal(added.props.action?.target, 'contact')
})

test('TEST 3 button text becomes Book Now', () => {
  const withBtn = run('Add a Book Appointment button to the hero.')
  const { applied } = run('Change the button text to Book Now.', withBtn.applied.state)
  assert.equal(applied.ok, true)
  assert.ok(listButtons(applied.state, 'hero').some((b) => b.props.text === 'Book Now'))
})

test('TEST 4 gold button is UPDATE_STYLE', () => {
  const withBtn = run('Add a Book Appointment button to the hero.')
  const { interpreted, applied } = run('Make the button gold.', withBtn.applied.state)
  assert.ok(interpreted.operations.some((op) => op.type === 'UPDATE_STYLE'))
  assert.equal(applied.ok, true)
  assert.ok(listButtons(applied.state, 'hero').some((b) => b.props.variant === 'gold' || b.props.background === '#D4AF37'))
})

test('TEST 5 button opens the booking/contact section', () => {
  const withBtn = run('Add a Book Appointment button to the hero.')
  const { interpreted, applied } = run('Make the button open the booking section.', withBtn.applied.state)
  assert.ok(interpreted.operations.some((op) => op.type === 'UPDATE_LINK'))
  assert.equal(applied.ok, true)
  assert.ok(listButtons(applied.state, 'hero').some((b) => String(b.props.href).includes('contact')))
})

test('TEST 6 services move above about', () => {
  const { interpreted, applied } = run('Move the services section above the about section.')
  assert.ok(interpreted.operations.some((op) => op.type === 'REORDER_SECTION'))
  assert.equal(applied.ok, true)
  assert.ok(applied.state.sectionOrder.indexOf('services') < applied.state.sectionOrder.indexOf('about'))
})

test('TEST 7 glassmorphism restyles the site', () => {
  const { interpreted, applied } = run('Transform the entire website into glassmorphism.')
  assert.ok(interpreted.operations.some((op) => op.type === 'UPDATE_THEME' || op.type === 'UPDATE_STYLE'))
  assert.equal(applied.ok, true)
  assert.equal(applied.state.theme.look, 'glassmorphism')
})

test('TEST 8 premium luxury salon look is a global design change', () => {
  const { interpreted, applied } = run('Make the website look like a premium luxury salon.')
  assert.ok(interpreted.operations.length)
  assert.equal(applied.ok, true)
  assert.ok(applied.state.theme.look === 'premium' || applied.state.theme.preset === 'premium' || applied.state.theme.colors.accent)
})

test('TEST 9 mobile request writes responsive styles', () => {
  const { interpreted, applied } = run('Make the website perfect on mobile.')
  assert.ok(interpreted.operations.some((op) => op.type === 'UPDATE_RESPONSIVE_STYLE'))
  assert.equal(applied.ok, true)
  const report = runWebsiteValidation(applied.state)
  assert.equal(report.viewports.includes(390), true)
  assert.equal(report.passed, true)
})

test('CRITICAL multi-action Shop New Arrivals is not conversational', () => {
  const clothing = salonState()
  clothing.sectionOrder = ['hero', 'about', 'products', 'contact', 'footer']
  clothing.sectionVisibility.products = true
  clothing.content.catalogue = { title: 'New Arrivals', items: [{ id: 'p1', name: 'Dress' }] }
  const { interpreted, applied } = run(
    "Make the hero section more attractive and put a strong 'Shop New Arrivals' button.",
    hydrateSectionComponents(clothing),
  )
  const types = interpreted.operations.map((op) => op.type)
  assert.ok(types.includes('UPDATE_STYLE'))
  assert.ok(types.includes('ADD_COMPONENT'))
  assert.equal(applied.ok, true)
  assert.ok(listButtons(applied.state, 'hero').some((b) => /shop new arrivals/i.test(b.props.text)))
})
