import { sanitizeAiText } from '../lib/sanitize.js'
import { applyAiTheme, paletteFromNamedColors, resolveAiThemePreset } from '../theme/aiTheme.js'
import { isEntireWebsiteTarget, normalizeSelectedElement } from '../lib/selectedElement.js'
import { resolveSectionId, resolveTarget, sectionExists } from './targetResolver.js'
import { hydrateSectionComponents, listAllButtons, listButtons } from './hydrateComponents.js'
import { AI_SECTION_TYPES } from '../constants.js'
import { COMPONENT_TYPES } from '../state/componentRegistry.js'
import { isHardUnsupportedCapability, lookStylePatch, resolveVisualLook } from '../theme/visualLook.js'
import {
  afterTo,
  analyzeUserPrompt,
  inferLookFromPrompt,
  namedColorsFromPrompt,
} from './promptAnalysis.js'
import { isExplicitSiteWidePrompt, sectionsMentionedInPrompt } from './editScope.js'

export { analyzeUserPrompt, inferLookFromPrompt } from './promptAnalysis.js'

function rewriteCopyForSection(sectionId, profile, state) {
  const name = String(profile?.identity?.name || '').trim()
  const desc = String(profile?.identity?.description || state?.content?.description || '').trim()
  const landing = state?.content?.landing || {}
  if (sectionId === 'hero') {
    const heading = landing.bannerTitle && landing.bannerTitle !== name ? name || landing.bannerTitle : name ? `Welcome to ${name}` : 'Welcome'
    return { heading, body: desc || landing.bannerDescription || 'Visit us and get in touch today.' }
  }
  if (sectionId === 'about') {
    return {
      heading: name ? `About ${name}` : 'About us',
      body: desc || landing.welcomeDescription || `Learn more about ${name || 'our work'}.`,
    }
  }
  return {
    heading: name || 'Welcome',
    body: desc || 'Get in touch to find out more.',
  }
}

function distinctLook(state) {
  const current = String(state?.theme?.look || state?.theme?.preset || 'original')
  if (current === 'premium') return 'modern'
  return 'premium'
}

function gallerySrc(state) {
  const gallery = state?.content?.gallery
  if (Array.isArray(gallery) && gallery[0]) return typeof gallery[0] === 'string' ? gallery[0] : gallery[0].url || gallery[0].src
  return state?.content?.landing?.bannerImageUrl || ''
}

function stripPhrase(source, phrase) {
  if (!source || !phrase) return String(source || '')
  const escaped = String(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return String(source)
    .replace(new RegExp(escaped, 'ig'), ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function normLabel(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function headingText(state) {
  const hero = (state?.pages?.[0]?.sections || []).find((row) => row.id === 'hero' || row.type === 'hero')
  const heading = (hero?.components || []).find((row) => row.type === 'heading')
  return heading?.props?.text || state?.content?.landing?.bannerTitle || ''
}

function buttonLabelFrom(text) {
  const quoted = String(text).match(/['"]([^'"]+)['"]/)
  if (quoted?.[1]) return quoted[1].trim()
  const named = String(text).match(/\b(?:add|put|include)\s+(?:a|an|strong)?\s*['"]?(.+?)['"]?\s+button/i)
  if (named?.[1] && !/^(to the|in the|on the)\b/i.test(named[1].trim())) {
    return named[1].replace(/\bstrong\b/gi, '').replace(/\s+/g, ' ').trim()
  }
  const shop = String(text).match(/shop [^.,]+/i)
  if (shop) return shop[0].replace(/\bbutton\b/i, '').trim()
  if (/\bbook\b|\bappointment\b/.test(String(text).toLowerCase())) return 'Book Appointment'
  return 'Get in touch'
}

function buttonDestinationFrom(text, state) {
  const lower = String(text || '').toLowerCase()
  if (/new arrival/.test(lower) && sectionExists(state, 'products')) {
    return { href: '#new-arrivals', action: { type: 'SHOP_NEW_ARRIVALS', target: 'new-arrivals' } }
  }
  if (/\bwhatsapp\b/.test(lower)) {
    return { href: '#contact', action: { type: 'WHATSAPP', target: 'contact' } }
  }
  const dest = /book|appointment|booking/.test(lower)
    ? resolveSectionId('booking', state) || resolveSectionId('contact', state) || 'contact'
    : 'contact'
  const htmlId = dest === 'products' ? 'new-arrivals' : dest
  return { href: `#${htmlId}`, action: { type: 'SCROLL_TO_SECTION', target: htmlId } }
}

function parseReorder(text, state) {
  const lower = String(text || '').toLowerCase()
  if (!/(move|put|place).*(above|before|first)|above featured|before featured/.test(lower)) return null
  const beforePhrase = String(text).match(/\b(?:above|before)\s+(?:the\s+)?(.+?)(?:\s+section)?\.?\s*$/i)?.[1]
  const moveId =
    resolveSectionId(text.replace(/\b(?:above|before)\s+(?:the\s+)?.+$/i, ''), state) ||
    resolveSectionId(text, state) ||
    resolveSectionId('new arrivals', state)
  const beforeId = beforePhrase
    ? resolveSectionId(beforePhrase, state)
    : /featured/.test(lower)
      ? resolveSectionId('featured collections', state)
      : null
  return { moveId, beforeId }
}

export function isLocalEditPrompt(prompt, extras = {}) {
  return analyzeUserPrompt(prompt, extras).local
}

export function isSiteWideChangePrompt(prompt) {
  const text = String(prompt || '').trim()
  const lower = text.toLowerCase()
  if (!text) return false
  if (isLocalEditPrompt(text)) return false
  // Named single-section edits are never site-wide (e.g. "make the hero darker").
  const mentioned = sectionsMentionedInPrompt(text)
  const broadExtras = /\b(everything|overall|entire|whole|all sections|cards?|components?)\b/.test(lower)
  if (mentioned.length === 1 && !isExplicitSiteWidePrompt(text) && !broadExtras) return false
  if (/\b(only|just|solely)\b/.test(lower) && mentioned.length >= 1 && !isExplicitSiteWidePrompt(text)) return false
  if (isExplicitSiteWidePrompt(text)) return true
  if (resolveVisualLook(lower)) return true
  if (/\b(entire website|whole (site|website|page)|all sections)\b/.test(lower)) return true
  if (/\b(transform|redesign|restyle|rebrand|makeover)\b/.test(lower) && /\b(website|site|page|layout|design)\b/.test(lower)) {
    return true
  }
  if (/\b(layout|structure|card design|component design|visual (style|design)|spacing|typography)\b/.test(lower)) return true
  if (/\b(cards?|components?)\b/.test(lower) && /\b(design|style|layout|look|premium|modern)\b/.test(lower)) return true
  const parts = (lower.match(/\b(hero|about|services|gallery|reviews|contact|footer|nav)\b/g) || []).length
  if (parts >= 2 && /\b(design|style|layout|change|update|make|improve)\b/.test(lower)) return true
  if (
    /\b(website|site|homepage|page)\b/.test(lower) &&
    /\b(change|update|make|design|style|look|transform|improve|premium|modern)\b/.test(lower) &&
    !mentioned.length
  ) {
    return true
  }
  if (text.length >= 80 && /\b(website|site|homepage)\b/.test(lower) && !mentioned.length) return true
  return false
}

export function isFullWebsiteBuildPrompt(prompt) {
  if (isLocalEditPrompt(prompt)) return false
  const text = String(prompt || '').trim()
  const lower = text.toLowerCase()
  if (!text) return false
  if (/\b(do not|don't|dont)\s+(rebuild|regenerate|start over)\b/i.test(lower)) return false
  if (/\bkeep the existing (content|website|site|copy)\b/i.test(lower)) return false
  const asksCreate =
    /\b(create|build|generate|rebuild)\b/.test(lower) &&
    /\b(website|site|homepage|landing page|one-page|one page)\b/.test(lower) &&
    !/\bbuild and verify\b/i.test(lower)
  const longBrief = text.length >= 240 || (text.match(/\n/g) || []).length >= 4
  const manySections = (lower.match(/\b(hero|about|services|gallery|reviews|contact|footer|offers)\b/g) || []).length >= 4
  if (asksCreate) return true
  if ((resolveVisualLook(lower) || /\b(visual style|look and feel)\b/.test(lower)) && !asksCreate) return false
  if (/\b(transform|redesign)\b/.test(lower) && /\b(website|site)\b/.test(lower) && (longBrief || manySections)) return true
  return false
}

export function isDesignerMutationPrompt(prompt) {
  if (isFullWebsiteBuildPrompt(prompt)) return false
  const text = String(prompt || '').trim()
  const lower = text.toLowerCase()
  const createSite = /^(create|build|generate)\b/.test(lower) && /(website|site|page)\b/.test(lower)
  const mentionsPart = /(button|heading|hero|card|section|banner|mobile|arrivals|collections)\b/.test(lower)
  if (createSite && !mentionsPart) return false
  return true
}

function siteWideLookOperations(look, state) {
  const preset = resolveAiThemePreset(look) || resolveAiThemePreset('original')
  const patch = lookStylePatch(look || 'original')
  const operations = [
    {
      type: 'UPDATE_THEME',
      target: { site: true, pageId: 'home' },
      changes: { preset: look || 'original', look: look || 'original', colors: applyAiTheme({}, preset || {}) },
    },
    {
      type: 'UPDATE_STYLE',
      target: { site: true, pageId: 'home' },
      changes: patch,
    },
  ]
  for (const sectionId of state?.sectionOrder || []) {
    operations.push({
      type: 'UPDATE_STYLE',
      target: { pageId: 'home', sectionId },
      changes: { visualStyle: look || 'premium', cardStyle: patch.cardStyle },
    })
  }
  return operations
}

export function interpretDesignerRequest({ prompt, selectedElement, state, profile } = {}) {
  const text = sanitizeAiText(prompt, { max: 4000 })
  const lower = text.toLowerCase()
  const selected = normalizeSelectedElement(selectedElement)
  const hydrated = hydrateSectionComponents(state || {})
  const operations = []
  const resolvedTargets = []
  let outcome = 'SUCCESS'
  let message = ''
  const analysis = analyzeUserPrompt(text, { profile, selectedElement: selected, websiteState: hydrated })

  if (isFullWebsiteBuildPrompt(text) && !analysis.local) {
    return {
      outcome: 'REROUTE_WEBSITE_BUILD',
      operations: [],
      resolvedTargets: [],
      intent: 'WEBSITE_BUILD',
      message: 'This is a full website request. GetVia will generate the site from your brief.',
      analysis,
    }
  }

  if (isHardUnsupportedCapability(text)) {
    return {
      outcome: 'UNSUPPORTED_CAPABILITY',
      operations: [],
      resolvedTargets: [],
      intent: 'UNSUPPORTED',
      message: "The current GetVia AI site doesn't support that feature yet. I haven't changed the website.",
      analysis,
    }
  }

  for (const req of analysis.requirements) {
    if (req.kind === 'remove_component') {
      const needle = normLabel(req.phrase)
      const matches = listAllButtons(hydrated).filter((btn) => {
        const label = normLabel(btn.props?.text)
        return !needle || label === needle || label.includes(needle) || needle.includes(label)
      })
      for (const btn of matches) {
        operations.push({
          type: 'REMOVE_COMPONENT',
          target: { pageId: 'home', sectionId: btn.sectionId, componentId: btn.id },
          changes: { removed: true },
        })
        resolvedTargets.push({ pageId: 'home', sectionId: btn.sectionId, componentId: btn.id, confidence: 'high' })
      }
    }
    if (req.kind === 'remove_text') {
      if (/one-?page website/i.test(req.phrase)) {
        operations.push({
          type: 'UPDATE_STYLE',
          target: { pageId: 'home', sectionId: 'hero' },
          changes: { hideKicker: true, kicker: '' },
        })
        resolvedTargets.push({ pageId: 'home', sectionId: 'hero', confidence: 'high' })
      }
      const current = headingText(hydrated)
      const next = stripPhrase(current, req.phrase)
      if (next !== current) {
        operations.push({
          type: 'UPDATE_TEXT',
          target: { pageId: 'home', sectionId: 'hero', componentId: 'hero-heading' },
          value: next || String(profile?.identity?.name || 'Welcome'),
        })
        resolvedTargets.push({ pageId: 'home', sectionId: 'hero', componentId: 'hero-heading', confidence: 'high' })
      }
    }
    if (req.kind === 'text_color') {
      operations.push({
        type: 'UPDATE_STYLE',
        target: { pageId: 'home', sectionId: 'hero', componentId: 'hero-heading' },
        changes: { color: req.color },
      })
      operations.push({
        type: 'UPDATE_STYLE',
        target: { pageId: 'home', sectionId: 'hero' },
        changes: { headingColor: req.color },
      })
      resolvedTargets.push({ pageId: 'home', sectionId: 'hero', componentId: 'hero-heading', confidence: 'high' })
    }
    if (req.kind === 'update_text') {
      operations.push({
        type: 'UPDATE_TEXT',
        target: { pageId: 'home', sectionId: 'hero', componentId: 'hero-heading' },
        value: req.value,
      })
    }
    if (req.kind === 'add_section' && req.sectionId) {
      operations.push({
        type: 'ADD_SECTION',
        target: { pageId: 'home', sectionId: req.sectionId },
        sectionType: req.sectionId,
        afterSectionId: req.afterSectionId || null,
        changes: { sectionId: req.sectionId, visible: true, afterSectionId: req.afterSectionId || null },
      })
      resolvedTargets.push({ pageId: 'home', sectionId: req.sectionId, confidence: 'high' })
    }
    if (req.kind === 'theme_color' && req.palette) {
      operations.push({
        type: 'UPDATE_THEME',
        target: { site: true, pageId: 'home' },
        changes: { colors: req.palette },
      })
      resolvedTargets.push({ site: true, pageId: 'home', confidence: 'high' })
    }
    if (req.kind === 'content') {
      const sectionId = req.target && AI_SECTION_TYPES.includes(req.target) ? req.target : 'about'
      const copy = req.value
        ? { heading: req.value, body: '' }
        : rewriteCopyForSection(sectionId, profile, hydrated)
      operations.push({
        type: 'UPDATE_TEXT',
        target: { pageId: 'home', sectionId, componentId: `${sectionId}-heading` },
        value: copy.heading,
      })
      if (copy.body) {
        operations.push({
          type: 'UPDATE_TEXT',
          target: { pageId: 'home', sectionId, componentId: `${sectionId}-description` },
          value: copy.body,
        })
      }
      resolvedTargets.push({ pageId: 'home', sectionId, confidence: 'high' })
    }
    if (req.kind === 'add_component') {
      const sectionId = req.sectionId && AI_SECTION_TYPES.includes(req.sectionId) ? req.sectionId : 'hero'
      if (req.componentType === 'image') {
        const src = gallerySrc(hydrated)
        if (src) {
          operations.push({
            type: 'ADD_COMPONENT',
            target: { pageId: 'home', sectionId },
            component: { type: 'image', props: { src, alt: profile?.identity?.name || 'Photo' } },
          })
        } else {
          operations.push({
            type: 'ADD_SECTION',
            target: { pageId: 'home', sectionId: 'gallery' },
            sectionType: 'gallery',
            changes: { sectionId: 'gallery', visible: true },
          })
        }
      } else {
        const dest = buttonDestinationFrom(text, hydrated)
        const label = req.label || buttonLabelFrom(text)
        const arrivals = /new arrival/i.test(text)
        const productsOk = sectionExists(hydrated, 'products')
        if (arrivals && !productsOk) {
          operations.push({
            type: 'ADD_SECTION',
            target: { pageId: 'home', sectionId: 'products' },
            sectionType: 'products',
            afterSectionId: 'hero',
          })
        }
        operations.push({
          type: 'ADD_COMPONENT',
          target: { pageId: 'home', sectionId },
          component: {
            type: req.componentType || 'button',
            props: {
              text: label,
              variant: /gold/.test(lower) ? 'gold' : 'primary',
              href: dest.href,
              action: dest.action,
            },
          },
        })
      }
      resolvedTargets.push({ pageId: 'home', sectionId, componentType: req.componentType || 'button', confidence: 'high' })
    }
    if ((req.kind === 'look' || req.kind === 'design' || req.kind === 'theme' || req.kind === 'layout') && !analysis.local) {
      if (operations.some((op) => op.type === 'UPDATE_THEME' || op.changes?.look)) continue
      const namedLook = req.value && req.value !== 'original' ? req.value : inferLookFromPrompt(lower)
      const appliedLook = namedLook && namedLook !== 'original' ? namedLook : distinctLook(hydrated)
      if (req.kind === 'theme' && req.value === 'luxury_black_gold') {
        const preset = resolveAiThemePreset('luxury_black_gold')
        operations.push({
          type: 'UPDATE_THEME',
          target: { site: true, pageId: 'home' },
          changes: { preset: 'luxury_black_gold', colors: applyAiTheme({}, preset) },
        })
      } else {
        operations.push(...siteWideLookOperations(appliedLook, hydrated))
      }
      resolvedTargets.push({ site: true, pageId: 'home', confidence: 'high' })
    }
  }

  const alreadyThemed = operations.some((op) => op.type === 'UPDATE_THEME' || op.changes?.look)
  const look = analysis.local ? null : inferLookFromPrompt(lower)
  if (look && !alreadyThemed) {
    operations.push(...siteWideLookOperations(look, hydrated))
    resolvedTargets.push({ site: true, pageId: 'home', sectionId: null, confidence: 'high' })
  }

  const siteWideTheme =
    !analysis.local && ((/black/.test(lower) && /(gold|white)/.test(lower)) || /black,\s*white\s*and\s*gold/.test(lower))
  const explicitHero = /\bhero\b|\bbanner\b|\bfirst section\b|\bmain banner\b/.test(lower)
  const explicitButton = /\bbutton\b/.test(lower)
  const manyParts = (lower.match(/\b(hero|about|services|gallery|reviews|contact|footer|nav|cards?|layout)\b/g) || []).length >= 2
  const wholeSite =
    isEntireWebsiteTarget(selected) ||
    isSiteWideChangePrompt(text) ||
    (manyParts && /website|site|entire|whole/.test(lower))

  if (siteWideTheme && (wholeSite || /website|site/.test(lower))) {
    const preset = resolveAiThemePreset('luxury_black_gold')
    operations.push({
      type: 'UPDATE_THEME',
      target: { site: true, pageId: 'home' },
      changes: { preset: 'luxury_black_gold', colors: applyAiTheme({}, preset) },
    })
    resolvedTargets.push({ pageId: 'home', sectionId: null, confidence: 'high' })
  } else if (/\bpremium\b/.test(lower) && /website|site|overall/.test(lower) && !explicitHero && !/card/.test(lower)) {
    const preset = resolveAiThemePreset('premium')
    operations.push({
      type: 'UPDATE_THEME',
      target: { site: true, pageId: 'home' },
      changes: { preset: 'premium', colors: applyAiTheme({}, preset) },
    })
  }

  if (explicitHero && /(attractive|premium|better|beautiful|stronger)/.test(lower)) {
    operations.push({
      type: 'UPDATE_STYLE',
      target: { pageId: 'home', sectionId: 'hero' },
      changes: { visualStyle: 'premium', height: 'tall', alignment: 'center' },
    })
    resolvedTargets.push({ pageId: 'home', sectionId: 'hero', confidence: 'high' })
  }

  if (selected.sectionId && /\b(this|it)\b/.test(lower) && /premium|attractive/.test(lower) && !explicitHero && !/website|site/.test(lower)) {
    operations.push({
      type: 'UPDATE_STYLE',
      target: { pageId: 'home', sectionId: selected.sectionId },
      changes: { visualStyle: 'premium' },
    })
  }

  const wantsButton =
    (/\badd\b/.test(lower) || /\bput a\b/.test(lower) || /\bput an\b/.test(lower) || /\binclude\b/.test(lower)) &&
    (explicitButton || /shop new arrival/.test(lower))
  if (wantsButton && !operations.some((op) => op.type === 'ADD_COMPONENT' && (op.component?.type === 'button' || op.componentType === 'button'))) {
    const label = buttonLabelFrom(text)
    const dest = buttonDestinationFrom(text, hydrated)
    const productsOk = sectionExists(hydrated, 'products')
    if (/new arrival/i.test(text) && !productsOk) {
      operations.push({
        type: 'ADD_SECTION',
        target: { pageId: 'home', sectionId: 'products' },
        sectionType: 'products',
        afterSectionId: 'hero',
      })
    }
    const heroTarget = resolveTarget({ prompt: text, selectedElement, state: hydrated, hint: explicitHero ? 'hero' : selected.sectionId || 'hero' })
    operations.push({
      type: 'ADD_COMPONENT',
      target: { pageId: 'home', sectionId: heroTarget.sectionId || 'hero' },
      component: {
        type: 'button',
        props: {
          text: label,
          variant: /strong|primary|gold/.test(lower) ? (/gold/.test(lower) ? 'gold' : 'primary') : 'primary',
          href: dest.href,
          action: dest.action,
        },
      },
    })
    resolvedTargets.push({ pageId: 'home', sectionId: 'hero', componentType: 'button', confidence: 'high' })
  }

  if (/hero heading|hero headline|heading to |headline to |change the heading/.test(lower) || (explicitHero && /heading|headline/.test(lower) && /\bto\b/.test(lower))) {
    const value = afterTo(text)
    if (value && !/^shop /i.test(value)) {
      operations.push({
        type: 'UPDATE_TEXT',
        target: { pageId: 'home', sectionId: 'hero', componentId: 'hero-heading' },
        value,
      })
    }
  }

  if (!/\badd\b/.test(lower) && !/\bput a\b/.test(lower) && /change|rename/.test(lower) && (explicitButton || /shop now/.test(lower)) && /\bto\b/.test(lower)) {
    const value = afterTo(text) || 'Shop New Arrivals'
    const target = resolveTarget({ prompt: text, selectedElement, state: hydrated, hint: 'hero' })
    const buttons = listButtons(hydrated, 'hero')
    const componentId = target.componentId || buttons[buttons.length - 1]?.id || 'hero-button-primary'
    operations.push({
      type: 'UPDATE_TEXT',
      target: { pageId: 'home', sectionId: 'hero', componentId },
      value,
    })
  }

  if (explicitButton && /gold/.test(lower) && !siteWideTheme) {
    const target = resolveTarget({ prompt: text, selectedElement, state: hydrated, hint: 'hero' })
    const buttons = listButtons(hydrated, target.sectionId || 'hero')
    const componentId = target.componentId || buttons[buttons.length - 1]?.id || 'hero-button-primary'
    operations.push({
      type: 'UPDATE_STYLE',
      target: { pageId: 'home', sectionId: target.sectionId || 'hero', componentId },
      changes: { variant: 'gold', background: '#D4AF37', color: '#111111' },
    })
  }

  if (explicitButton && /(scroll|open|link).*(new arrival|book|booking|appointment|contact)/.test(lower) && !wantsButton) {
    const wantsBooking = /book|booking|appointment|contact/.test(lower)
    const dest = wantsBooking
      ? resolveSectionId('contact', hydrated) || 'contact'
      : resolveSectionId('new arrivals', hydrated) || 'products'
    const htmlId = dest === 'products' ? 'new-arrivals' : dest
    if (!sectionExists(hydrated, dest) && !wantsBooking) {
      return {
        outcome: 'NEEDS_CLARIFICATION',
        operations,
        resolvedTargets,
        intent: 'UPDATE_LINK',
        message: 'There is no New Arrivals section to scroll to. I have not changed the button destination.',
      }
    }
    const target = resolveTarget({ prompt: text, selectedElement, state: hydrated, hint: 'hero' })
    const buttons = listButtons(hydrated, 'hero')
    operations.push({
      type: 'UPDATE_LINK',
      target: { pageId: 'home', sectionId: 'hero', componentId: target.componentId || buttons[buttons.length - 1]?.id || 'hero-button-primary' },
      action: { type: 'SCROLL_TO_SECTION', target: htmlId },
      changes: { href: `#${htmlId}`, action: { type: 'SCROLL_TO_SECTION', target: htmlId } },
    })
  }

  const reorder = parseReorder(text, hydrated)
  if (reorder) {
    if (!reorder.moveId || !reorder.beforeId) {
      return {
        outcome: 'NEEDS_CLARIFICATION',
        operations,
        resolvedTargets,
        intent: 'REORDER_SECTION',
        message: 'I could not tell which sections to reorder. Say which section should move above which other section.',
      }
    }
    operations.push({
      type: 'REORDER_SECTION',
      target: { pageId: 'home', sectionId: reorder.moveId },
      beforeSectionId: reorder.beforeId,
    })
  }

  if (/product card|cards more premium|catalogue card|product cards|card design|service cards/.test(lower)) {
    operations.push({
      type: 'UPDATE_STYLE',
      target: { pageId: 'home', sectionId: /service/.test(lower) ? 'services' : 'products' },
      changes: { visualStyle: inferLookFromPrompt(lower) || 'premium', cardStyle: inferLookFromPrompt(lower) || 'premium' },
    })
  }

  if (/\b(layout|structure|component design)\b/.test(lower) && !look && !alreadyThemed) {
    operations.push(...siteWideLookOperations(distinctLook(hydrated), hydrated))
  }

  if (/\bmobile\b|\bphone\b/.test(lower) && (explicitHero || explicitButton || /website|site|perfect/.test(lower))) {
    operations.push({
      type: 'UPDATE_RESPONSIVE_STYLE',
      target: { pageId: 'home', sectionId: explicitHero || explicitButton ? 'hero' : 'hero' },
      changes: { viewport: 'mobile', buttonFullWidth: true, headingScale: 'sm' },
    })
    if (/website|site|perfect/.test(lower)) {
      operations.push({
        type: 'UPDATE_RESPONSIVE_STYLE',
        target: { pageId: 'home', sectionId: 'products' },
        changes: { viewport: 'mobile', stack: true },
      })
    }
  }

  if (!operations.length) {
    if (analysis.local) {
      return {
        outcome: 'FAILED',
        operations: [],
        resolvedTargets,
        intent: 'LOCAL_EDIT',
        message: 'I could not apply that text change. Nothing was modified.',
        analysis,
        suggestions: analysis.suggestions,
        profileUsed: Boolean(profile?.identity?.name),
      }
    }
    const leftoverColors = namedColorsFromPrompt(lower)
    if (leftoverColors.length && !(/black/.test(lower) && /gold/.test(lower))) {
      const palette = paletteFromNamedColors(
        leftoverColors.map((row) => row.hex),
        { target: /\bfooter\b/.test(lower) ? 'footer' : /\bbuttons?\b/.test(lower) ? 'button' : 'site' },
      )
      if (palette) {
        operations.push({
          type: 'UPDATE_THEME',
          target: { site: true, pageId: 'home' },
          changes: { colors: palette },
        })
        resolvedTargets.push({ site: true, pageId: 'home', confidence: 'medium' })
      }
    }
    const fallbackLook = inferLookFromPrompt(lower)
    const wantsVisual =
      analysis.domains.includes('design') || analysis.domains.includes('layout') || analysis.domains.includes('theme')
    if (!operations.length && wantsVisual) {
      operations.push(...siteWideLookOperations(fallbackLook && fallbackLook !== 'original' ? fallbackLook : distinctLook(hydrated), hydrated))
      resolvedTargets.push({ site: true, pageId: 'home', sectionId: null, confidence: 'medium' })
    } else if (!operations.length) {
      const copy = rewriteCopyForSection(selected.sectionId && AI_SECTION_TYPES.includes(selected.sectionId) ? selected.sectionId : 'hero', profile, hydrated)
      operations.push({
        type: 'UPDATE_TEXT',
        target: {
          pageId: 'home',
          sectionId: selected.sectionId && AI_SECTION_TYPES.includes(selected.sectionId) ? selected.sectionId : 'hero',
          componentId: selected.sectionId && selected.sectionId !== 'site' ? `${selected.sectionId}-heading` : 'hero-heading',
        },
        value: copy.heading,
      })
      resolvedTargets.push({ pageId: 'home', sectionId: 'hero', confidence: 'low' })
    }
  }

  const intent = analysis.local ? 'LOCAL_EDIT' : operations.length > 1 ? 'MULTI_ACTION' : operations[0].type
  message = analysis.summary || ''
  return {
    outcome,
    operations,
    resolvedTargets: resolvedTargets.length ? resolvedTargets : [resolveTarget({ prompt: text, selectedElement, state: hydrated })],
    intent,
    message,
    analysis,
    suggestions: analysis.suggestions,
    sendToAi: analysis.sendToAi,
    profileUsed: Boolean(profile?.identity?.name),
  }
}

export function normalizeDesignerOperations(operations = []) {
  const out = []
  const skipped = []
  for (const op of operations || []) {
    if (!op || typeof op !== 'object') continue
    const type = op.type || op.operation
    const target = { ...(op.target || {}) }
    const sectionName = typeof op.component === 'string' ? op.component : op.componentType || op.sectionType
    if (type === 'ADD_COMPONENT' && sectionName && AI_SECTION_TYPES.includes(sectionName) && !op.component?.type) {
      out.push({
        type: 'ADD_SECTION',
        target: { pageId: 'home', sectionId: sectionName },
        sectionType: sectionName,
        changes: { sectionId: sectionName, visible: true },
      })
      continue
    }
    if (type === 'ADD_COMPONENT') {
      const ctype = op.component?.type || op.componentType
      if (!COMPONENT_TYPES.includes(ctype)) {
        skipped.push({ op, reason: 'unsupported component' })
        continue
      }
      if (!target.sectionId) target.sectionId = 'hero'
      out.push({ ...op, type, target })
      continue
    }
    if (type === 'UPDATE_THEME') {
      const hasExplicitColors =
        op.changes?.colors && typeof op.changes.colors === 'object' && Object.keys(op.changes.colors).length
      const palette = op.changes?.preset || op.changes?.colorPalette || op.value || ''
      const look = op.changes?.look
      const preset = palette ? resolveAiThemePreset(palette) : null
      const colors = hasExplicitColors ? applyAiTheme({}, op.changes.colors) : preset ? applyAiTheme({}, preset) : null
      out.push({
        type: 'UPDATE_THEME',
        target: { site: true, pageId: 'home' },
        changes: {
          ...(palette ? { preset: String(palette) } : {}),
          ...(look ? { look } : {}),
          ...(op.changes?.layout ? { layout: op.changes.layout } : {}),
          ...(colors ? { colors } : {}),
        },
      })
      continue
    }
    if (type === 'UPDATE_LINK' && (op.changes?.whatsappLink || op.changes?.callLink || op.changes?.bookingLink) && !op.target?.componentId) {
      out.push({
        type: 'FUNCTIONALITY_CHANGE',
        target: { site: true },
        changes: {
          whatsapp: op.changes.whatsappLink != null,
          call: op.changes.callLink != null,
          enquiry: op.changes.bookingLink != null,
        },
      })
      continue
    }
    if (!target.sectionId && !target.componentId && !target.site && type !== 'UPDATE_THEME' && type !== 'FUNCTIONALITY_CHANGE' && type !== 'ADD_SECTION') {
      skipped.push({ op, reason: 'missing target' })
      continue
    }
    out.push({ ...op, type, target })
  }
  return { operations: out, skipped }
}

export function summarizeMutations(applied = []) {
  if (!applied.length) return ''
  return applied
    .map((row) => row.summary)
    .filter(Boolean)
    .slice(0, 8)
    .join('. ')
}
