import { AI_SECTION_TYPES } from '../constants.js'

export function normalizeSelectedElement(raw) {
  if (!raw || typeof raw !== 'object') return { site: true }
  if (raw.site === true || raw.sectionId === 'site' || raw.target === 'site') return { site: true }
  const sectionId = String(raw.sectionId || '').trim()
  const allowed = new Set([...AI_SECTION_TYPES, 'nav', 'pricing'])
  if (allowed.has(sectionId)) return { sectionId }
  return { site: true }
}

export function isEntireWebsiteTarget(selectedElement) {
  const el = normalizeSelectedElement(selectedElement)
  return Boolean(el.site)
}
