function joinSignals(parent, local) {
  const out = new AbortController()
  const fire = () => {
    if (!out.signal.aborted) out.abort()
  }
  if (parent?.aborted || local?.aborted) fire()
  parent?.addEventListener('abort', fire, { once: true })
  local?.addEventListener('abort', fire, { once: true })
  return out
}

export { joinSignals }
