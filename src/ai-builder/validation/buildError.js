const STACK_LINE = /^\s*at\s+/

function clip(text, max) {
  return String(text || '')
    .trim()
    .slice(0, max)
}

/**
 * Vite/esbuild stacks end with `responseCallbacks` internals. Owners need the
 * transform ERROR (file + message), not the Node stack tail.
 */
export function extractCompilerMessage(text, { max = 900 } = {}) {
  const raw = String(text || '').replace(/\r/g, '')
  if (!raw.trim()) return ''
  const transform = raw.match(/Transform failed with \d+ errors?:[\s\S]{0,1600}?(?:\n\s*at\s)/i)
  if (transform) return clip(transform[0].replace(/\n\s*at\s[\s\S]*$/, ''), max)
  const fileError = raw.match(/((?:src\/)?[\w./-]+\.jsx?:\d+(?::\d+)?):\s*ERROR:\s*([^\n]+)/i)
  if (fileError) {
    const start = raw.indexOf(fileError[0])
    return clip(raw.slice(start, start + 500), max)
  }
  const errorLine = raw.match(/ERROR:\s*([^\n]+)/)
  if (errorLine) return clip(`ERROR: ${errorLine[1]}`, max)
  const during = raw.match(/error during build:\s*([^\n]+)/i)
  if (during && !/esbuild\/lib\/main|responseCallbacks/.test(during[1])) return clip(during[1], max)
  const lines = raw
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && !STACK_LINE.test(line) && !/esbuild\/lib\/main\.js/.test(line))
  return clip(lines.slice(0, 14).join('\n') || raw, max)
}

export function isEsbuildIpcCrash(text) {
  const raw = String(text || '')
  if (/Transform failed|ERROR:\s|Could not resolve|Unexpected "/i.test(raw)) return false
  return /The service is no longer running|write EPIPE|service was stopped/i.test(raw)
}
