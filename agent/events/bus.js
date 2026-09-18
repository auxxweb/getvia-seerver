import { EventEmitter } from 'node:events'

const bus = new EventEmitter()
bus.setMaxListeners(200)

function key(jobId) {
  return `job:${String(jobId || '')}`
}

export function publishTaskEvent(jobId, event) {
  if (!jobId || !event) return
  bus.emit(key(jobId), event)
  bus.emit('task-event', { jobId: String(jobId), event })
}

export function subscribeTaskEvents(jobId, listener) {
  const channel = key(jobId)
  bus.on(channel, listener)
  return () => bus.off(channel, listener)
}
