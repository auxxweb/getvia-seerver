export const INTENTS = Object.freeze([
  'CREATE',
  'EDIT',
  'REDESIGN',
  'REIMAGINE',
  'FEATURE',
  'FIX',
  'DEBUG',
  'CONTENT',
  'SEO',
  'REFACTOR',
  'REMOVE',
  'UNDO',
  'ANALYZE',
])

const RULES = [
  { intent: 'UNDO', re: /\b(undo|revert|roll\s*back|go back)\b/i },
  { intent: 'ANALYZE', re: /\b(where is|what is|which file|show me|explain|locate|find the)\b/i },
  { intent: 'REIMAGINE', re: /\b(reimagine|from scratch|brand new look|totally different)\b/i },
  { intent: 'REDESIGN', re: /\b(redesign|restyle|new design|make it look)\b/i },
  { intent: 'SEO', re: /\b(seo|meta description|og:title|canonical)\b/i },
  { intent: 'DEBUG', re: /\b(debug|stack trace|console error|exception)\b/i },
  { intent: 'FIX', re: /\b(fix|broken|not working|doesn'?t work|repair)\b/i },
  { intent: 'REMOVE', re: /\b(remove|delete|drop the|get rid of)\b/i },
  { intent: 'REFACTOR', re: /\b(refactor|clean up|cleanup|reorganize)\b/i },
  { intent: 'CREATE', re: /\b(create|build|generate|make me|new (web)?site)\b/i },
  { intent: 'FEATURE', re: /\b(add|new button|new section|whatsapp|feature)\b/i },
  { intent: 'CONTENT', re: /\b(h1|heading|headline|copy|text|title|subtitle)\b/i },
  { intent: 'EDIT', re: /\b(change|update|set|rename|edit|replace)\b/i },
]

export function classifyIntent(prompt) {
  const text = String(prompt || '').trim()
  if (!text) return { intent: 'ANALYZE', confidence: 0, prompt: text }
  for (const rule of RULES) {
    if (rule.re.test(text)) {
      const intent = rule.intent === 'CONTENT' && /\b(change|update|set|edit|replace)\b/i.test(text) ? 'EDIT' : rule.intent
      return { intent, confidence: 0.9, prompt: text }
    }
  }
  return { intent: 'EDIT', confidence: 0.4, prompt: text }
}

export function isReadOnlyIntent(intent) {
  return intent === 'ANALYZE'
}

export function isMutatingIntent(intent) {
  return !isReadOnlyIntent(intent) && intent !== 'UNDO'
}
