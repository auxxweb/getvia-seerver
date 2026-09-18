import { CODEX_EVENT_TYPES } from './types.js'

function clip(value, max = 400) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function itemLabel(item) {
  if (!item || typeof item !== 'object') return ''
  if (item.type === 'agent_message') return clip(item.text, 240)
  if (item.type === 'command_execution' || item.type === 'command') {
    return clip(item.command || item.text || 'Running a project command', 180)
  }
  if (item.type === 'file_change' || item.type === 'file_update') {
    const files = item.changes?.map((row) => row.path || row).filter(Boolean) || [item.path]
    return clip(`Updated ${files.filter(Boolean).slice(0, 4).join(', ')}`, 180)
  }
  if (item.type === 'reasoning') return clip(item.text || 'Planning the implementation', 180)
  return clip(item.text || item.type || '', 180)
}

export function mapCodexEvent(event) {
  const type = String(event?.type || '')
  const item = event?.item || null
  if (type === 'thread.started') {
    return { type: 'THREAD_STARTED', message: 'Codex developer thread started', threadId: event.thread_id || null }
  }
  if (type === 'turn.started') {
    return { type: 'TURN_STARTED', message: 'Codex is implementing in the workspace' }
  }
  if (type === 'item.started') {
    return { type: 'ITEM_STARTED', message: itemLabel(item) || 'Codex is working', itemType: item?.type || null }
  }
  if (type === 'item.completed') {
    const mappedType =
      item?.type === 'file_change' || item?.type === 'file_update'
        ? 'FILE_UPDATED'
        : item?.type === 'command_execution' || item?.type === 'command'
          ? 'COMMAND_RUN'
          : 'ITEM_COMPLETED'
    return {
      type: mappedType,
      message: itemLabel(item) || 'Codex completed a step',
      itemType: item?.type || null,
      item,
    }
  }
  if (type === 'turn.completed') {
    return { type: 'TURN_COMPLETED', message: 'Codex finished this implementation pass', usage: event.usage || null }
  }
  if (type === 'turn.failed') {
    return {
      type: 'TURN_FAILED',
      message: clip(event.error?.message || 'Codex could not finish this pass'),
      error: event.error || null,
    }
  }
  return null
}

export function filesFromCodexItems(items = []) {
  const files = []
  for (const item of items) {
    if (item?.type === 'file_change' || item?.type === 'file_update') {
      for (const row of item.changes || []) {
        if (row?.path) files.push(String(row.path).replace(/^\.\//, ''))
      }
      if (item.path) files.push(String(item.path).replace(/^\.\//, ''))
    }
  }
  return [...new Set(files.filter(Boolean))]
}

export function isKnownCodexEventType(type) {
  return CODEX_EVENT_TYPES.includes(type)
}
