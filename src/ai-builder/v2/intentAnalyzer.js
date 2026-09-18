const INTENTS = [
  'CREATE',
  'EDIT',
  'FEATURE',
  'DESIGN',
  'CONTENT',
  'DEBUG',
  'REFACTOR',
  'SEO',
  'ACCESSIBILITY',
  'PERFORMANCE',
  'REMOVE',
  'RESTORE',
  'UNDO',
  'INSPECT',
]

export const INTENT_TYPES = INTENTS

export function analyzeIntent(prompt, { hasSite = false, selectedElement = null } = {}) {
  const text = String(prompt || '').trim()
  const lower = text.toLowerCase()
  let type = hasSite ? 'EDIT' : 'CREATE'

  if (/\b(undo|roll ?back|revert last)\b/.test(lower)) type = 'UNDO'
  else if (/\b(restore|recover checkpoint)\b/.test(lower)) type = 'RESTORE'
  else if (/\b(do not modify|don't modify|inspect only|read only|tell me which file|find the homepage|where is the)\b/.test(lower) && !/\b(change|add|fix|create|build|generate)\b/.test(lower)) {
    type = 'INSPECT'
  }
  else if (/\b(remove|delete|drop|get rid of|take off)\b/.test(lower)) type = 'REMOVE'
  else if (
    /\b(look completely different|make my (salon |restaurant |hotel |boutique )?(website|site|profile) look|transform my|new visual|redesign|reimagine)\b/.test(
      lower,
    )
  ) {
    type = 'DESIGN'
  } else if (
    !hasSite &&
    /\b(create|build|generate|make)\b/.test(lower) &&
    /\b(website|site|page|landing)\b/.test(lower)
  ) {
    type = 'CREATE'
  } else if (/\b(broken|bug|crash|error|fix|doesn't work|does not work|overflow)\b/.test(lower)) type = 'DEBUG'
  else if (/\b(seo|meta description|open graph|canonical|sitemap)\b/.test(lower)) type = 'SEO'
  else if (/\b(a11y|accessibility|contrast|aria|alt text|keyboard)\b/.test(lower)) type = 'ACCESSIBILITY'
  else if (/\b(faster|performance|bundle|lazy load|optimize images)\b/.test(lower)) type = 'PERFORMANCE'
  else if (/\b(refactor|reuse component|clean up)\b/.test(lower)) type = 'REFACTOR'
  else if (
    /\b(glassmorph|claymorph|neomorph|luxury|editorial|minimal|modern|brutalist|futuristic|organic|theme|look|style|design|dark mode|colour|color|dark|light)\b/.test(
      lower,
    )
  ) {
    type = 'DESIGN'
  } else if (
    /\b(add|include|put|new)\b/.test(lower) &&
    /\b(pricing|gallery|nav|menu|whatsapp|booking|section|button|faq|testimonial|review)\b/.test(lower)
  ) {
    type = 'FEATURE'
  } else if (/\b(copy|headline|wording|rewrite|text|content|description)\b/.test(lower)) type = 'CONTENT'
  else if (!hasSite) type = 'CREATE'

  return {
    type,
    confidence: type === 'EDIT' && hasSite ? 0.6 : 0.85,
    prompt: text.slice(0, 4000),
    rebuild: /\b(start over|from scratch|rebuild (the )?(site|website)|reset (the )?(site|website))\b/i.test(text),
    supported: INTENTS.includes(type),
    selectedElement: selectedElement || null,
  }
}
