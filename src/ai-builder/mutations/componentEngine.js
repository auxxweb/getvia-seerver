import { randomUUID } from 'node:crypto'
import { cloneState, validateWebsiteState } from '../state/websiteState.schema.js'
import { AI_SECTION_TYPES, MUTATION_OPERATIONS } from '../constants.js'
import { applyAiTheme, inferAiTypography, resolveAiThemePreset } from '../theme/aiTheme.js'
import { resolveVisualLook, lookLayout } from '../theme/visualLook.js'
import { sanitizeAiText, sanitizeUrl } from '../lib/sanitize.js'
import { isAllowedComponentType, isEditableProperty, COMPONENT_TYPES } from '../state/componentRegistry.js'
import {
  hydrateSectionComponents,
  findSection,
  findComponent,
  syncLegacyContent,
} from './hydrateComponents.js'

function defaultFaqContent() {
  return {
    title: 'Frequently asked questions',
    items: [
      { question: 'What services do you offer?', answer: 'See the services on this page, or contact us for a personal recommendation.' },
      { question: 'How do I book?', answer: 'Use the contact form, call, or WhatsApp and we will confirm a time.' },
      { question: 'Where are you located?', answer: 'Find our address and hours in the contact section.' },
    ],
  }
}

function defaultReviewsContent() {
  return {
    title: 'Reviews',
    items: [
      { quote: 'Wonderful experience — I will be back.', author: 'A happy client' },
      { quote: 'Professional, kind, and consistently excellent.', author: 'Local guest' },
    ],
  }
}

function fail(message, extra = {}) {
  return { ok: false, error: { type: 'MUTATION', message, ...extra }, applied: [] }
}

function ok(state, applied) {
  return { ok: true, state, applied }
}

function newComponentId(type) {
  return `${type}-${randomUUID().slice(0, 8)}`
}

function resolveHref(action, props = {}) {
  if (props.href) return props.href
  if (!action) return '#contact'
  if (action.type === 'SCROLL_TO_SECTION' || action.type === 'SHOP_NEW_ARRIVALS') {
    const target = action.target || (action.type === 'SHOP_NEW_ARRIVALS' ? 'new-arrivals' : 'contact')
    return `#${String(target).replace(/^#/, '')}`
  }
  if (action.type === 'OPEN_URL' || action.type === 'OPEN_PAGE') return action.url || action.target || props.href || '#'
  if (action.type === 'WHATSAPP') return action.url || props.href || '#'
  if (action.type === 'CALL') return action.url || props.href || '#'
  if (action.type === 'EMAIL') return action.url || props.href || '#'
  return props.href || '#contact'
}

export function addComponent(state, { pageId = 'home', sectionId, componentType, props = {}, position } = {}) {
  let next = hydrateSectionComponents(state)
  let section = findSection(next, sectionId, pageId)
  if (!section && AI_SECTION_TYPES.includes(sectionId)) {
    if (!next.sectionOrder.includes(sectionId)) next.sectionOrder = [...next.sectionOrder, sectionId]
    next.sectionVisibility = { ...next.sectionVisibility, [sectionId]: true }
    next = hydrateSectionComponents(next)
    section = findSection(next, sectionId, pageId)
  }
  if (!section) return fail(`Section "${sectionId}" was not found.`, { code: 'TARGET_NOT_FOUND' })
  if (!COMPONENT_TYPES.includes(componentType)) {
    return fail(`Component type "${componentType}" is not supported.`, { code: 'UNSUPPORTED_CAPABILITY' })
  }
  if (!isAllowedComponentType(section.type || section.id, componentType)) {
    return fail(`${section.type} does not support adding a ${componentType}.`, { code: 'UNSUPPORTED_CAPABILITY' })
  }
  const component = {
    id: newComponentId(componentType),
    type: componentType,
    props: { ...props, href: componentType === 'button' ? resolveHref(props.action, props) : props.href },
  }
  section.components = Array.isArray(section.components) ? [...section.components] : []
  const idx = Number.isInteger(position) ? Math.max(0, Math.min(position, section.components.length)) : section.components.length
  section.components.splice(idx, 0, component)
  syncLegacyContent(next)
  return ok(next, [{ type: 'ADD_COMPONENT', summary: `Added ${componentType} to ${section.id}`, componentId: component.id, sectionId: section.id }])
}

export function updateComponent(state, { pageId = 'home', sectionId, componentId, changes = {} } = {}) {
  const next = hydrateSectionComponents(state)
  const found = findComponent(next, { pageId, sectionId, componentId })
  if (!found.component) return fail(`Component "${componentId}" was not found.`, { code: 'TARGET_NOT_FOUND' })
  const nextProps = { ...found.component.props }
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue
    if (!isEditableProperty(found.component.type, key) && !['background', 'color', 'action', 'href', 'text', 'variant', 'src'].includes(key)) {
      continue
    }
    nextProps[key] = typeof value === 'string' && key !== 'href' && key !== 'src' ? sanitizeAiText(value, { max: 400 }) : value
  }
  if (nextProps.action) nextProps.href = resolveHref(nextProps.action, nextProps)
  if (typeof nextProps.href === 'string') nextProps.href = nextProps.href.startsWith('#') || nextProps.href.startsWith('http') || nextProps.href.startsWith('tel:') || nextProps.href.startsWith('mailto:') ? nextProps.href : sanitizeUrl(nextProps.href)
  found.component.props = nextProps
  syncLegacyContent(next)
  return ok(next, [{ type: 'UPDATE_COMPONENT', summary: `Updated ${found.component.type} in ${found.section.id}`, componentId, sectionId: found.section.id }])
}

export function moveComponent(state, { pageId = 'home', sectionId, componentId, index } = {}) {
  const next = hydrateSectionComponents(state)
  const found = findComponent(next, { pageId, sectionId, componentId })
  if (!found.component) return fail(`Component "${componentId}" was not found.`, { code: 'TARGET_NOT_FOUND' })
  const list = [...found.section.components]
  const from = list.findIndex((row) => row.id === componentId)
  const [row] = list.splice(from, 1)
  const to = Math.max(0, Math.min(Number(index) || 0, list.length))
  list.splice(to, 0, row)
  found.section.components = list
  syncLegacyContent(next)
  return ok(next, [{ type: 'MOVE_COMPONENT', summary: `Moved ${componentId} in ${found.section.id}` }])
}

export function reorderSection(state, { pageId = 'home', sectionId, position, beforeSectionId, afterSectionId } = {}) {
  const next = hydrateSectionComponents(cloneState(state))
  const order = [...(next.sectionOrder || [])]
  const from = order.indexOf(sectionId)
  if (from < 0) return fail(`Section "${sectionId}" is not on this page.`, { code: 'TARGET_NOT_FOUND' })
  const [id] = order.splice(from, 1)
  let to
  if (beforeSectionId) {
    to = order.indexOf(beforeSectionId)
    if (to < 0) return fail(`Cannot place before "${beforeSectionId}".`, { code: 'TARGET_NOT_FOUND' })
  } else if (afterSectionId) {
    const after = order.indexOf(afterSectionId)
    to = after < 0 ? order.length : after + 1
  } else {
    to = Math.max(0, Math.min(Number(position) ?? order.length, order.length))
  }
  order.splice(to, 0, id)
  next.sectionOrder = order
  const page = next.pages[0]
  if (page?.sections) {
    page.sections = order.map((type) => page.sections.find((s) => (s.id || s.type) === type)).filter(Boolean)
  }
  return ok(next, [{ type: 'REORDER_SECTION', summary: `Moved ${sectionId} ${beforeSectionId ? `before ${beforeSectionId}` : `to position ${to + 1}`}` }])
}

export function updateText(state, op) {
  const target = op.target || {}
  const value = sanitizeAiText(op.value ?? op.changes?.text ?? op.changes?.value ?? '', { max: 400 })
  if (!value) return fail('No text was provided.', { code: 'SCHEMA' })
  if (target.componentId) {
    return updateComponent(state, { ...target, changes: { text: value } })
  }
  const next = hydrateSectionComponents(state)
  const section = findSection(next, target.sectionId || 'hero')
  const heading = (section?.components || []).find((c) => c.type === 'heading')
  if (heading) return updateComponent(next, { sectionId: section.id, componentId: heading.id, changes: { text: value } })
  return fail('No heading was found to update.', { code: 'TARGET_NOT_FOUND' })
}

function applyThemeOp(state, op) {
  const next = hydrateSectionComponents(state)
  const patch = op.changes?.colors || op.changes || {}
  const presetName = op.changes?.preset || op.changes?.colorPalette || op.value
  const preset = resolveAiThemePreset(presetName) || (typeof patch === 'object' ? patch : null)
  if (preset && Object.keys(preset).length) {
    next.theme.colors = applyAiTheme(next.theme.colors || {}, preset.background ? preset : patch)
    if (presetName) next.theme.preset = String(presetName)
    if (op.changes?.look || resolveVisualLook(presetName)) {
      const look = op.changes?.look || resolveVisualLook(presetName)
      next.theme.look = look
      next.theme.layout = { ...lookLayout(look), ...(op.changes?.layout || {}) }
      const layout = next.theme.layout
      for (const section of next.pages?.[0]?.sections || []) {
        const variant =
          section.type === 'hero' || section.id === 'hero'
            ? layout.hero
            : section.type === 'about' || section.id === 'about'
              ? layout.about
              : section.type === 'gallery' || section.id === 'gallery'
                ? layout.gallery
                : section.type === 'contact' || section.id === 'contact'
                  ? layout.contact
                  : ['services', 'products', 'offers'].includes(section.type || section.id)
                    ? layout.cards
                    : look
        section.variant = variant
        section.style = { ...section.style, visualStyle: look, layout: variant }
      }
    }
    const type = inferAiTypography(presetName || '')
    if (type) next.theme.typography = { ...next.theme.typography, ...type }
  }
  const sectionId = op.target?.sectionId
  if (sectionId === 'hero' && (op.changes?.background || /black|gold|dark|premium/.test(String(presetName || '')))) {
    const section = findSection(next, 'hero')
    if (section) {
      section.style = {
        ...section.style,
        visualStyle: section.style?.visualStyle || 'premium',
        background: next.theme.colors.heroBg,
      }
    }
  }
  return ok(next, [{ type: 'UPDATE_THEME', summary: 'Theme colors updated' }])
}

function applySiteStyle(next, changes) {
  const look = changes.visualStyle || changes.cardStyle || changes.look
  next.theme.look = look || next.theme.look
  next.theme.spacing = { ...next.theme.spacing, ...(changes.spacing || {}) }
  next.theme.radius = {
    ...next.theme.radius,
    ...(changes.radius || {}),
    ...(look === 'premium' || changes.cardStyle === 'premium' ? { card: 'xl' } : {}),
  }
  next.theme.shadows = {
    ...next.theme.shadows,
    ...(changes.shadows || {}),
    ...(look === 'premium' || changes.visualStyle === 'premium' ? { card: 'strong' } : {}),
  }
  if (changes.alignment) next.settings.alignment = changes.alignment
  if (look) {
    next.theme.typography = { ...next.theme.typography, ...inferAiTypography(look) }
    next.theme.layout = { ...lookLayout(look), ...(changes.layout || {}) }
    const layout = next.theme.layout
    for (const section of next.pages?.[0]?.sections || []) {
      const variant =
        section.type === 'hero' || section.id === 'hero'
          ? layout.hero
          : section.type === 'about' || section.id === 'about'
            ? layout.about
            : section.type === 'gallery' || section.id === 'gallery'
              ? layout.gallery
              : section.type === 'contact' || section.id === 'contact'
                ? layout.contact
                : ['services', 'products', 'offers'].includes(section.type || section.id)
                  ? layout.cards
                  : look
      section.variant = variant
      section.style = { ...section.style, visualStyle: look, cardStyle: changes.cardStyle || look, layout: variant }
    }
  } else if (changes.layout) {
    next.theme.layout = { ...(next.theme.layout || {}), ...changes.layout }
  }
  return ok(next, [{ type: 'UPDATE_STYLE', summary: look ? `Applied ${look} look` : 'Site style updated' }])
}

function applyStyleOp(state, op) {
  const next = hydrateSectionComponents(state)
  const target = op.target || {}
  const changes = op.changes || {}
  if (target.componentId) {
    return updateComponent(next, { ...target, changes })
  }
  if (target.site && !target.sectionId) {
    return applySiteStyle(next, changes)
  }
  const section = findSection(next, target.sectionId || (target.site ? null : 'hero'))
  if (section) {
    section.style = { ...section.style, ...changes }
    if (changes.visualStyle === 'premium' || changes.cardStyle === 'premium') {
      next.theme.radius = { ...next.theme.radius, card: 'xl' }
      next.theme.shadows = { ...next.theme.shadows, card: 'strong' }
    }
    if (changes.height) section.style.height = changes.height
    return ok(next, [{ type: 'UPDATE_STYLE', summary: `Styled ${section.id}`, sectionId: section.id }])
  }
  if (target.site || !target.sectionId) {
    return applySiteStyle(next, changes)
  }
  return fail('No style target was found.', { code: 'TARGET_NOT_FOUND' })
}

function applyResponsiveOp(state, op) {
  const next = hydrateSectionComponents(state)
  const section = findSection(next, op.target?.sectionId || 'hero')
  if (!section) return fail('Section not found for responsive style.', { code: 'TARGET_NOT_FOUND' })
  const viewport = op.changes?.viewport || 'mobile'
  section.responsive = {
    ...section.responsive,
    [viewport]: { ...(section.responsive?.[viewport] || {}), ...(op.changes || {}), viewport: undefined },
  }
  if (section.responsive[viewport].buttonFullWidth == null && /mobile|button/.test(JSON.stringify(op.changes || {}))) {
    section.responsive[viewport].buttonFullWidth = true
  }
  return ok(next, [{ type: 'UPDATE_RESPONSIVE_STYLE', summary: `Updated ${section.id} for ${viewport}`, sectionId: section.id }])
}

export function applyMutationOperation(state, op) {
  const type = op.type || op.operation
  const target = op.target || {}
  switch (type) {
    case 'UPDATE_THEME':
      return applyThemeOp(state, op)
    case 'UPDATE_TEXT':
      return updateText(state, op)
    case 'UPDATE_IMAGE':
      return updateComponent(state, {
        ...target,
        componentId: target.componentId || 'hero-image',
        changes: { src: op.value || op.changes?.src, publicId: op.changes?.publicId },
      })
    case 'UPDATE_STYLE':
      return applyStyleOp(state, op)
    case 'ADD_COMPONENT':
      return addComponent(state, {
        ...target,
        sectionId: target.sectionId || 'hero',
        componentType: op.component?.type || op.componentType || op.changes?.componentType,
        props: op.component?.props || op.changes?.props || op.changes || {},
        position: op.position,
      })
    case 'REMOVE_COMPONENT': {
      const next = hydrateSectionComponents(state)
      const found = findComponent(next, target)
      if (!found.component) return fail('Component not found.', { code: 'TARGET_NOT_FOUND' })
      found.section.components = found.section.components.filter((row) => row.id !== found.component.id)
      syncLegacyContent(next)
      return ok(next, [{ type: 'REMOVE_COMPONENT', summary: `Removed ${target.componentId}` }])
    }
    case 'MOVE_COMPONENT':
      return moveComponent(state, { ...target, index: op.index ?? op.position })
    case 'REORDER_SECTION':
      return reorderSection(state, {
        sectionId: target.sectionId || op.sectionId,
        position: op.position,
        beforeSectionId: op.beforeSectionId || op.changes?.beforeSectionId,
        afterSectionId: op.afterSectionId || op.changes?.afterSectionId,
      })
    case 'ADD_SECTION': {
      const id = op.sectionType || target.sectionId
      if (!AI_SECTION_TYPES.includes(id)) return fail(`Section "${id}" is not supported.`, { code: 'UNSUPPORTED_CAPABILITY' })
      const next = hydrateSectionComponents(state)
      const afterId = op.afterSectionId || op.changes?.afterSectionId
      if (afterId && next.sectionOrder.includes(afterId)) {
        next.sectionOrder = next.sectionOrder.filter((s) => s !== id)
        const i = next.sectionOrder.indexOf(afterId)
        next.sectionOrder.splice(i + 1, 0, id)
      } else if (!next.sectionOrder.includes(id)) {
        next.sectionOrder.push(id)
      }
      next.sectionVisibility[id] = true
      if (id === 'faq') {
        next.content.faq = next.content.faq?.items?.length ? next.content.faq : defaultFaqContent()
      }
      if (id === 'reviews') {
        next.content.reviews = next.content.reviews?.items?.length ? next.content.reviews : defaultReviewsContent()
      }
      return ok(hydrateSectionComponents(next), [{ type: 'ADD_SECTION', summary: `Showed ${id}` }])
    }
    case 'REMOVE_SECTION': {
      const next = hydrateSectionComponents(state)
      const id = target.sectionId
      next.sectionVisibility[id] = false
      next.sectionOrder = next.sectionOrder.filter((s) => s !== id)
      return ok(next, [{ type: 'REMOVE_SECTION', summary: `Hid ${id}` }])
    }
    case 'UPDATE_LINK':
    case 'UPDATE_BUTTON':
      return updateComponent(state, {
        ...target,
        changes: {
          ...(op.value ? { text: op.value } : {}),
          ...(op.changes || {}),
          ...(op.action ? { action: op.action, href: resolveHref(op.action, op.changes || {}) } : {}),
        },
      })
    case 'UPDATE_VISIBILITY': {
      const next = hydrateSectionComponents(state)
      const id = target.sectionId
      next.sectionVisibility[id] = op.changes?.visible !== false
      return ok(next, [{ type: 'UPDATE_VISIBILITY', summary: `${id} visibility updated` }])
    }
    case 'UPDATE_LAYOUT':
      return applyStyleOp(state, { ...op, changes: { ...(op.changes || {}), alignment: op.changes?.alignment || op.value } })
    case 'UPDATE_RESPONSIVE_STYLE':
      return applyResponsiveOp(state, op)
    default:
      return fail(`Unsupported operation ${type}`, { code: 'UNSUPPORTED_OPERATION' })
  }
}

export function applyMutationsAtomic(state, operations) {
  const original = cloneState(state)
  let working = hydrateSectionComponents(original)
  const applied = []
  for (const op of operations || []) {
    const type = op.type || op.operation
    if (!MUTATION_OPERATIONS.includes(type) && type !== 'THEME_CHANGE' && type !== 'STYLE_CHANGE') {
      continue
    }
    const mapped = type === 'THEME_CHANGE' ? { ...op, type: 'UPDATE_THEME' } : type === 'STYLE_CHANGE' ? { ...op, type: 'UPDATE_STYLE' } : op
    const step = applyMutationOperation(working, mapped)
    if (!step.ok) {
      if (step.error?.code === 'TARGET_NOT_FOUND') {
        applied.push({
          type,
          summary: `Skipped missing target: ${step.error.message}`,
          skipped: true,
          error: step.error,
        })
        continue
      }
      return { ok: false, errors: [step.error], state: original, applied: [], rolledBack: true }
    }
    working = step.state
    applied.push(...step.applied)
  }
  const valid = validateWebsiteState(working)
  if (!valid.ok) {
    return { ok: false, errors: valid.errors, state: original, applied: [], rolledBack: true }
  }
  return { ok: true, errors: [], state: working, applied, rolledBack: false }
}
