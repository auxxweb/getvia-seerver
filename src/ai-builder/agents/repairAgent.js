import { applyAiTheme } from '../theme/aiTheme.js'

export function repairFromValidation(state, validation) {
  const operations = []
  const errors = validation?.errors || []
  for (const err of errors) {
    if (err.type === 'LOW_CONTRAST') {
      operations.push({
        type: 'THEME_CHANGE',
        target: { site: true },
        changes: { colors: applyAiTheme(state.theme?.colors || {}, {}) },
      })
    }
    if (err.type === 'UNSUPPORTED_SECTION' && err.sectionId) {
      operations.push({
        type: 'SECTION_REORDER',
        target: { site: true },
        changes: { sectionOrder: (state.sectionOrder || []).filter((id) => id !== err.sectionId) },
      })
    }
    if (err.type === 'BROKEN_IMAGE' && err.field === 'hero') {
      operations.push({
        type: 'ASSET_CHANGE',
        target: { sectionId: 'hero' },
        changes: { heroImageUrl: '' },
      })
    }
  }
  const unique = []
  const seen = new Set()
  for (const op of operations) {
    const key = JSON.stringify(op)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(op)
  }
  return { operations: unique }
}
