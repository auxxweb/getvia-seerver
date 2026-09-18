import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyWebsiteState } from '../state/websiteState.schema.js'
import { hydrateSectionComponents, findSection } from '../mutations/hydrateComponents.js'
import { runWebsiteValidation, runPlaywrightValidation } from '../validation/runWebsiteValidation.js'
import { websiteStateToHtml } from '../validation/htmlSnapshot.js'

function designedState() {
  const state = emptyWebsiteState()
  state.sectionOrder = ['hero', 'about', 'services', 'contact', 'footer']
  state.sectionVisibility = { hero: true, about: true, services: true, contact: true, footer: true }
  state.content.landing = {
    bannerTitle: 'LaFemina',
    bannerDescription: 'Salon in Thrissur',
    bannerCtaLabel: 'Book Appointment',
    bannerCtaLink: '#contact',
  }
  state.settings.hasAiDesign = true
  state.seo = { title: 'LaFemina', description: 'Salon', canonical: 'https://getvia.in/profile/lafemina' }
  return hydrateSectionComponents(state)
}

test('designed drafts pass structural validation', () => {
  const report = runWebsiteValidation(designedState())
  assert.equal(report.passed, true)
  assert.ok(report.skipped.some((item) => item.type === 'PLAYWRIGHT_LAYOUT'))
})

test('duplicate section ids fail validation', () => {
  const state = designedState()
  state.sectionOrder = ['hero', 'about', 'hero', 'footer']
  const report = runWebsiteValidation(state)
  assert.equal(report.passed, false)
  assert.ok(report.errors.some((item) => item.type === 'DUPLICATE_SECTION' && item.sectionId === 'hero'))
})

test('button hash to a missing section is a dead-link warning', () => {
  const state = designedState()
  findSection(state, 'hero').components.push({
    id: 'hero-ghost-btn',
    type: 'button',
    props: { text: 'Ghost', href: '#missing-room' },
  })
  const report = runWebsiteValidation(state)
  assert.ok(report.warnings.some((item) => item.type === 'DEAD_LINK' && /missing-room/.test(item.message)))
})

test('Book Appointment hash to contact is not a dead link', () => {
  const state = designedState()
  findSection(state, 'hero').components.push({
    id: 'hero-book',
    type: 'button',
    props: { text: 'Book Appointment', href: '#contact', action: { type: 'scroll', target: 'contact' } },
  })
  const report = runWebsiteValidation(state)
  assert.equal(
    report.warnings.some((item) => item.type === 'DEAD_LINK' && item.componentId === 'hero-book'),
    false,
  )
})

test('designed hero without a heading is a warning', () => {
  const state = designedState()
  state.content.landing.bannerTitle = ''
  const heading = findSection(state, 'hero').components.find((row) => row.id === 'hero-heading')
  if (heading) heading.props.text = ''
  const report = runWebsiteValidation(state)
  assert.ok(report.warnings.some((item) => item.type === 'EMPTY_HERO'))
})

test('html snapshot includes heading and section ids', () => {
  const html = websiteStateToHtml(designedState())
  assert.match(html, /<h1>LaFemina<\/h1>/)
  assert.match(html, /id="hero"/)
  assert.match(html, /id="contact"/)
  assert.match(html, /viewport/)
})

test('playwright hook skips when AI_SKIP_PLAYWRIGHT=1', async () => {
  const previous = process.env.AI_SKIP_PLAYWRIGHT
  process.env.AI_SKIP_PLAYWRIGHT = '1'
  const result = await runPlaywrightValidation(designedState())
  if (previous == null) delete process.env.AI_SKIP_PLAYWRIGHT
  else process.env.AI_SKIP_PLAYWRIGHT = previous
  assert.equal(result.ran, false)
  assert.equal(result.skipped, true)
  assert.match(result.message, /opted out|AI_SKIP_PLAYWRIGHT/)
})

test('Playwright Chromium runs overflow checks on a website-state snapshot', async () => {
  const result = await runPlaywrightValidation(designedState(), { enabled: true })
  assert.equal(result.ran, true, result.message)
  assert.equal(result.skipped, false)
  assert.ok(Array.isArray(result.errors))
})
