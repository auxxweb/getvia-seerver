export function extractQuotedText(prompt) {
  const match = String(prompt || '').match(/['"“”]([^'"“”]+)['"“”]/)
  return String(match?.[1] || '').trim()
}

export function wantsHeadingChange(prompt) {
  return /\b(h1|heading|headline|title)\b/i.test(String(prompt || ''))
}

export function wantsWhatsApp(prompt) {
  return /whatsapp/i.test(String(prompt || ''))
}

export function wantsCssChange(prompt) {
  return /\b(css|stylesheet|background|padding|margin|font-size|hero background)\b/i.test(String(prompt || ''))
}

export function wantsNewComponent(prompt) {
  return /\badd (a |an )?(new )?(hours|gallery|faq|testimonial|booking|component|section)\b/i.test(String(prompt || ''))
}

export function wantsMultiFileFeature(prompt) {
  return /\b(hero and footer|homepage and footer|across (the )?site|booking note)\b/i.test(String(prompt || ''))
}

function cssColor(prompt) {
  const named = String(prompt || '').match(/\b(navy|blue|black|gold)\b/i)?.[1]?.toLowerCase()
  if (named === 'navy' || named === 'blue') return '#0f172a'
  if (named === 'black') return '#111111'
  if (named === 'gold') return '#c9a227'
  const hex = String(prompt || '').match(/#(?:[0-9a-f]{3,8})\b/i)?.[0]
  return hex || ''
}

export function applyCssEdit(contents, rel, prompt) {
  if (!rel.endsWith('.css')) return { next: contents, changed: false }
  const color = cssColor(prompt)
  if (!color) return { next: contents, changed: false }
  if (contents.includes(`background: ${color}`) || contents.includes(`--heroBg: ${color}`)) {
    return { next: contents, changed: false }
  }
  if (/--heroBg:/.test(contents)) {
    return { next: contents.replace(/--heroBg:\s*[^;]+/, `--heroBg: ${color}`), changed: true }
  }
  return { next: `${contents.trim()}\n.hero { background: ${color}; }\n`, changed: true }
}

export function applyComponentEdit(contents, rel) {
  if (!/\.(jsx|tsx)$/.test(rel)) return { next: contents, changed: false }
  if (/id=["']hours["']/.test(contents)) return { next: contents, changed: false }
  const hours = `
      <section id="hours" className="section hours">
        <h2>Hours</h2>
        <p>{business.hours || 'See the listing for opening hours.'}</p>
      </section>`
  if (contents.includes('<Hero />')) {
    return { next: contents.replace('<Hero />', `<Hero />${hours}`), changed: true }
  }
  if (contents.includes('</div>')) {
    return { next: contents.replace('</div>', `${hours}\n    </div>`), changed: true }
  }
  return { next: contents, changed: false }
}

export function applyMultiFileEdit(contents, rel) {
  if (rel.endsWith('.css')) {
    if (contents.includes('.booking-note')) return { next: contents, changed: false }
    return { next: `${contents.trim()}\n.booking-note { letter-spacing: .08em; text-transform: uppercase; font-size: .75rem; }\n`, changed: true }
  }
  if (!/\.(jsx|tsx)$/.test(rel)) return { next: contents, changed: false }
  if (contents.includes('booking-note')) return { next: contents, changed: false }
  let next = contents
  if (/className=["']btn primary["']/.test(next)) {
    next = next.replace(
      /(<a className=["']btn primary["'][\s\S]*?<\/a>)/,
      `$1\n      <p className="booking-note">Book a visit</p>`,
    )
  }
  if (!/<footer[\s>]/.test(next)) {
    next = next.replace(
      /(\s*)<\/div>(\s*\n\s*\)\s*\n\s*\})/,
      `\n      <footer id="footer" className="footer"><span className="booking-note">Book a visit</span></footer>$1</div>$2`,
    )
  }
  if (next !== contents) return { next, changed: true }
  return { next: contents, changed: false }
}

function unique(list) {
  return [...new Set((list || []).filter(Boolean))]
}

export function applyHeadingEdit(contents, rel, title) {
  if (!title) return { next: contents, changed: false }
  if (rel.endsWith('.json')) {
    try {
      const data = JSON.parse(contents)
      if (!data.hero || typeof data.hero !== 'object') data.hero = {}
      if (data.hero.title === title) return { next: contents, changed: false }
      data.hero.title = title
      return { next: `${JSON.stringify(data, null, 2)}\n`, changed: true }
    } catch {
      return { next: contents, changed: false }
    }
  }
  if (!/\.(jsx|tsx|html)$/.test(rel)) return { next: contents, changed: false }
  if (contents.includes(`<h1>${title}</h1>`)) return { next: contents, changed: false }
  const literal = contents.replace(/<h1>([^<{][\s\S]*?)<\/h1>/, `<h1>${title}</h1>`)
  if (literal !== contents) return { next: literal, changed: true }
  return { next: contents, changed: false }
}

const WHATSAPP_PLACEHOLDER = {
  field: 'whatsapp',
  source: 'getvia',
  message: 'Add WhatsApp in your GetVia listing to show it on the website.',
}

export function applyWhatsAppEdit(contents, rel) {
  if (rel.endsWith('.json')) {
    try {
      const data = JSON.parse(contents)
      if (data.whatsapp) return { next: contents, changed: false }
      data.placeholders = Array.isArray(data.placeholders) ? data.placeholders : []
      if (!data.placeholders.some((row) => row?.field === 'whatsapp')) {
        data.placeholders.push({ ...WHATSAPP_PLACEHOLDER })
      }
      return { next: `${JSON.stringify(data, null, 2)}\n`, changed: true }
    } catch {
      return { next: contents, changed: false }
    }
  }
  if (!/\.(jsx|tsx)$/.test(rel)) return { next: contents, changed: false }
  if (/WhatsApp/i.test(contents) && /business\.whatsapp/.test(contents)) return { next: contents, changed: false }
  const button = `{business.whatsapp ? <a className="btn whatsapp" href={business.whatsapp}>WhatsApp</a> : <span className="placeholder" data-placeholder="whatsapp">WhatsApp</span>}`
  if (contents.includes(button)) return { next: contents, changed: false }
  if (/className=["']btn primary["']/.test(contents)) {
    const next = contents.replace(
      /(<a className=["']btn primary["'][\s\S]*?<\/a>)/,
      `$1\n      ${button}`,
    )
    if (next !== contents) return { next, changed: true }
  }
  const heroClose = contents.replace(/(<\/section>\s*\n\s*\))/, `\n      ${button}$1`)
  if (heroClose !== contents) return { next: heroClose, changed: true }
  return { next: contents, changed: false }
}

export function expectedEvidence(prompt, intent, spec, profile) {
  const quoted = extractQuotedText(prompt)
  const fromProfile = profile?.name && (intent === 'CREATE' || intent === 'REDESIGN' || intent === 'REIMAGINE')
    ? [profile.name]
    : []
  if (quoted) return [...fromProfile, quoted]
  if (spec?.direction && (intent === 'REDESIGN' || intent === 'REIMAGINE' || intent === 'CREATE')) {
    return [...fromProfile, spec.direction, spec.heroComposition, spec.navigationStrategy].filter(Boolean)
  }
  if (wantsWhatsApp(prompt) || (intent === 'FEATURE' && /whatsapp/i.test(prompt))) {
    return [...fromProfile, 'WhatsApp', 'whatsapp']
  }
  if (wantsNewComponent(prompt)) return [...fromProfile, 'Hours', 'hours']
  if (wantsMultiFileFeature(prompt)) return [...fromProfile, 'booking-note']
  if (wantsCssChange(prompt)) {
    const color = String(prompt).match(/#(?:[0-9a-f]{3,8})\b/i)?.[0] || cssColor(prompt)
    return [...fromProfile, color, '.hero'].filter(Boolean)
  }
  return fromProfile
}

export function filesForPlan(context, prompt, { designMode, intent } = {}) {
  const ranked = [...(context?.files || [])]
  if (designMode && designMode !== 'PRESERVE') {
    ranked.unshift('src/App.jsx', 'src/index.css', 'src/data/design.json', 'src/design-system/tokens.js')
  }
  if (
    intent === 'CREATE' ||
    wantsHeadingChange(prompt) ||
    wantsWhatsApp(prompt) ||
    wantsCssChange(prompt) ||
    wantsNewComponent(prompt) ||
    wantsMultiFileFeature(prompt)
  ) {
    ranked.unshift('src/App.jsx', 'src/data/business.json', 'src/index.css', 'index.html')
  }
  return unique(ranked).slice(0, 8)
}

export function applyHeuristicEdit({ prompt, intent, path: rel, contents }) {
  if (wantsHeadingChange(prompt) && (intent === 'EDIT' || intent === 'CONTENT')) {
    const title = extractQuotedText(prompt)
    if (title) return applyHeadingEdit(contents, rel, title)
  }
  if (wantsMultiFileFeature(prompt) && (intent === 'FEATURE' || intent === 'EDIT' || intent === 'CREATE')) {
    return applyMultiFileEdit(contents, rel)
  }
  if (wantsNewComponent(prompt) && (intent === 'FEATURE' || intent === 'EDIT' || intent === 'CREATE')) {
    return applyComponentEdit(contents, rel)
  }
  if (wantsCssChange(prompt) && (intent === 'EDIT' || intent === 'FEATURE' || intent === 'CONTENT')) {
    return applyCssEdit(contents, rel, prompt)
  }
  if (wantsWhatsApp(prompt) && (intent === 'FEATURE' || intent === 'EDIT' || intent === 'CREATE')) {
    return applyWhatsAppEdit(contents, rel)
  }
  return { next: contents, changed: false }
}
