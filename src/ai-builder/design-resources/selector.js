import { COMPONENT_REFERENCES, getResourceById } from './catalog.js'
import { classifyDesignMode } from '../../../agent/core/designMode.js'

export function resourceMode({ intent, hasSite, rebuild, prompt, scoped = false } = {}) {
  const designMode = classifyDesignMode(prompt, intent, { scoped })
  if (scoped && designMode === 'PRESERVE') return 'PRESERVE'
  if (designMode === 'REIMAGINE') return 'REIMAGINE'
  if (designMode === 'REDESIGN') return 'REDESIGN'
  if (designMode === 'EVOLVE') return 'EVOLVE'
  if (designMode === 'PRESERVE') return 'PRESERVE'
  if (rebuild) return 'REDESIGN'
  if (intent === 'CREATE' || !hasSite) return 'REDESIGN'
  if (intent === 'DESIGN' && !scoped) return 'REDESIGN'
  return 'PRESERVE'
}

function askedFor(prompt, names) {
  const lower = String(prompt || '').toLowerCase()
  return names.some((name) => lower.includes(String(name).toLowerCase()))
}

function styleBlob({ prompt, style, spec } = {}) {
  return `${prompt || ''} ${style || ''} ${spec?.style || ''} ${spec?.look || ''} ${spec?.direction || ''}`.toLowerCase()
}

function pickFont(blob, spec) {
  const dir = String(spec?.direction || spec?.id || spec?.label || '').toLowerCase()
  if (askedFor(blob, ['fontshare', 'satoshi'])) return getResourceById('font-fontshare-satoshi')
  if (
    dir === 'editorial' ||
    dir === 'magazine' ||
    /fashion|editorial|clothing|apparel|boutique|lookbook|gossip/.test(blob)
  ) {
    return getResourceById('font-editorial-fashion')
  }
  if (dir === 'minimal-luxury' || dir === 'soft-luxury' || /luxury|elegant|quiet premium|minimal luxury/.test(blob)) {
    return getResourceById('font-luxury')
  }
  if (dir === 'neo-minimal' || /technolog|saas|software|startup|product ui/.test(blob)) {
    return getResourceById('font-tech')
  }
  if (
    dir === 'asymmetric' ||
    dir === 'experimental-grid' ||
    dir === 'immersive' ||
    /ultra-modern|asymmetric|contemporary brand/.test(blob)
  ) {
    return getResourceById('font-modern')
  }
  if (/neutral|dashboard|admin/.test(blob)) return getResourceById('font-inter')
  return getResourceById('font-modern')
}

function pickIcons(blob, existing) {
  if (existing.find((r) => r.category === 'icons')) return existing.find((r) => r.category === 'icons')
  if (askedFor(blob, ['font awesome', 'fontawesome'])) return getResourceById('font-awesome')
  if (askedFor(blob, ['bootstrap icons'])) return getResourceById('bootstrap-icons')
  if (askedFor(blob, ['material symbol', 'material icon'])) return getResourceById('material-symbols')
  return getResourceById('lucide')
}

function pickAnimation(blob) {
  if (/smooth scroll|lenis/.test(blob)) return getResourceById('lenis')
  if (/gsap|cinematic timeline|scroll hijack/.test(blob)) return getResourceById('gsap')
  if (/aos|scroll reveal|fade-up on scroll/.test(blob)) return getResourceById('aos')
  if (/motion one/.test(blob)) return getResourceById('motion-one')
  return getResourceById('css-animation')
}

function pickCssLibrary(blob) {
  if (askedFor(blob, ['pico css', 'picocss'])) return getResourceById('pico')
  if (askedFor(blob, ['bulma'])) return getResourceById('bulma')
  if (askedFor(blob, ['uikit'])) return getResourceById('uikit')
  if (askedFor(blob, ['bootstrap']) && !/bootstrap icons/.test(blob)) return getResourceById('bootstrap')
  if (askedFor(blob, ['tailwind'])) return getResourceById('tailwind-cdn')
  return getResourceById('native-css')
}

function pickComponents(blob) {
  const wanted = []
  const add = (id) => {
    const row = COMPONENT_REFERENCES.find((c) => c.id === id)
    if (row && !wanted.some((w) => w.id === row.id)) wanted.push(row)
  }
  add('editorial-nav')
  add('immersive-hero')
  add('card-collection')
  add('colophon-footer')
  if (/product|shop|clothing|fashion|catalogue|catalog/.test(blob)) add('product-grid')
  if (/gallery|lookbook/.test(blob)) add('lookbook')
  if (/review|testimonial/.test(blob)) add('testimonial-deck')
  if (/pric/.test(blob) || /offer/.test(blob)) add('pricing-bands')
  if (/faq|accordion/.test(blob)) add('faq-accordion')
  if (/form|contact/.test(blob)) add('contact-form')
  if (/cta|book|whatsapp/.test(blob)) add('fashion-cta')
  if (/modal|dialog|popup/.test(blob)) add('modal-native')
  if (/slider|carousel/.test(blob)) add('slider-snap')
  if (/menu/.test(blob)) add('overflow-menu')
  return wanted.slice(0, 8)
}

function toUsed(row, purpose) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    version: row.version || null,
    purpose: purpose || row.usage?.slice(0, 160) || '',
    source: row.cdn && row.injectCdn !== false && row.category !== 'images' ? 'cdn' : row.category === 'components' ? 'reference' : 'native',
    cdn: row.injectCdn === false ? null : row.cdn || row.js || null,
    heading: row.heading || null,
    body: row.body || null,
  }
}

export function selectDesignResources({
  prompt,
  style,
  spec,
  intent,
  existing = [],
  hasSite = false,
  rebuild = false,
  framework = 'react-vite',
  scoped = false,
} = {}) {
  const mode = resourceMode({ intent, hasSite, rebuild, prompt, scoped })
  const blob = styleBlob({ prompt, style, spec })
  const prior = (existing || []).map((row) => getResourceById(row.id || row.name)).filter(Boolean)

  if ((mode === 'PRESERVE' || mode === 'EVOLVE') && prior.length) {
    const images = getResourceById('getvia-images')
    const font = prior.find((r) => r.category === 'fonts') || pickFont(blob, spec)
    const icons = prior.find((r) => r.category === 'icons') || pickIcons(blob, prior)
    const animation = prior.find((r) => r.category === 'animation') || pickAnimation(blob)
    const cssLibrary = prior.find((r) => r.category === 'ui-css') || getResourceById('native-css')
    const used = [...prior.map((row) => toUsed(row, 'preserved')), toUsed(images, 'Prefer first-party photos')].filter(Boolean)
    return {
      mode,
      framework,
      reason: 'Preserve existing fonts/icons/animation unless the user asked to change them.',
      selected: prior,
      components: pickComponents(blob).slice(0, 3),
      used: dedupeUsed(used),
      cssLibrary,
      font,
      icons,
      animation,
    }
  }

  const cssLibrary = pickCssLibrary(blob)
  const font = pickFont(blob, spec)
  const icons = pickIcons(blob, prior)
  const animation = pickAnimation(blob)
  const images = getResourceById('getvia-images')
  const stock = /stock|unsplash|pexels/.test(blob) ? getResourceById('unsplash') : null
  const components = pickComponents(blob)
  const selected = [cssLibrary, font, icons, animation, images, stock].filter(Boolean)
  const used = [
    toUsed(cssLibrary, cssLibrary.id === 'native-css' ? 'Custom CSS in the design system, not a framework skin' : 'Requested CSS library — restyle to the brand'),
    toUsed(font, 'Typography for DesignSpec'),
    toUsed(icons, 'Single icon system'),
    toUsed(animation, animation.id === 'css-animation' ? 'CSS only; no animation CDN' : 'Optional enhancement; site must work without it'),
    toUsed(images, 'Business photos first'),
    stock ? toUsed(stock, 'Stock only when GetVia has no photo') : null,
    ...components.map((row) => toUsed(row, 'Structural reference — adapt to brand')),
  ].filter(Boolean)

  return {
    mode,
    framework,
    reason: 'Smallest set that matches the business and visual direction. Not a template kit.',
    selected,
    components,
    used: dedupeUsed(used),
    cssLibrary,
    font,
    icons,
    animation,
  }
}

function dedupeUsed(rows) {
  const seen = new Set()
  return rows.filter((row) => {
    const key = row.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function formatResourceBrief(selection) {
  if (!selection) return ''
  const lines = [
    'DESIGN RESOURCES (visual building blocks only — GetVia owns data and structure):',
    `Mode: ${selection.mode}. ${selection.reason}`,
    'Transform the existing Getvia profile presentation. Do not invent a new business or omit GetVia sections/functionality.',
    'Output is a React + Vite one-page app (src/App.jsx, src/components/*, src/index.css). Do not generate a standalone HTML/CSS/JS website.',
    'Do not make the site look like Bootstrap/Tailwind/Font Awesome.',
    'Prefer native CSS in src/index.css. Do not add extra CDNs.',
    'If the site already has a font or icon system, keep it on small edits.',
    'Keep existing business CTAs, phone, email, WhatsApp, enquiry, products, services, offers, gallery, and feed bindings.',
  ]
  for (const row of selection.used || []) {
    lines.push(`- ${row.category}: ${row.name}${row.version ? ` @${row.version}` : ''} (${row.purpose})`)
  }
  for (const comp of selection.components || []) {
    lines.push(`- component ref ${comp.id}: ${comp.structure.join(' → ')}. ${comp.adapt}`)
  }
  return lines.join('\n')
}
