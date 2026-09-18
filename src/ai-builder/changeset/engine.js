import { cloneState, validateWebsiteState } from '../state/websiteState.schema.js'
import { normalizeChangeSet, validateChangeSet } from '../state/changeSet.schema.js'
import { AI_SECTION_TYPES, MUTATION_OPERATIONS } from '../constants.js'
import { applyAiTheme } from '../theme/aiTheme.js'
import { sanitizeAiText, sanitizeUrl } from '../lib/sanitize.js'
import { applyMutationOperation } from '../mutations/componentEngine.js'
import { hydrateSectionComponents, syncLegacyContent, syncComponentsFromLegacy } from '../mutations/hydrateComponents.js'

function setPath(obj, path, value) {
  const parts = String(path).split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]
    if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {}
    cur = cur[key]
  }
  cur[parts[parts.length - 1]] = value
}

function reorderByMatch(items, needle) {
  if (!needle || !Array.isArray(items) || !items.length) return items
  const n = String(needle).toLowerCase()
  const idx = items.findIndex((row) =>
    `${row.title || ''} ${row.name || ''} ${row.description || ''}`.toLowerCase().includes(n),
  )
  if (idx <= 0) return items
  const copy = [...items]
  const [hit] = copy.splice(idx, 1)
  copy.unshift(hit)
  return copy
}

function applyPagePlan(next, changes) {
  next.engine = 'ai'
  next.layout = 'one-page'
  next.templateId = null
  if (changes.typography && typeof changes.typography === 'object') {
    next.theme.typography = { ...next.theme.typography, ...changes.typography }
  }
  const order = Array.isArray(changes.sectionOrder)
    ? changes.sectionOrder.filter((id) => AI_SECTION_TYPES.includes(id))
    : Array.isArray(changes.sections)
      ? changes.sections.map((s) => s.id || s.type).filter((id) => AI_SECTION_TYPES.includes(id))
      : []
  if (order.length) {
    next.sectionOrder = order
    const vis = { ...next.sectionVisibility }
    for (const id of AI_SECTION_TYPES) vis[id] = order.includes(id)
    next.sectionVisibility = vis
  }
  if (Array.isArray(changes.sections) && next.pages[0]) {
    next.pages[0].sections = changes.sections
      .map((row, i) => ({
        id: AI_SECTION_TYPES.includes(row.id) ? row.id : row.type || `section-${i}`,
        type: AI_SECTION_TYPES.includes(row.type) ? row.type : 'about',
        variant: row.variant || 'standard',
        visible: row.visible !== false,
        heading: row.heading ? sanitizeAiText(row.heading, { max: 80 }) : undefined,
        body: row.body ? sanitizeAiText(row.body, { max: 400 }) : undefined,
      }))
      .filter((row) => AI_SECTION_TYPES.includes(row.type))
  }
}

export function applyOperations(state, operations) {
  const original = cloneState(state)
  let next = cloneState(state)
  next.engine = 'ai'
  next.layout = next.layout || 'one-page'
  next.templateId = null
  const applied = []
  for (const op of operations) {
    const type = op.type || op.operation
    if (MUTATION_OPERATIONS.includes(type) || type === 'THEME_CHANGE' || type === 'STYLE_CHANGE') {
      const mapped = type === 'THEME_CHANGE' ? { ...op, type: 'UPDATE_THEME' } : type === 'STYLE_CHANGE' ? { ...op, type: 'UPDATE_STYLE' } : op
      const step = applyMutationOperation(next, mapped)
      if (!step.ok) {
        if (['TARGET_NOT_FOUND', 'UNSUPPORTED_CAPABILITY', 'SCHEMA'].includes(step.error?.code)) {
          applied.push({
            type,
            summary: `Skipped ${step.error.code}: ${step.error.message}`,
            skipped: true,
            error: step.error,
          })
          continue
        }
        return { next: original, applied: [], error: step.error, rolledBack: true }
      }
      next = step.state
      applied.push(...step.applied)
      continue
    }
    const changes = op.changes || {}
    if (op.type === 'TEMPLATE_CHANGE') {
      applied.push({ type: op.type, summary: 'Ignored listing template — AI Builder uses its own design' })
    } else if (op.type === 'PAGE_PLAN_CHANGE') {
      applyPagePlan(next, changes)
      applied.push({ type: op.type, summary: 'One-page layout planned' })
    } else if (op.type === 'THEME_CHANGE') {
      const patch = changes.colors || changes
      next.theme.colors = applyAiTheme(next.theme.colors || {}, patch)
      if (changes.preset) next.theme.preset = changes.preset
      applied.push({ type: op.type, summary: 'Original theme updated' })
    } else if (op.type === 'CONTENT_CHANGE') {
      if (changes.path) {
        const value =
          typeof changes.value === 'string' ? sanitizeAiText(changes.value, { max: 2000 }) : changes.value
        setPath(next.content, changes.path, value)
        applied.push({ type: op.type, summary: `Updated ${changes.path}` })
      }
      if (changes.landing && typeof changes.landing === 'object') {
        next.content.landing = { ...next.content.landing, ...sanitizeLanding(changes.landing) }
        applied.push({ type: op.type, summary: 'Hero copy updated' })
      }
      if (changes.description != null) {
        next.content.description = sanitizeAiText(changes.description, { max: 2000 })
        applied.push({ type: op.type, summary: 'Description updated' })
      }
      if (changes.offers && typeof changes.offers === 'object') {
        next.content.offers = mergeCollection(next.content.offers, changes.offers)
        applied.push({ type: op.type, summary: 'Offers updated' })
      }
      if (changes.coreServices && typeof changes.coreServices === 'object') {
        next.content.coreServices = mergeCollection(next.content.coreServices, changes.coreServices)
        applied.push({ type: op.type, summary: 'Services updated' })
      }
      if (changes.catalogue && typeof changes.catalogue === 'object') {
        next.content.catalogue = mergeCollection(next.content.catalogue, changes.catalogue)
        applied.push({ type: op.type, summary: 'Catalogue updated' })
      }
      if (typeof changes.reorderServices === 'string') {
        next.content.coreServices.items = reorderByMatch(
          next.content.coreServices.items,
          changes.reorderServices,
        )
        applied.push({ type: op.type, summary: `Moved “${changes.reorderServices}” first` })
      }
      if (changes.cta && typeof changes.cta === 'object') {
        next.content.cta = {
          ...(next.content.cta || {}),
          ...(changes.cta.title != null ? { title: sanitizeAiText(changes.cta.title, { max: 80 }) } : {}),
          ...(changes.cta.description != null ? { description: sanitizeAiText(changes.cta.description, { max: 400 }) } : {}),
          ...(changes.cta.buttonLabel != null ? { buttonLabel: sanitizeAiText(changes.cta.buttonLabel, { max: 40 }) } : {}),
        }
        applied.push({ type: op.type, summary: 'Call to action updated' })
      }
    } else if (op.type === 'SECTION_REORDER' && Array.isArray(changes.sectionOrder)) {
      const order = changes.sectionOrder.filter((id) => AI_SECTION_TYPES.includes(id))
      if (order.length) {
        next.sectionOrder = order
        applied.push({ type: op.type, summary: 'Section order updated' })
      }
    } else if (op.type === 'SECTION_VISIBILITY' && changes.sectionId) {
      if (AI_SECTION_TYPES.includes(changes.sectionId)) {
        next.sectionVisibility[changes.sectionId] = changes.visible !== false
        applied.push({
          type: op.type,
          summary: `${changes.sectionId} ${changes.visible === false ? 'hidden' : 'shown'}`,
        })
      }
    } else if (op.type === 'STYLE_CHANGE') {
      next.theme.spacing = { ...next.theme.spacing, ...(changes.spacing || {}) }
      next.theme.radius = { ...next.theme.radius, ...(changes.radius || {}) }
      next.theme.shadows = { ...next.theme.shadows, ...(changes.shadows || {}) }
      if (changes.alignment) next.settings.alignment = changes.alignment
      if (changes.headingScale) next.settings.headingScale = changes.headingScale
      applied.push({ type: op.type, summary: 'Style updated' })
    } else if (op.type === 'FUNCTIONALITY_CHANGE') {
      next.functionality = { ...next.functionality, ...pickBool(changes, ['call', 'whatsapp', 'enquiry', 'email', 'directions', 'social']) }
      applied.push({ type: op.type, summary: 'Actions updated' })
    } else if (op.type === 'SEO_CHANGE') {
      next.seo = {
        ...next.seo,
        ...sanitizeSeo(changes),
      }
      applied.push({ type: op.type, summary: 'SEO updated' })
    } else if (op.type === 'ASSET_CHANGE') {
      if (changes.heroImageUrl) {
        next.content.landing.bannerImageUrl = sanitizeUrl(changes.heroImageUrl)
        next.content.landing.bannerImagePublicId = changes.heroImagePublicId || next.content.landing.bannerImagePublicId
        applied.push({ type: op.type, summary: 'Hero image updated' })
      }
      if (Array.isArray(changes.gallery)) {
        next.content.gallery = changes.gallery.map(sanitizeUrl).filter(Boolean)
        applied.push({ type: op.type, summary: 'Gallery updated' })
      }
    }
  }
  next = hydrateSectionComponents(next)
  syncComponentsFromLegacy(next)
  syncLegacyContent(next)
  const realApplied = applied.filter((row) => !row.skipped)
  if (realApplied.length) {
    next.settings = { ...next.settings, hasAiDesign: true }
  }
  const valid = validateWebsiteState(next)
  if (!valid.ok) {
    return { next: original, applied: [], error: valid.errors[0], errors: valid.errors, rolledBack: true }
  }
  if (!realApplied.length) {
    return { next: original, applied, error: { type: 'NO_CHANGE_APPLIED', code: 'NO_CHANGE_APPLIED', message: 'No website fields changed.' } }
  }
  return { next, applied: realApplied }
}

function mergeCollection(current = {}, patch = {}) {
  const out = {
    title: patch.title != null ? sanitizeAiText(patch.title, { max: 80 }) : current.title,
    description: patch.description != null ? sanitizeAiText(patch.description, { max: 400 }) : current.description,
    items: Array.isArray(current.items) ? [...current.items] : [],
  }
  if (Array.isArray(patch.items)) {
    const byId = new Map(out.items.map((row) => [String(row.id), row]))
    out.items = patch.items.map((row, i) => {
      const prev = byId.get(String(row.id)) || out.items[i] || {}
      return {
        ...prev,
        ...row,
        title: row.title != null ? sanitizeAiText(row.title, { max: 80 }) : prev.title,
        name: row.name != null ? sanitizeAiText(row.name, { max: 80 }) : prev.name,
        description: row.description != null ? sanitizeAiText(row.description, { max: 400 }) : prev.description,
      }
    })
  }
  return out
}

function sanitizeLanding(landing) {
  const out = {}
  for (const [k, v] of Object.entries(landing)) {
    if (typeof v === 'string' && /url|link/i.test(k)) out[k] = sanitizeUrl(v)
    else if (typeof v === 'string') out[k] = sanitizeAiText(v, { max: 400 })
    else out[k] = v
  }
  return out
}

function sanitizeSeo(changes) {
  const out = {}
  for (const key of ['title', 'description', 'ogTitle', 'ogDescription', 'canonical', 'robots', 'ogImage', 'structuredDataType']) {
    if (changes[key] == null) continue
    out[key] = key === 'canonical' || key === 'ogImage' ? sanitizeUrl(changes[key]) : sanitizeAiText(changes[key], { max: 300 })
  }
  return out
}

function pickBool(obj, keys) {
  const out = {}
  for (const k of keys) {
    if (typeof obj[k] === 'boolean') out[k] = obj[k]
  }
  return out
}

export function executeChangeSet(state, rawChangeSet) {
  const normalized = normalizeChangeSet(rawChangeSet)
  const schema = validateChangeSet(normalized)
  if (!schema.ok) {
    return { ok: false, errors: schema.errors, state, applied: [], rolledBack: false }
  }
  const original = cloneState(state)
  const { next, applied, error, errors, rolledBack } = applyOperations(state, schema.operations)
  if (error?.code === 'NO_CHANGE_APPLIED') {
    return {
      ok: false,
      errors: [error],
      state: original,
      applied: applied || [],
      rolledBack: false,
      code: 'NO_CHANGE_APPLIED',
    }
  }
  if (error || errors) {
    return { ok: false, errors: errors || [error], state: original, applied: [], rolledBack: Boolean(rolledBack) }
  }
  return { ok: true, errors: [], state: next, applied, operations: schema.operations }
}
