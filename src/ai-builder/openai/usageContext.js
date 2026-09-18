import { AsyncLocalStorage } from 'node:async_hooks'

const usageStore = new AsyncLocalStorage()

export function getUsageContext() {
  return usageStore.getStore() || {}
}

export function runWithUsageContext(ctx, fn) {
  return usageStore.run({ ...(ctx || {}) }, fn)
}
