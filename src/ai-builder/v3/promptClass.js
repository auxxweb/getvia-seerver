/**
 * Cheap, deterministic prompt classes for the V3 router and shared brain.
 * No LLM. Never store PII in class ids.
 */

export const PROMPT_CLASSES = Object.freeze([
  'create-site',
  'redesign-site',
  'scoped-design',
  'feature-enquiry',
  'feature-whatsapp',
  'feature-button',
  'feature-contact',
  'copy-edit',
  'fix-repair',
  'other',
])

const FEATURE_CLASSES = new Set([
  'feature-enquiry',
  'feature-whatsapp',
  'feature-button',
  'feature-contact',
  'copy-edit',
])

const EXPENSIVE_CLASSES = new Set(['create-site', 'redesign-site'])

export function userFacingPrompt(prompt) {
  return String(prompt || '')
    .split(/\n\n(?:PRODUCT CONTRACT:|DESIGN RESOURCES:|DESIGN DNA:|DESIGN RESEARCH:|GETVIA WEBSITE INTELLIGENCE:|SELF-LEARNING|PRECISE EDIT TARGET:|EXECUTION SCOPE:)/)[0]
    .trim()
}

export function anonymizeSnippet(prompt, max = 160) {
  return String(prompt || '')
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '[email]')
    .replace(/\+?\d[\d\s-]{7,}\d/g, '[phone]')
    .replace(/https?:\/\/[^\s]+/gi, '[url]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

export function classifyPromptClass(prompt) {
  const text = userFacingPrompt(prompt)
  const lower = text.toLowerCase()
  if (!lower) return 'other'
  if (/\b(fix|broken|error|overflow|undo|revert|repair|build failed)\b/.test(lower)) return 'fix-repair'
  if (
    /\b(create|build|generate|make)\b/.test(lower) &&
    /\b(website|site|landing page)\b/.test(lower) &&
    !/\b(only|just|section)\b/.test(lower)
  ) {
    return 'create-site'
  }
  if (/\b(redesign|reimagine|rebrand|makeover|look completely different)\b/.test(lower) && /\b(website|site|page)\b/.test(lower)) {
    return 'redesign-site'
  }
  if (/\b(enquir|inquiry|contact form)\b/.test(lower) && /\b(post|submit|getvia|admin|form)\b/.test(lower)) {
    return 'feature-enquiry'
  }
  if (/\bwhatsapp\b/.test(lower)) return 'feature-whatsapp'
  if (/\b(add|remove|delete)\b/.test(lower) && /\b(button|cta|book appointment|shop new arrivals)\b/.test(lower)) {
    return 'feature-button'
  }
  if (/\b(contact|phone|email|booking form)\b/.test(lower) && lower.length < 320) return 'feature-contact'
  if (/\b(h1|heading|title|copy|text)\b/.test(lower) && lower.length < 240) return 'copy-edit'
  if (/\b(hero|about|footer|nav|gallery|services|only)\b/.test(lower) && !/\bentire|whole site\b/.test(lower)) {
    return 'scoped-design'
  }
  return 'other'
}

export function isFeatureClass(promptClass) {
  return FEATURE_CLASSES.has(promptClass)
}

export function isExpensiveClass(promptClass) {
  return EXPENSIVE_CLASSES.has(promptClass)
}

export function extractRequirements(prompt) {
  const lower = userFacingPrompt(prompt).toLowerCase()
  const req = []
  if (/\benquir|inquiry|contact form\b/.test(lower)) req.push('enquiry-to-getvia')
  if (/\bwhatsapp\b/.test(lower)) req.push('whatsapp')
  if (/\b(phone|call button|tel:)\b/.test(lower)) req.push('phone')
  if (/\bmobile\b/.test(lower)) req.push('mobile')
  if (/\bpremium|luxury\b/.test(lower)) req.push('premium-look')
  return [...new Set(req)]
}

export function normalizeCategory(category) {
  return String(category || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40) || 'general'
}
