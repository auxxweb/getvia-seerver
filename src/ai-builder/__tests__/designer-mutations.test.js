import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyWebsiteState } from '../state/websiteState.schema.js'
import { hydrateSectionComponents, findSection, listButtons } from '../mutations/hydrateComponents.js'
import {
  analyzeUserPrompt,
  interpretDesignerRequest,
  isDesignerMutationPrompt,
  isFullWebsiteBuildPrompt,
  isLocalEditPrompt,
  isSiteWideChangePrompt,
  normalizeDesignerOperations,
} from '../mutations/interpretDesignerRequest.js'
import { executeChangeSet } from '../changeset/engine.js'
import { validateChangeSet, isExecutableOperation } from '../state/changeSet.schema.js'
import { applyMutationOperation } from '../mutations/componentEngine.js'
import { MUTATION_OPERATIONS } from '../constants.js'

function clothingState() {
  const state = emptyWebsiteState()
  state.sectionOrder = ['hero', 'about', 'offers', 'products', 'contact', 'footer']
  state.sectionVisibility = {
    hero: true,
    about: true,
    offers: true,
    products: true,
    contact: true,
    footer: true,
  }
  state.content.landing = {
    bannerTitle: 'Gossip Store',
    bannerDescription: 'Fashion in Perinthalmanna',
    bannerCtaLabel: 'Shop Now',
    bannerCtaLink: '#contact',
  }
  state.content.catalogue = {
    title: 'New Arrivals',
    items: [{ id: 'p1', name: 'Party dress', title: 'Party dress' }],
  }
  state.content.offers = {
    title: 'Featured Collections',
    items: [{ id: 'o1', title: 'Festive set' }],
  }
  return hydrateSectionComponents(state)
}

function run(prompt, state = clothingState(), selectedElement = { site: true }) {
  const interpreted = interpretDesignerRequest({ prompt, selectedElement, state })
  const applied = interpreted.operations.length
    ? executeChangeSet(state, { operations: interpreted.operations, baseRevision: 10 })
    : { ok: false, state, applied: [], errors: [] }
  return { interpreted, applied }
}

const LAFEMINA_BRIEF = `Use this as the first AI website-building prompt for the salon: Create a beautiful, modern, and premium website for my salon called LaFemina. The website should feel elegant, feminine, luxurious, welcoming, and professional. Create a homepage with: * Premium hero section * About LaFemina * Our beauty and salon services * Featured services * Hair services * Hair spa and treatments * Bridal and makeup services * Beauty and skincare services * Special offers * Photo gallery * Customer reviews * Instagram/social media section * Location and opening hours * Contact section * WhatsApp button * Call button * Booking/enquiry button * Beautiful footer Use the existing GetVia salon template and customize it specifically for LaFemina.`

test('create-site briefs are not treated as designer mutations', () => {
  assert.equal(isDesignerMutationPrompt('Create a modern premium clothing website for Gossip Store.'), false)
  assert.equal(isDesignerMutationPrompt('Make the website black, white and gold.'), true)
  assert.equal(isDesignerMutationPrompt('Add a Shop New Arrivals button to the hero.'), true)
})

test('layout and card-design prompts are not asked to pick a section', () => {
  const prompt =
    'Change the layout structure, component design and card design of the whole website. Make the hero split and the service cards more premium.'
  assert.equal(isSiteWideChangePrompt(prompt), true)
  const { interpreted, applied } = run(prompt, clothingState(), { sectionId: 'hero' })
  assert.notEqual(interpreted.outcome, 'NEEDS_CLARIFICATION')
  assert.ok(interpreted.operations.length)
  assert.equal(applied.ok, true)
  assert.ok(applied.state.theme.layout?.cards || applied.state.theme.look)
})

test('descriptive prompts never ask which part of the site to change', () => {
  const prompts = [
    'Change the layout structure, component design and card design',
    'Make everything more premium with better cards and a stronger hero',
    'Transform the look of the page with modern cards and spacing',
    'I already described the whole website: better layout, card design, and component style',
  ]
  for (const prompt of prompts) {
    const { interpreted, applied } = run(prompt, clothingState(), {})
    assert.notEqual(interpreted.outcome, 'NEEDS_CLARIFICATION', prompt)
    assert.ok(interpreted.operations.length, prompt)
    assert.equal(applied.ok, true, prompt)
    assert.doesNotMatch(interpreted.message || '', /which part of the site/)
  }
})

test('prompt analysis covers design, theme, layout, components, and content', () => {
  const theme = analyzeUserPrompt('Make the website black and gold')
  assert.equal(theme.local, false)
  assert.ok(theme.sendToAi)
  assert.ok(theme.domains.includes('theme'))
  assert.ok(theme.requirements.some((r) => r.kind === 'theme'))
  assert.ok(theme.suggestions.length)

  const layout = analyzeUserPrompt('Change the layout structure and card design')
  assert.equal(layout.local, false)
  assert.ok(layout.domains.includes('layout') || layout.domains.includes('design'))
  assert.ok(layout.requirements.some((r) => r.kind === 'layout' || r.kind === 'design'))

  const section = analyzeUserPrompt('Add a reviews section')
  assert.equal(section.local, false)
  assert.ok(section.requirements.some((r) => r.kind === 'add_section' && r.sectionId === 'reviews'))
  const added = run('Add a reviews section')
  assert.ok(added.interpreted.operations.some((op) => op.type === 'ADD_SECTION' && op.sectionType === 'reviews'))
  assert.equal(added.applied.ok, true)
  assert.ok(added.applied.state.sectionOrder.includes('reviews'))

  const content = analyzeUserPrompt('Rewrite the about section copy')
  assert.equal(content.local, false)
  assert.ok(content.domains.includes('content'))
  assert.equal(content.sendToAi, true)

  const cardsGold = analyzeUserPrompt('Make the cards gold')
  assert.equal(cardsGold.local, false)
  assert.equal(cardsGold.sendToAi, true)
  assert.ok(!cardsGold.requirements.some((r) => r.kind === 'text_color'))
})

test('text colour and remove-label prompts stay local and match the request', () => {
  const colorPrompt = 'LaFemina text colour should be white'
  assert.equal(isLocalEditPrompt(colorPrompt), true)
  assert.equal(isSiteWideChangePrompt(colorPrompt), false)
  const analysis = analyzeUserPrompt(colorPrompt, { profile: { identity: { name: 'LaFemina' } } })
  assert.equal(analysis.local, true)
  assert.ok(analysis.requirements.some((r) => r.kind === 'text_color' && r.color === '#FFFFFF'))
  const { interpreted, applied } = run(colorPrompt, clothingState(), { site: true })
  assert.notEqual(interpreted.outcome, 'NEEDS_CLARIFICATION')
  assert.ok(interpreted.operations.some((op) => op.type === 'UPDATE_STYLE' && op.changes?.color === '#FFFFFF'))
  assert.ok(!interpreted.operations.some((op) => op.changes?.look && op.changes.look !== clothingState().theme?.look))
  assert.equal(applied.ok, true)
  const heading = findSection(applied.state, 'hero').components.find((c) => c.id === 'hero-heading')
  assert.equal(heading.props.color, '#FFFFFF')
  assert.equal(findSection(applied.state, 'hero').style.headingColor, '#FFFFFF')

  const removePrompt = 'remove the text One-page website'
  assert.equal(isLocalEditPrompt(removePrompt), true)
  const removed = run(removePrompt, applied.state, { site: true })
  assert.equal(removed.applied.ok, true)
  assert.ok(!removed.interpreted.operations.some((op) => op.changes?.layout || op.changes?.look === 'premium'))
})

test('prefixed full-site create briefs are website builds, not designer edits', () => {
  assert.equal(isFullWebsiteBuildPrompt(LAFEMINA_BRIEF), true)
  assert.equal(isFullWebsiteBuildPrompt('Create a modern one-page website'), true)
  assert.equal(
    isFullWebsiteBuildPrompt(
      'Do not rebuild. Keep the existing content. Build and verify a premium fashion homepage.',
    ),
    false,
  )
  assert.equal(isDesignerMutationPrompt(LAFEMINA_BRIEF), false)
  const interpreted = interpretDesignerRequest({ prompt: LAFEMINA_BRIEF, selectedElement: { sectionId: 'hero' } })
  assert.equal(interpreted.intent, 'WEBSITE_BUILD')
  assert.equal(interpreted.operations.length, 0)
})

test('LLM ADD_COMPONENT with a section name and null target becomes ADD_SECTION', () => {
  const { operations, skipped } = normalizeDesignerOperations([
    { type: 'UPDATE_STYLE', target: { pageId: 'home', sectionId: 'hero' }, changes: { visualStyle: 'premium' } },
    { type: 'ADD_COMPONENT', target: { pageId: 'home', sectionId: null }, component: 'about' },
    { type: 'ADD_COMPONENT', target: { pageId: 'home', sectionId: null }, component: 'gallery' },
    { type: 'UPDATE_THEME', target: { pageId: 'home', sectionId: null }, changes: { colorPalette: 'elegant', typography: 'premium' } },
    { type: 'UPDATE_LINK', target: { pageId: 'home', sectionId: 'contact' }, changes: { whatsappLink: 'functional', callLink: 'functional' } },
  ])
  assert.equal(skipped.length, 0)
  assert.ok(operations.some((op) => op.type === 'ADD_SECTION' && op.sectionType === 'about'))
  assert.ok(operations.some((op) => op.type === 'ADD_SECTION' && op.sectionType === 'gallery'))
  assert.ok(operations.every((op) => op.type !== 'ADD_COMPONENT'))
  const theme = operations.find((op) => op.type === 'UPDATE_THEME')
  assert.ok(theme.changes.colors.accent)
  const applied = executeChangeSet(clothingState(), { operations, baseRevision: 10 })
  assert.equal(applied.ok, true)
  assert.equal(applied.state.sectionVisibility.about, true)
  assert.equal(applied.state.sectionVisibility.gallery, true)
})

test('missing section target on ADD_COMPONENT defaults to hero instead of rolling back', () => {
  const state = clothingState()
  const out = executeChangeSet(state, {
    operations: [
      { type: 'UPDATE_TEXT', target: { sectionId: 'hero', componentId: 'hero-heading' }, value: 'Keep me' },
      { type: 'ADD_COMPONENT', target: { sectionId: null }, component: { type: 'button', props: { text: 'X' } } },
    ],
  })
  assert.equal(out.ok, true)
  assert.equal(findSection(out.state, 'hero').components.find((c) => c.id === 'hero-heading').props.text, 'Keep me')
  assert.ok(listButtons(out.state, 'hero').some((b) => b.props.text === 'X'))
})

test('theme: black and gold produces UPDATE_THEME and visible palette change', () => {
  const { interpreted, applied } = run('Make the website black and gold.')
  assert.ok(interpreted.operations.some((op) => op.type === 'UPDATE_THEME'))
  assert.equal(applied.ok, true)
  assert.equal(applied.state.theme.colors.accent, '#D4AF37')
  assert.ok(applied.applied.length)
})

test('hero text: heading mutation writes component and landing', () => {
  const { interpreted, applied } = run('Change the hero heading to Your Style. Your Story.')
  assert.ok(interpreted.operations.some((op) => op.type === 'UPDATE_TEXT'))
  assert.equal(applied.ok, true)
  const heading = findSection(applied.state, 'hero').components.find((c) => c.id === 'hero-heading')
  assert.equal(heading.props.text, 'Your Style. Your Story.')
  assert.equal(applied.state.content.landing.bannerTitle, 'Your Style. Your Story.')
})

test('add button: Shop New Arrivals is ADD_COMPONENT with scroll target', () => {
  const { interpreted, applied } = run('Add a Shop New Arrivals button to the hero.')
  assert.ok(interpreted.operations.some((op) => op.type === 'ADD_COMPONENT'))
  assert.equal(applied.ok, true)
  const buttons = listButtons(applied.state, 'hero')
  assert.ok(buttons.length >= 2)
  const added = buttons.find((b) => /shop new arrivals/i.test(b.props.text))
  assert.ok(added)
  assert.equal(added.props.href, '#new-arrivals')
  assert.equal(added.props.action?.type === 'SHOP_NEW_ARRIVALS' || added.props.action?.type === 'SCROLL_TO_SECTION', true)
})

test('button text: Shop Now becomes Shop New Arrivals', () => {
  const { applied } = run('Change Shop Now to Shop New Arrivals.')
  assert.equal(applied.ok, true)
  const buttons = listButtons(applied.state, 'hero')
  assert.ok(buttons.some((b) => b.props.text === 'Shop New Arrivals'))
})

test('button destination: scroll to New Arrivals', () => {
  const { interpreted, applied } = run('Make the button scroll to New Arrivals.')
  assert.ok(interpreted.operations.some((op) => op.type === 'UPDATE_LINK'))
  assert.equal(applied.ok, true)
  const buttons = listButtons(applied.state, 'hero')
  assert.ok(buttons.some((b) => String(b.props.href).includes('new-arrivals')))
})

test('reorder: New Arrivals before Featured Collections', () => {
  const { interpreted, applied } = run('Move New Arrivals above Featured Collections.')
  assert.ok(interpreted.operations.some((op) => op.type === 'REORDER_SECTION'))
  assert.equal(applied.ok, true)
  const order = applied.state.sectionOrder
  assert.ok(order.indexOf('products') < order.indexOf('offers'))
})

test('card design: product cards premium updates section style', () => {
  const { interpreted, applied } = run('Make the product cards more premium.')
  assert.ok(interpreted.operations.some((op) => op.type === 'UPDATE_STYLE'))
  assert.equal(applied.ok, true)
  const products = findSection(applied.state, 'products')
  assert.equal(products.style.visualStyle === 'premium' || products.style.cardStyle === 'premium', true)
})

test('hero attractive style mutation', () => {
  const { interpreted, applied } = run('Make the hero section more attractive.')
  assert.ok(interpreted.operations.some((op) => op.type === 'UPDATE_STYLE'))
  assert.equal(applied.ok, true)
  const hero = findSection(applied.state, 'hero')
  assert.equal(hero.style.visualStyle, 'premium')
  assert.equal(hero.style.height, 'tall')
})

test('mobile: hero button full width', () => {
  const { interpreted, applied } = run('Make the hero button full width on mobile.')
  assert.ok(interpreted.operations.some((op) => op.type === 'UPDATE_RESPONSIVE_STYLE'))
  assert.equal(applied.ok, true)
  const hero = findSection(applied.state, 'hero')
  assert.equal(hero.responsive.mobile.buttonFullWidth, true)
})

test('multi-action hero request emits several operations', () => {
  const { interpreted, applied } = run(
    "Make the hero more attractive and put a strong 'Shop New Arrivals' button.",
  )
  const types = interpreted.operations.map((op) => op.type)
  assert.ok(types.includes('UPDATE_STYLE'))
  assert.ok(types.includes('ADD_COMPONENT'))
  assert.equal(applied.ok, true)
  assert.ok(applied.applied.length >= 2)
})

test('gold button is UPDATE_STYLE on the button', () => {
  const withBtn = run('Add a Shop New Arrivals button to the hero.')
  const { interpreted, applied } = run('Make the button gold.', withBtn.applied.state)
  assert.ok(interpreted.operations.some((op) => op.type === 'UPDATE_STYLE'))
  assert.equal(applied.ok, true)
  const buttons = listButtons(applied.state, 'hero')
  assert.ok(buttons.some((b) => b.props.variant === 'gold' || b.props.background === '#D4AF37'))
})

test('unsupported capability does not mutate', () => {
  const before = clothingState()
  const { interpreted, applied } = run('Add a 3D product configurator.')
  assert.equal(interpreted.outcome, 'UNSUPPORTED_CAPABILITY')
  assert.equal(interpreted.operations.length, 0)
  assert.equal(applied.ok, false)
  assert.equal(before.content.landing.bannerTitle, clothingState().content.landing.bannerTitle)
})

test('claymorphism restyle is applied instead of being rejected as 3D', () => {
  const prompt = `Transform the entire LaFemina website into a modern claymorphism design.
Keep all existing business information, services, images, sections, buttons, and functionality, but completely change the visual style.
Use soft rounded shapes, smooth depth, subtle 3D effects, soft shadows, pastel tones, rounded cards, pill-shaped buttons, and a soft tactile appearance.`
  const { interpreted, applied } = run(prompt)
  assert.notEqual(interpreted.outcome, 'UNSUPPORTED_CAPABILITY')
  assert.ok(interpreted.operations.some((op) => op.type === 'UPDATE_THEME' && op.changes?.look === 'claymorphism'))
  assert.equal(applied.ok, true)
  assert.equal(applied.state.theme.look, 'claymorphism')
  assert.equal(applied.state.theme.preset, 'claymorphism')
  assert.equal(applied.state.theme.layout.hero, 'split')
  assert.equal(applied.state.theme.layout.cards, 'puffy')
  assert.equal(findSection(applied.state, 'hero').variant, 'split')
  assert.equal(findSection(applied.state, 'products').variant, 'puffy')
  assert.ok(applied.state.settings.hasAiDesign)
})

test('invalid component type is skipped without rolling back valid text', () => {
  const state = clothingState()
  const out = executeChangeSet(state, {
    operations: [
      { type: 'UPDATE_TEXT', target: { sectionId: 'hero', componentId: 'hero-heading' }, value: 'Keep me' },
      { type: 'ADD_COMPONENT', target: { sectionId: 'hero' }, component: { type: 'spaceship', props: {} } },
    ],
  })
  assert.equal(out.ok, true)
  assert.equal(findSection(out.state, 'hero').components.find((c) => c.id === 'hero-heading').props.text, 'Keep me')
})

test('mutation operation list includes ADD_COMPONENT and UPDATE_TEXT', () => {
  assert.ok(MUTATION_OPERATIONS.includes('ADD_COMPONENT'))
  assert.ok(MUTATION_OPERATIONS.includes('UPDATE_TEXT'))
  assert.ok(MUTATION_OPERATIONS.includes('REORDER_SECTION'))
})

test('addComponent helper inserts a button', () => {
  const result = applyMutationOperation(clothingState(), {
    type: 'ADD_COMPONENT',
    target: { pageId: 'home', sectionId: 'hero' },
    component: { type: 'button', props: { text: 'Shop New Arrivals', href: '#new-arrivals' } },
  })
  assert.equal(result.ok, true)
  assert.ok(listButtons(result.state, 'hero').some((b) => b.props.text === 'Shop New Arrivals'))
})

test('content rewrite and add-component prompts emit operations', () => {
  const rewritten = run('Rewrite the about section copy', clothingState(), { site: true })
  assert.ok(rewritten.interpreted.operations.some((op) => op.type === 'UPDATE_TEXT'))
  assert.equal(rewritten.applied.ok, true)
  assert.ok(findSection(rewritten.applied.state, 'about').components.some((c) => c.props.text))

  const button = run('Add a WhatsApp button')
  assert.ok(button.interpreted.operations.some((op) => op.type === 'ADD_COMPONENT'))
  assert.equal(button.applied.ok, true)
  assert.ok(listButtons(button.applied.state, 'hero').some((b) => /whatsapp|get in touch/i.test(b.props.text)))
})

test('unknown non-local prompt still mutates instead of applying original no-op', () => {
  const { interpreted, applied } = run('Make the page feel more unique and creative')
  assert.ok(interpreted.operations.length)
  assert.equal(applied.ok, true)
  assert.notEqual(applied.state.theme.look || applied.state.theme.preset, '')
  assert.ok(applied.applied.length)
})

test('validateChangeSet keeps valid operations when the batch is mixed', () => {
  const checked = validateChangeSet({
    operations: [
      { type: 'UPDATE_TEXT', target: { sectionId: 'hero', componentId: 'hero-heading' }, value: 'Hello' },
      { type: 'INVENT_WIDGET', target: { sectionId: 'hero' }, changes: { foo: 1 } },
    ],
  })
  assert.equal(checked.ok, true)
  assert.equal(checked.operations.length, 1)
  assert.equal(checked.operations[0].type, 'UPDATE_TEXT')
  assert.equal(isExecutableOperation({ type: 'UPDATE_TEXT', value: 'Hello' }), true)
})

test('named colours restyle the site instead of applying original look', () => {
  const analysis = analyzeUserPrompt('Make the website black and red')
  assert.ok(analysis.requirements.some((r) => r.kind === 'theme_color'))
  assert.ok(!analysis.requirements.some((r) => r.kind === 'text_color'))
  const { interpreted, applied } = run('Make the website black and red')
  assert.ok(interpreted.operations.some((op) => op.type === 'UPDATE_THEME' && op.changes?.colors))
  assert.ok(!interpreted.operations.some((op) => op.changes?.look === 'original' || op.changes?.preset === 'original'))
  assert.equal(applied.ok, true)
  assert.equal(applied.state.theme.colors.background, '#111111')
  assert.equal(applied.state.theme.colors.accent, '#C81E1E')
  assert.equal(applied.state.theme.colors.buttonBg, '#C81E1E')
})

test('footer and button colour prompts change those surfaces', () => {
  const footer = run('Make the footer pink')
  assert.equal(footer.applied.ok, true)
  assert.equal(footer.applied.state.theme.colors.footerBg, '#DB2777')
  const button = run('Make the buttons orange')
  assert.equal(button.applied.ok, true)
  assert.equal(button.applied.state.theme.colors.buttonBg, '#EA580C')
})

test('remove Shop New Arrivals deletes the button instead of rewriting the heading', () => {
  const withBtn = run('Add a Shop New Arrivals button to the hero.')
  const headingBefore = findSection(withBtn.applied.state, 'hero').components.find((c) => c.id === 'hero-heading').props.text
  const removed = run('remove the Shop New Arrivals button', withBtn.applied.state)
  assert.ok(removed.interpreted.operations.some((op) => op.type === 'REMOVE_COMPONENT'))
  assert.equal(removed.applied.ok, true)
  assert.ok(!listButtons(removed.applied.state, 'hero').some((b) => /shop new arrivals/i.test(b.props.text)))
  assert.equal(findSection(removed.applied.state, 'hero').components.find((c) => c.id === 'hero-heading').props.text, headingBefore)
})

test('remove Quality strips that word from the heading', () => {
  const state = clothingState()
  findSection(state, 'hero').components.find((c) => c.id === 'hero-heading').props.text = 'Quality Hair Care'
  state.content.landing.bannerTitle = 'Quality Hair Care'
  const { interpreted, applied } = run('remove Quality', state)
  assert.ok(interpreted.operations.some((op) => op.type === 'UPDATE_TEXT'))
  assert.equal(applied.ok, true)
  assert.equal(findSection(applied.state, 'hero').components.find((c) => c.id === 'hero-heading').props.text, 'Hair Care')
})

test('FAQ below gallery adds FAQ rather than gallery', () => {
  const state = clothingState()
  state.sectionOrder = ['hero', 'about', 'gallery', 'contact', 'footer']
  state.sectionVisibility.gallery = true
  state.content.gallery = ['https://example.com/photo.jpg']
  const analysis = analyzeUserPrompt('Add an FAQ section below the gallery')
  assert.ok(analysis.requirements.some((r) => r.kind === 'add_section' && r.sectionId === 'faq'))
  assert.ok(!analysis.requirements.some((r) => r.sectionId === 'gallery'))
  const { interpreted, applied } = run('Add an FAQ section below the gallery', hydrateSectionComponents(state))
  assert.ok(interpreted.operations.some((op) => op.type === 'ADD_SECTION' && op.sectionType === 'faq'))
  assert.ok(!interpreted.operations.some((op) => op.sectionType === 'gallery'))
  assert.equal(applied.ok, true)
  assert.ok(applied.state.sectionOrder.includes('faq'))
  assert.ok(applied.state.content.faq.items.length)
  assert.ok(applied.state.sectionOrder.indexOf('faq') > applied.state.sectionOrder.indexOf('gallery'))
})

test('custom theme colours are not replaced with original during normalize', () => {
  const { operations } = normalizeDesignerOperations([
    { type: 'UPDATE_THEME', target: { site: true }, changes: { colors: { background: '#C81E1E', accent: '#111111' } } },
  ])
  const theme = operations.find((op) => op.type === 'UPDATE_THEME')
  assert.ok(theme.changes.colors.background)
  assert.notEqual(String(theme.changes.preset || ''), 'original')
  assert.equal(theme.changes.colors.background, '#C81E1E')
})
