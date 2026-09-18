export function activityEvent(type, message, extra = {}) {
  return {
    type,
    message,
    at: new Date().toISOString(),
    ...extra,
  }
}

export class ActivityLog {
  constructor() {
    this.events = []
  }
  push(type, message, extra) {
    const event = activityEvent(type, message, extra)
    this.events.push(event)
    return event
  }
}
