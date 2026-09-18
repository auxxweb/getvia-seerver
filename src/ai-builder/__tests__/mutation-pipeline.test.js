import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyWebsiteState } from '../state/websiteState.schema.js'
import { hydrateSectionComponents, findSection, listButtons } from '../mutations/hydrateComponents.js'
import { interpretDesignerRequest } from '../mutations/interpretDesignerRequest.js'
import { executeChangeSet } from '../changeset/engine.js'
import { addComponent, applyMutationOperation } from '../mutations/componentEngine.js'
import { designerAgent } from '../agents/designerAgent.js'
import { resolveTarget } from '../mutations/targetResolver.js'
import { isAllowedComponentType } from '../state/componentRegistry.js'
import { websiteStateToHtml } from '../validation/htmlSnapshot.js'

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
  state.settings.hasAiDesign = true
  return hydrateSectionComponents(state)
}

function applyPrompt(prompt, state = salonState()) {
  const interpreted = interpretDesignerRequest({
    prompt,
    selectedElement: { site: true },
    state,
    profile: { identity: { name: 'LaFemina', category: 'Beauty Salon' } },
  })
  const previousRevision = 10
  const applied = interpreted.operations.length
    ? executeChangeSet(state, { operations: interpreted.operations, baseRevision: previousRevision })
    : { ok: false, state, applied: [], code: 'NO_CHANGE_APPLIED' }
  return { interpreted, applied, previousRevision, newRevision: previousRevision + (applied.ok ? 1 : 0) }
}

test('CHECK 1-4 Book Appointment is ADD_COMPONENT on home.hero and persisted in state', async () => {
  let modelCalled = false
  const agent = await designerAgent({
    prompt: 'Add a Book Appointment button to the hero.',
    selectedElement: { site: true },
    currentState: salonState(),
    completeJsonFn: async () => {
      modelCalled = true
      return {
        ok: true,
        data: {
          operations: [{ type: 'UPDATE_STYLE', target: { site: true }, changes: { visualStyle: 'original' } }],
        },
      }
    },
  })
  assert.equal(modelCalled, false, 'heuristic ADD_COMPONENT must not be sent to the model')
  assert.ok(agent.operations.some((op) => op.type === 'ADD_COMPONENT'))
  const add = agent.operations.find((op) => op.type === 'ADD_COMPONENT')
  assert.equal(add.target.pageId, 'home')
  assert.equal(add.target.sectionId, 'hero')
  assert.equal(add.component.type, 'button')
  assert.match(add.component.props.text, /book appointment/i)
  assert.equal(isAllowedComponentType('hero', 'button'), true)

  const applied = executeChangeSet(salonState(), { operations: agent.operations })
  assert.equal(applied.ok, true)
  assert.ok(applied.applied.length >= 1)
  const button = listButtons(applied.state, 'hero').find((b) => /book appointment/i.test(b.props.text))
  assert.ok(button)
  assert.equal(button.props.href, '#contact')
  const html = websiteStateToHtml(applied.state)
  assert.match(html, /Book Appointment/)
})

test('CHECK 3 hero already has a primary button; add creates a second visible button', () => {
  const before = listButtons(salonState(), 'hero')
  assert.ok(before.length >= 1)
  const { applied } = applyPrompt('Add a Book Appointment button to the hero.')
  assert.equal(applied.ok, true)
  const buttons = listButtons(applied.state, 'hero')
  assert.ok(buttons.length > before.length)
  assert.ok(buttons.some((b) => /book appointment/i.test(b.props.text)))
})

test('addComponent works when pages are missing (theme-only drafts)', () => {
  const state = emptyWebsiteState()
  delete state.pages
  state.sectionOrder = ['hero', 'contact', 'footer']
  const result = addComponent(state, {
    sectionId: 'hero',
    componentType: 'button',
    props: { text: 'Book Appointment', href: '#contact' },
  })
  assert.equal(result.ok, true)
  assert.ok(listButtons(result.state, 'hero').some((b) => b.props.text === 'Book Appointment'))
})

test('LLM-style invalid extra op does not roll back ADD_COMPONENT', () => {
  const applied = executeChangeSet(salonState(), {
    operations: [
      {
        type: 'ADD_COMPONENT',
        target: { pageId: 'home', sectionId: 'hero' },
        component: { type: 'button', props: { text: 'Book Appointment', href: '#contact' } },
      },
      { type: 'ADD_COMPONENT', target: { sectionId: 'hero' }, component: { type: 'spaceship', props: {} } },
    ],
  })
  assert.equal(applied.ok, true)
  assert.ok(listButtons(applied.state, 'hero').some((b) => /book appointment/i.test(b.props.text)))
})

test('no-op change set is NO_CHANGE_APPLIED and does not keep skipped-only success', () => {
  const applied = executeChangeSet(salonState(), {
    operations: [{ type: 'ADD_COMPONENT', target: { sectionId: 'missing-room' }, component: { type: 'button', props: { text: 'Ghost' } } }],
  })
  assert.equal(applied.ok, false)
  assert.equal(applied.code, 'NO_CHANGE_APPLIED')
})

test('CHECK 1 heading mutation writes Website State', () => {
  const { interpreted, applied } = applyPrompt('Change the hero heading to Beauty That Makes You Feel Beautiful.')
  assert.ok(interpreted.operations.some((op) => op.type === 'UPDATE_TEXT'))
  assert.equal(applied.ok, true)
  assert.equal(
    findSection(applied.state, 'hero').components.find((c) => c.id === 'hero-heading').props.text,
    'Beauty That Makes You Feel Beautiful',
  )
})

test('CHECK 3 change hero button text to Book Now', () => {
  const withBtn = applyPrompt('Add a Book Appointment button to the hero.')
  const { interpreted, applied } = applyPrompt('Change the hero button text to Book Now.', withBtn.applied.state)
  assert.ok(interpreted.operations.some((op) => op.type === 'UPDATE_TEXT' || op.type === 'UPDATE_BUTTON'))
  assert.equal(applied.ok, true)
  assert.ok(listButtons(applied.state, 'hero').some((b) => /book now/i.test(b.props.text)))
})

test('CHECK 13 multi-action heading, button, gold, premium', () => {
  const { interpreted, applied } = applyPrompt(
    'Make the hero premium, change the heading, add a Book Appointment button, and make the button gold.',
  )
  const types = interpreted.operations.map((op) => op.type)
  assert.ok(types.includes('ADD_COMPONENT'))
  assert.ok(types.includes('UPDATE_TEXT') || types.includes('UPDATE_STYLE'))
  assert.equal(applied.ok, true)
  assert.ok(listButtons(applied.state, 'hero').some((b) => /book appointment/i.test(b.props.text)))
})

test('CHECK 14 Move services above about changes sectionOrder', () => {
  const { applied } = applyPrompt('Move the services section above the about section.')
  assert.equal(applied.ok, true)
  const order = applied.state.sectionOrder
  assert.ok(order.indexOf('services') < order.indexOf('about'))
})

test('CHECK 15 glassmorphism writes look that the renderer keys off', () => {
  const { applied } = applyPrompt('Transform the entire website into glassmorphism.')
  assert.equal(applied.ok, true)
  assert.equal(applied.state.theme.look, 'glassmorphism')
  assert.equal(applied.state.theme.layout?.hero, 'overlay-panel')
  assert.equal(applied.state.theme.layout?.cards, 'bento')
})

test('CHECK 2 hero from prompt resolves to home.hero', () => {
  const target = resolveTarget({
    prompt: 'Add a Book Appointment button to the hero.',
    selectedElement: { sectionId: 'about' },
    state: salonState(),
  })
  assert.equal(target.pageId, 'home')
  assert.equal(target.sectionId, 'hero')
})

test('applyMutationOperation ADD_COMPONENT generates an id and inserts', () => {
  const result = applyMutationOperation(salonState(), {
    type: 'ADD_COMPONENT',
    target: { pageId: 'home', sectionId: 'hero' },
    component: { type: 'button', props: { text: 'Shop New Arrivals', href: '#new-arrivals' } },
  })
  assert.equal(result.ok, true)
  const added = listButtons(result.state, 'hero').find((b) => /shop new arrivals/i.test(b.props.text))
  assert.ok(added?.id)
})
