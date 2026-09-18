import { sanitizeAiText } from '../lib/sanitize.js'
import { isEntireWebsiteTarget, normalizeSelectedElement } from '../lib/selectedElement.js'
import { AI_SECTION_TYPES } from '../constants.js'
import { paletteFromNamedColors } from '../theme/aiTheme.js'
import { resolveVisualLook } from '../theme/visualLook.js'

const LOCAL_KINDS = new Set(['remove_text', 'remove_component', 'text_color', 'update_text'])
export const NAMED_COLORS = {
  white: '#FFFFFF',
  black: '#111111',
  dark: '#0B0B0B',
  navy: '#1E3A8A',
  blue: '#1D4ED8',
  red: '#C81E1E',
  crimson: '#DC143C',
  pink: '#DB2777',
  rose: '#E11D48',
  magenta: '#C026D3',
  orange: '#EA580C',
  amber: '#D97706',
  gold: '#D4AF37',
  yellow: '#CA8A04',
  green: '#15803D',
  emerald: '#047857',
  teal: '#0F766E',
  purple: '#7C3AED',
  violet: '#6D28D9',
  grey: '#6B7280',
  gray: '#6B7280',
  silver: '#C0C0C0',
  beige: '#E8DCC8',
  cream: '#FFF8E7',
  brown: '#7C4A1E',
  maroon: '#7F1D1D',
}

const SECTION_HINTS = [
  ['hero', /\b(hero|banner|first section|main banner)\b/],
  ['about', /\babout\b/],
  ['services', /\bservices?\b/],
  ['products', /\b(products?|catalogue|catalog|new arrivals)\b/],
  ['offers', /\b(offers?|featured collections)\b/],
  ['faq', /\bfaqs?\b/],
  ['gallery', /\b(gallery|photos?|images?)\b/],
  ['reviews', /\b(reviews?|testimonials?)\b/],
  ['cta', /\b(cta|call to action)\b/],
  ['contact', /\b(contact|location|map)\b/],
  ['hours', /\b(hours|opening hours)\b/],
  ['footer', /\bfooter\b/],
]

export function quotedPhrases(text) {
  return [...String(text || '').matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1].trim()).filter(Boolean)
}

export function afterTo(text) {
  const quoted = String(text).match(/['"]([^'"]+)['"]/)
  if (quoted?.[1]) return quoted[1].trim()
  const m = String(text).match(/\bto\s+(.+)$/i)
  if (!m) return ''
  const value = m[1].trim()
  if (value.includes('. ') || /[.]\s*[A-Z]/.test(value)) return value
  return value.replace(/[.]+$/, '').trim()
}

function expandHex(raw) {
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  return `#${full.toUpperCase()}`
}

export function namedColorsFromPrompt(lower) {
  const found = []
  const seen = new Set()
  const push = (name, hex) => {
    const key = hex.toUpperCase()
    if (seen.has(key)) return
    seen.add(key)
    found.push({ name, hex: key })
  }
  for (const m of String(lower).matchAll(/#([0-9a-f]{3,6})\b/gi)) {
    push(`#${m[1]}`, expandHex(m[1]))
  }
  const names = Object.keys(NAMED_COLORS).join('|')
  const re = new RegExp(`\\b(${names})\\b`, 'gi')
  for (const m of String(lower).matchAll(re)) {
    const name = m[1].toLowerCase()
    push(name, NAMED_COLORS[name])
  }
  return found
}

export function colorFromPrompt(lower) {
  if (/\bblack\b/.test(lower) && /\bgold\b/.test(lower)) return null
  return namedColorsFromPrompt(lower)[0]?.hex || null
}

export function colorTargetFromPrompt(lower) {
  if (/\bfooter\b/.test(lower)) return 'footer'
  if (/\bbuttons?\b/.test(lower) && !/\b(text|heading|headline|title|name|label)\b/.test(lower)) return 'button'
  if (/\b(background|bg|page background)\b/.test(lower)) return 'background'
  if (/\bhero\b/.test(lower) && !/\b(text|heading|headline|title|name|label)\b/.test(lower)) return 'hero'
  return 'site'
}

export function inferLookFromPrompt(lower) {
  const named = resolveVisualLook(lower)
  if (named) return named
  const site = /\b(website|site|page|overall|theme|layout|design|look|cards?)\b/.test(lower)
  if (site && /luxur|elegant|premium/.test(lower) && !(/black/.test(lower) && /gold/.test(lower))) return 'premium'
  if (site && /modern|minimal|clean/.test(lower) && !/luxur|premium|elegant/.test(lower)) return 'modern'
  return null
}

function mentionedSections(lower) {
  const ids = SECTION_HINTS.filter(([, re]) => re.test(lower)).map(([id]) => id)
  if (ids.includes('faq') && ids.includes('gallery') && /\b(below|under|after|bellow|beneath)\b/.test(lower)) {
    return ids.filter((id) => id !== 'gallery')
  }
  return ids
}

function detectDomains(lower, requirements) {
  const domains = new Set()
  for (const req of requirements) {
    if (LOCAL_KINDS.has(req.kind) || req.kind === 'content') domains.add('content')
    if (req.kind === 'theme') domains.add('theme')
    if (req.kind === 'layout') domains.add('layout')
    if (req.kind === 'look' || req.kind === 'design') domains.add('design')
    if (req.kind === 'theme_color') domains.add('theme')
    if (req.kind === 'add_component' || req.kind === 'add_section' || req.kind === 'component') domains.add('component')
  }
  if (/\b(theme|palette|colour scheme|color scheme)\b/.test(lower) || (/black/.test(lower) && /gold/.test(lower))) {
    domains.add('theme')
  }
  if (/\b(layout|structure|grid|spacing|alignment|split hero|section order)\b/.test(lower)) domains.add('layout')
  if (
    /\b(design|look|style|visual|clay|glass|neomorph|premium|modern|card design|component design)\b/.test(lower)
  ) {
    domains.add('design')
  }
  if (
    (/\b(add|include|put|new|insert)\b/.test(lower) &&
      /\b(button|section|component|card|image|badge|reviews?|gallery|testimonials?)\b/.test(lower)) ||
    /\bui component/.test(lower)
  ) {
    domains.add('component')
  }
  if (/\b(content|copy|wording|headline|description|rewrite|heading|text)\b/.test(lower)) domains.add('content')
  return [...domains]
}

function requirementSummary(req) {
  if (req.kind === 'remove_text') return `Removed “${req.phrase}”`
  if (req.kind === 'remove_component') return `Removed the ${req.phrase || req.componentType || 'component'}`
  if (req.kind === 'theme_color') return `Apply ${req.colors?.join(' and ') || 'requested'} colours to the ${req.target || 'site'}`
  if (req.kind === 'text_color') return `Set the heading colour to ${req.color}`
  if (req.kind === 'update_text') return `Changed the heading to “${req.value}”`
  if (req.kind === 'look' || req.kind === 'design') return `Apply ${req.value || 'requested'} visual design`
  if (req.kind === 'theme') return `Apply ${req.value || 'requested'} theme`
  if (req.kind === 'layout') return `Change layout${req.value ? ` to ${req.value}` : ''}`
  if (req.kind === 'add_section') return `Add a ${req.sectionId} section`
  if (req.kind === 'add_component') return `Add a ${req.componentType || 'component'}${req.label ? ` (${req.label})` : ''}`
  if (req.kind === 'content') return req.value ? `Update ${req.target || 'copy'} to “${req.value}”` : `Rewrite ${req.target || 'content'}`
  return ''
}

export function buildSuggestedPrompts(analysis, { profile, websiteState, selectedElement } = {}) {
  const name = String(profile?.identity?.name || 'the business').trim() || 'the business'
  const order = websiteState?.sectionOrder || []
  const hasSite = Boolean(websiteState?.settings?.hasAiDesign && order.length)
  const selected = normalizeSelectedElement(selectedElement)
  const asked = new Set((analysis?.requirements || []).map((r) => r.kind))
  const domains = new Set(analysis?.domains || [])
  const suggestions = []
  const add = (text) => {
    const value = String(text || '').trim()
    if (!value || suggestions.includes(value) || value.toLowerCase() === String(analysis?.text || '').toLowerCase()) return
    if (suggestions.length < 5) suggestions.push(value)
  }

  if (!hasSite) {
    add(`Create a modern one-page website for ${name} with hero, about, services, and contact`)
    add(`Build a luxury black and gold site with premium cards, gallery, and WhatsApp`)
    add('Add a split hero, services, photo gallery, reviews, and a booking button')
    add('Write original homepage copy from my listing and keep the layout clean')
    return suggestions
  }

  if (asked.has('text_color') || asked.has('remove_text') || asked.has('update_text')) {
    add('Make the primary button gold')
    add('Rewrite the hero heading to match this colour')
    add('Change the layout without touching the heading colour')
  }
  if (domains.has('theme') || asked.has('theme') || asked.has('look')) {
    add('Keep this palette and make the cards more premium')
    add('Update the heading and button colours to match the theme')
    add('Add a gallery section that uses the same look')
  }
  if (domains.has('layout') || asked.has('layout')) {
    add('Make the service cards a two-column grid')
    add('Move contact above the footer')
    add('Add a reviews section under services')
  }
  if (domains.has('component') || asked.has('add_section') || asked.has('add_component')) {
    add('Rewrite the new section copy from my listing')
    add('Style the new section to match the rest of the site')
    add('Add a WhatsApp button in the hero')
  }
  if (domains.has('content') && !asked.has('text_color')) {
    add('Make the heading colour white')
    add('Shorten the about section copy')
    add('Add a clear booking call to action')
  }
  if (selected.sectionId && !isEntireWebsiteTarget(selected)) {
    add(`Make the ${selected.sectionId} section more premium`)
    add(`Rewrite the ${selected.sectionId} heading`)
  }
  if (!order.includes('reviews')) add('Add a reviews section with customer quotes')
  if (!order.includes('gallery')) add('Add a photo gallery section')
  add('Change the theme to black and gold')
  add('Make the layout more modern with better card design')
  add('Rewrite the hero heading')
  add('Add a WhatsApp button')
  return suggestions
}

export function analyzeUserPrompt(prompt, { profile, selectedElement, websiteState } = {}) {
  const text = sanitizeAiText(prompt, { max: 4000 })
  const lower = text.toLowerCase()
  const requirements = []
  const name = String(profile?.identity?.name || '').trim()
  const selected = normalizeSelectedElement(selectedElement)
  const sections = mentionedSections(lower)
  const look = inferLookFromPrompt(lower)
  const named = namedColorsFromPrompt(lower)
  const color = colorFromPrompt(lower)
  const colorTarget = colorTargetFromPrompt(lower)
  const luxuryGold = /\bblack\b/.test(lower) && /\bgold\b/.test(lower)
  const siteOrLook = /\b(theme|palette|layout|design|look|entire website|whole (site|website)|redesign|transform|restyle|cards?)\b/.test(
    lower,
  )
  const mentionsText = /\b(text|heading|headline|title|name|label|word|eyebrow|kicker)\b/.test(lower)
  const mentionsColourWord = /\b(colour|color|colours|colors)\b/.test(lower)
  const buttonOnly = /\bbutton\b/.test(lower) && !mentionsText
  const wantsPalette =
    !luxuryGold &&
    named.length > 0 &&
    (named.length >= 2 ||
      ['footer', 'button', 'background', 'hero'].includes(colorTarget) ||
      (/\b(theme|palette|colour scheme|color scheme|website|site|cards?)\b/.test(lower) && !mentionsText))

  if (/\b(remove|delete|hide|get rid of|take off|don't show|do not show)\b/.test(lower)) {
    const quoted = quotedPhrases(text)
    if (/\bbutton\b/.test(lower) || /shop new arrivals/i.test(text)) {
      const fromSentence = text.match(/\b(?:remove|delete|hide|get rid of|take off)\s+(?:the\s+)?(.+?)\s+button/i)?.[1]
      const phrase = quoted[0] || fromSentence || (/shop new arrivals/i.exec(text)?.[0] || '').trim()
      requirements.push({ kind: 'remove_component', componentType: 'button', phrase: String(phrase || '').trim() })
    } else {
      for (const phrase of quoted) {
        requirements.push({ kind: 'remove_text', phrase })
      }
      if (/one-?page website/.test(lower)) {
        requirements.push({ kind: 'remove_text', phrase: 'One-page website' })
      } else if (!quoted.length) {
        const m = text.match(
          /\b(?:remove|delete|hide)\s+(?:the\s+)?(?:word\s+|text\s+)?["']?([A-Za-z][A-Za-z0-9' -]{0,40}?)["']?(?:\s|$)/i,
        )
        const phrase = m?.[1]?.trim()
        if (phrase && !/^(the|a|an|this|that|button|section|text|word)$/i.test(phrase)) {
          requirements.push({ kind: 'remove_text', phrase })
        }
      }
    }
  }

  if (wantsPalette) {
    const palette = paletteFromNamedColors(
      named.map((row) => row.hex),
      { target: colorTarget },
    )
    if (palette) {
      requirements.push({
        kind: 'theme_color',
        palette,
        colors: named.map((row) => row.hex),
        target: colorTarget,
      })
    }
  } else if (color && !luxuryGold && !buttonOnly) {
    const mentionsTheme = /\b(theme|palette|entire website|whole (site|website)|redesign|layout|look and feel)\b/.test(lower)
    if (mentionsText || mentionsColourWord || (!mentionsTheme && !/\b(create|build|generate)\b/.test(lower))) {
      requirements.push({
        kind: 'text_color',
        color,
        target: /\b(nav|header|logo)\b/.test(lower) ? 'nav' : 'hero-heading',
        nameHint: name,
      })
    }
  }

  if (
    /hero heading|hero headline|heading to |headline to |change the heading/.test(lower) ||
    (/\bhero\b/.test(lower) && /heading|headline/.test(lower) && /\bto\b/.test(lower))
  ) {
    const value = afterTo(text)
    if (value && !/^shop /i.test(value) && !colorFromPrompt(value.toLowerCase())) {
      requirements.push({ kind: 'update_text', target: 'hero-heading', value })
    }
  } else if (/\b(rewrite|update|change|edit)\b/.test(lower) && /\b(copy|content|description|wording|about)\b/.test(lower)) {
    const value = afterTo(text)
    requirements.push({
      kind: 'content',
      target: sections[0] || selected.sectionId || 'hero',
      value: value && !colorFromPrompt(value.toLowerCase()) ? value : '',
      action: value ? 'update' : 'rewrite',
    })
  }

  const wantsAdd = /\b(add|include|put a|put an|insert)\b/.test(lower)
  if (wantsAdd && /\bbutton\b/.test(lower)) {
    requirements.push({
      kind: 'add_component',
      componentType: 'button',
      sectionId: sections[0] || 'hero',
      label: quotedPhrases(text)[0] || (text.match(/\b(?:add|put|include)\s+(?:a|an|strong)?\s*['"]?(.+?)['"]?\s+button/i)?.[1] || '').replace(/\bstrong\b/gi, '').trim() || (/shop [^.,]+/i.exec(text)?.[0] || '').replace(/\bbutton\b/i, '').trim(),
    })
  } else if (wantsAdd && /\b(image|photo|picture)\b/.test(lower) && !/\bgallery\b/.test(lower)) {
    requirements.push({ kind: 'add_component', componentType: 'image', sectionId: sections[0] || 'hero' })
  } else if (wantsAdd && /\bfaqs?\b/.test(lower)) {
    requirements.push({
      kind: 'add_section',
      sectionId: 'faq',
      afterSectionId: /\b(below|under|after|bellow|beneath).{0,24}gallery\b/.test(lower) ? 'gallery' : null,
    })
  } else if (wantsAdd) {
    const addable = sections.filter((id) => AI_SECTION_TYPES.includes(id) && id !== 'hero')
    for (const sectionId of addable) {
      requirements.push({
        kind: 'add_section',
        sectionId,
        afterSectionId: null,
      })
    }
  }

  if (
    look &&
    !requirements.some((r) => ['text_color', 'remove_text', 'remove_component', 'theme_color'].includes(r.kind))
  ) {
    requirements.push({ kind: 'look', value: look })
    requirements.push({ kind: 'design', value: look })
  }

  if ((/black/.test(lower) && /(gold|white)/.test(lower)) || /black,\s*white\s*and\s*gold/.test(lower)) {
    requirements.push({ kind: 'theme', value: 'luxury_black_gold' })
  } else if (/\b(theme|palette|colour scheme|color scheme)\b/.test(lower) && look) {
    requirements.push({ kind: 'theme', value: look })
  }

  if (/\b(layout|structure|grid|section order|split hero)\b/.test(lower)) {
    requirements.push({ kind: 'layout', value: look || 'original', sections })
  }
  if (/\b(card design|component design|cards? more|premium cards|modern cards)\b/.test(lower)) {
    requirements.push({ kind: 'design', target: sections.includes('services') ? 'services' : 'cards', value: look || 'premium' })
  }

  const domains = detectDomains(lower, requirements)
  const local =
    requirements.length > 0 &&
    requirements.every((r) => LOCAL_KINDS.has(r.kind)) &&
    !domains.some((d) => d === 'theme' || d === 'layout' || d === 'design' || d === 'component') &&
    !siteOrLook
  const scope = local ? 'local' : isEntireWebsiteTarget(selected) || domains.includes('layout') || domains.includes('theme') || /entire website|whole (site|website)/.test(lower)
    ? 'site'
    : sections[0] || selected.sectionId
      ? 'section'
      : 'site'
  const summary = requirements.map(requirementSummary).filter(Boolean).join('. ')
  const brief = [
    `User request: ${text}`,
    domains.length ? `Domains: ${domains.join(', ')}` : 'Domains: general',
    `Scope: ${scope}`,
    summary ? `Requirements: ${summary}` : 'Requirements: implement the user request as stated',
    local ? 'Constraint: change only the named text or colour. Do not restyle the website.' : 'Constraint: implement the stated design, theme, layout, component, or content change. Do not invent a different website.',
  ].join('\n')
  const analysis = {
    text,
    lower,
    requirements,
    domains,
    scope,
    local,
    sendToAi: !local,
    summary,
    brief,
    suggestions: [],
  }
  analysis.suggestions = buildSuggestedPrompts(analysis, { profile, websiteState, selectedElement: selected })
  return analysis
}

export function analysisToRequirementChanges(analysis) {
  const changes = []
  for (const req of analysis?.requirements || []) {
    if (req.kind === 'look' || req.kind === 'design') {
      changes.push({ target: 'theme', property: 'look', value: req.value })
      changes.push({ target: 'theme', property: 'style', value: req.value })
    }
    if (req.kind === 'theme') {
      changes.push({ target: 'theme', property: 'primaryPalette', value: req.value })
    }
    if (req.kind === 'theme_color') {
      changes.push({ target: 'theme', property: 'colors', value: req.palette })
    }
    if (req.kind === 'layout') {
      changes.push({ target: 'theme', property: 'layout', value: req.value || 'original' })
    }
    if (req.kind === 'add_section') {
      changes.push({ target: 'sections', property: 'add', value: req.sectionId, afterSectionId: req.afterSectionId || null })
    }
    if (req.kind === 'add_component') {
      changes.push({
        target: 'components',
        property: 'add',
        value: req.componentType,
        sectionId: req.sectionId,
        label: req.label,
      })
    }
    if (req.kind === 'content' || req.kind === 'update_text') {
      changes.push({ target: 'content', property: req.target || 'copy', value: req.value || 'rewrite' })
    }
    if (req.kind === 'text_color') {
      changes.push({ target: 'style', property: 'headingColor', value: req.color })
    }
  }
  return changes
}
