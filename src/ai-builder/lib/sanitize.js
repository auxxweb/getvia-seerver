const SCRIPT = /<\s*script[\s\S]*?>[\s\S]*?<\s*\/\s*script\s*>/gi
const TAGS = /<\/?[^>]+>/g
const JS_URL = /^\s*javascript:/i
const DATA_HTML = /^\s*data:text\/html/i

export function sanitizeAiText(value, { max = 4000 } = {}) {
  let s = String(value ?? '')
  s = s.replace(SCRIPT, '')
  s = s.replace(TAGS, '')
  s = s.replace(/\u0000/g, '')
  if (JS_URL.test(s) || DATA_HTML.test(s)) return ''
  s = s.trim()
  if (s.length > max) s = s.slice(0, max)
  return s
}

export function sanitizeUrl(value) {
  const s = String(value ?? '').trim()
  if (!s) return ''
  if (JS_URL.test(s) || DATA_HTML.test(s)) return ''
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(s)) return s.slice(0, 2000)
  if (/^(wa\.me|api\.whatsapp\.com)/i.test(s)) return `https://${s}`
  return s.slice(0, 2000)
}

export function looksLikePromptInjection(text) {
  const t = String(text || '').toLowerCase()
  return (
    t.includes('ignore previous') ||
    t.includes('ignore all instructions') ||
    t.includes('system prompt') ||
    t.includes('reveal the api key') ||
    t.includes('dump other businesses')
  )
}
