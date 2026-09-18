export const DESIGN_MODES = Object.freeze(['PRESERVE', 'EVOLVE', 'REDESIGN', 'REIMAGINE'])

const INTENT_DEFAULT = Object.freeze({
  EDIT: 'PRESERVE',
  FEATURE: 'PRESERVE',
  FIX: 'PRESERVE',
  DEBUG: 'PRESERVE',
  CONTENT: 'PRESERVE',
  SEO: 'PRESERVE',
  REFACTOR: 'PRESERVE',
  REMOVE: 'PRESERVE',
  UNDO: 'PRESERVE',
  ANALYZE: 'PRESERVE',
  CREATE: 'REDESIGN',
  REDESIGN: 'REDESIGN',
  REIMAGINE: 'REIMAGINE',
})

export function classifyDesignMode(prompt, intent, { scoped = false } = {}) {
  const text = String(prompt || '')
  if (scoped && intent !== 'CREATE' && intent !== 'REIMAGINE') {
    if (/\b(reimagine|from scratch|brand new look|totally different|completely (new|different)|look completely different)\b/i.test(text)) {
      return 'REIMAGINE'
    }
    if (/\b(redesign|restyle|new design|new look|transform)\b/i.test(text) && /\b(entire|whole|all sections|site[- ]wide)\b/i.test(text)) {
      return 'REDESIGN'
    }
    if (/\b(evolve|refresh|nudge the look|subtle restyle|improve (the )?design)\b/i.test(text)) {
      return 'EVOLVE'
    }
    return 'PRESERVE'
  }
  if (/\b(reimagine|from scratch|brand new look|totally different|completely (new|different)|look completely different)\b/i.test(text) || intent === 'REIMAGINE') {
    return 'REIMAGINE'
  }
  if (
    /\b(redesign|restyle|new design|new look|transform|make (it|my (site|website|profile)) look|luxury fashion|different from (the )?(standard|template))\b/i.test(
      text,
    ) ||
    intent === 'REDESIGN' ||
    intent === 'CREATE' ||
    intent === 'DESIGN'
  ) {
    return 'REDESIGN'
  }
  if (/\b(evolve|refresh|nudge the look|subtle restyle|improve (the )?design)\b/i.test(text)) {
    return 'EVOLVE'
  }
  if (/\b(keep the (look|design|layout)|preserve|don't change the design|do not change the design)\b/i.test(text)) {
    return 'PRESERVE'
  }
  return INTENT_DEFAULT[intent] || 'PRESERVE'
}

export function noveltyFor(mode, prompt = '', intent = '') {
  if (intent === 'REIMAGINE' || mode === 'REIMAGINE') return 5
  if (mode === 'PRESERVE' || intent === 'EDIT') return 1
  if (mode === 'EVOLVE') return /\btiny\b/i.test(prompt) ? 1 : 2
  if (mode === 'REDESIGN' || intent === 'CREATE' || intent === 'DESIGN') {
    return /\b(major|complete|full|overhaul|completely)\b/i.test(prompt) ? 4 : 3
  }
  return 1
}

export function isDesignOverhaul(mode) {
  return mode === 'REDESIGN' || mode === 'REIMAGINE'
}
