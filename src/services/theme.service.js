import { TEMPLATE_THEMES } from '../config/templateThemes.js'

function normalizeHex(h) {
  if (!h || typeof h !== 'string') return ''
  let s = h.trim()
  if (!s.startsWith('#')) s = `#${s}`
  if (s.length === 4) {
    const r = s[1]
    const g = s[2]
    const b = s[3]
    s = `#${r}${r}${g}${g}${b}${b}`
  }
  return s.length === 7 ? s.toUpperCase() : ''
}

/**
 * @param {string} v
 * @returns {string|null}
 */
function sanitizeCssColor(v) {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t || t.length > 200) return null
  const hex = normalizeHex(t)
  if (/^#[0-9A-F]{6}$/.test(hex)) return hex
  if (/^rgba?\(/i.test(t) || /^hsla?\(/i.test(t)) return t
  if (t === 'transparent') return t
  return null
}

/**
 * @param {string} templateId
 * @param {Record<string, string>} colors - partial map of key -> hex
 * @returns {{ ok: boolean, error?: string, sanitized?: Record<string, string> }}
 */
export function validateCustomThemePatch(templateId, colors) {
  const def = TEMPLATE_THEMES[templateId]
  if (!def) {
    return { ok: false, error: 'Unknown templateId' }
  }
  if (!colors || typeof colors !== 'object' || Array.isArray(colors)) {
    return { ok: false, error: 'colors must be an object' }
  }
  const allowed = new Set(def.editableColors.map((c) => c.key))
  const sanitized = {}
  for (const [k, v] of Object.entries(colors)) {
    if (!allowed.has(k)) continue
    const s = sanitizeCssColor(v)
    if (s) sanitized[k] = s
  }
  return { ok: true, sanitized }
}
