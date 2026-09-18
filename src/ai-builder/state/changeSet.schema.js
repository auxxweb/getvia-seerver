import { CHANGE_SET_TYPES, MUTATION_OPERATIONS } from '../constants.js'

export function operationType(op) {
  return op?.type || op?.operation || ''
}

export function isExecutableOperation(op) {
  if (!op || typeof op !== 'object') return false
  const type = operationType(op)
  if (!type) return false
  if (['REMOVE_COMPONENT', 'REMOVE_SECTION', 'REORDER_SECTION', 'ADD_SECTION'].includes(type)) {
    return Boolean(
      op.target?.sectionId ||
        op.target?.componentId ||
        op.sectionType ||
        op.sectionId ||
        op.beforeSectionId ||
        op.afterSectionId ||
        op.changes,
    )
  }
  return Boolean(op.changes || op.value != null || op.component || op.componentType || op.sectionType || op.action)
}

export function validateChangeSet(raw) {
  const errors = []
  const valid = []
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: [{ type: 'SCHEMA', message: 'Change set must be an object' }], operations: [] }
  }
  const operations = Array.isArray(raw.operations) ? raw.operations : raw.type || raw.operation ? [raw] : []
  if (!operations.length) {
    return { ok: false, errors: [{ type: 'SCHEMA', message: 'Change set has no operations' }], operations: [] }
  }
  operations.forEach((op, i) => {
    if (!op || typeof op !== 'object') {
      errors.push({ type: 'SCHEMA', path: i, message: 'Operation must be an object' })
      return
    }
    const type = operationType(op)
    if (!CHANGE_SET_TYPES.includes(type)) {
      errors.push({ type: 'UNSUPPORTED_OPERATION', path: i, message: `Unsupported operation ${type}` })
      return
    }
    if (MUTATION_OPERATIONS.includes(type)) {
      if (type === 'UPDATE_TEXT' && op.value == null && op.changes?.text == null && op.changes?.value == null) {
        errors.push({ type: 'SCHEMA', path: i, message: 'UPDATE_TEXT requires value' })
        return
      }
      if (type === 'ADD_COMPONENT' && !op.component && !op.componentType && !op.changes?.componentType) {
        errors.push({ type: 'SCHEMA', path: i, message: 'ADD_COMPONENT requires component.type' })
        return
      }
      valid.push({ ...op, type })
      return
    }
    if (!op.changes || typeof op.changes !== 'object') {
      errors.push({ type: 'SCHEMA', path: i, message: 'Operation.changes is required' })
      return
    }
    valid.push({ ...op, type })
  })
  return { ok: valid.length > 0, errors, operations: valid }
}

export function normalizeChangeSet(raw) {
  if (!raw) return { operations: [] }
  if (Array.isArray(raw.operations)) {
    return {
      operations: raw.operations.map((op) => ({ ...op, type: operationType(op) })),
      prompt: raw.prompt || '',
      changeSetId: raw.changeSetId,
      siteId: raw.siteId,
      baseRevision: raw.baseRevision,
    }
  }
  if (raw.type || raw.operation) return { operations: [{ ...raw, type: operationType(raw) }], prompt: raw.prompt || '' }
  return { operations: [], prompt: raw.prompt || '' }
}
