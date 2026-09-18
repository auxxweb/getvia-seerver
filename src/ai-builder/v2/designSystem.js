import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveAiThemePreset, applyAiTheme, inferAiTypography } from '../theme/aiTheme.js'
import { resolveVisualLook } from '../theme/visualLook.js'
import { inferLookFromPrompt } from '../mutations/promptAnalysis.js'
import { buildDesignDna } from '../getvia/designDna.js'

export const DESIGN_DIRECTIONS = [
  'luxury',
  'minimal',
  'modern',
  'editorial',
  'glassmorphism',
  'claymorphism',
  'dark',
  'light',
  'premium',
  'corporate',
  'brutalist',
  'futuristic',
  'elegant',
  'organic',
  'immersive',
  'magazine',
  'asymmetric',
  'industrial',
  'coastal',
  'wellness',
  'clinical',
  'fitness',
  'saas',
  'hospitality',
  'fashion',
]

const LOOK_FOR_DIRECTION = {
  luxury: 'premium',
  editorial: 'premium',
  elegant: 'premium',
  premium: 'premium',
  dark: 'premium',
  futuristic: 'premium',
  brutalist: 'modern',
  minimal: 'modern',
  modern: 'modern',
  corporate: 'modern',
  light: 'modern',
  organic: 'modern',
  glassmorphism: 'glassmorphism',
  claymorphism: 'claymorphism',
}

export function resolveDesignDirection(prompt, currentLook) {
  const lower = String(prompt || '').toLowerCase()
  const named = resolveVisualLook(lower) || inferLookFromPrompt(lower)
  if (named) return { direction: named, look: named }
  for (const dir of DESIGN_DIRECTIONS) {
    if (lower.includes(dir)) return { direction: dir, look: LOOK_FOR_DIRECTION[dir] || currentLook || 'modern' }
  }
  return { direction: currentLook || 'modern', look: currentLook || 'modern' }
}

function promptNamesLook(prompt) {
  const lower = String(prompt || '').toLowerCase()
  if (resolveVisualLook(lower) || inferLookFromPrompt(lower)) return true
  return DESIGN_DIRECTIONS.some((dir) => lower.includes(dir))
}

export function designSpecFrom({ prompt, business, resources, explore, preserveLook = false, research, mode, novelty } = {}) {
  const resolved = resolveDesignDirection(prompt, business?.look)
  const preset = resolveAiThemePreset(resolved.look) || resolveAiThemePreset(business?.look) || resolveAiThemePreset('original')
  let colors = promptNamesLook(prompt)
    ? applyAiTheme({}, preset || {})
    : business?.colors && Object.keys(business.colors).length
      ? business.colors
      : applyAiTheme({}, preset || {})
  if (!preserveLook && explore?.chosen?.colorStrategy) {
    colors = { ...colors, ...explore.chosen.colorStrategy }
  }
  const type = inferAiTypography(resolved.direction || resolved.look)
  const font = resources?.font || (resources?.selected || []).find((row) => row.category === 'fonts')
  const fontHeading = font?.heading || type?.headingFont || "Georgia, 'Times New Roman', serif"
  const fontBody = font?.body || type?.bodyFont || 'Georgia, serif'
  const animationResource = resources?.animation
  const spec = {
    style: explore?.chosen?.direction || resolved.direction,
    look: resolved.look,
    layout: explore?.chosen?.layoutStyle || (resolved.look === 'premium' ? 'asymmetric' : 'stacked'),
    colors,
    typography: { ...type, headingFont: fontHeading, bodyFont: fontBody },
    fontHeading,
    fontBody,
    radius: resolved.look === 'minimal' ? '2px' : resolved.look === 'claymorphism' ? '1.5rem' : '1rem',
    shadows: resolved.look === 'minimal' ? 'none' : '0 18px 50px rgba(0,0,0,.08)',
    animation:
      animationResource && animationResource.id !== 'css-animation'
        ? animationResource.name
        : resolved.look === 'brutalist'
          ? 'none'
          : explore?.chosen?.animation || 'fade',
    heroComposition: explore?.chosen?.heroComposition || null,
    navigation: explore?.chosen?.navigationStrategy || null,
    cardLanguage: explore?.chosen?.cardStrategy || null,
    imageTreatment: explore?.chosen?.imageTreatment || null,
    resources: (resources?.used || []).map((row) => ({
      name: row.name,
      category: row.category,
      version: row.version,
      purpose: row.purpose,
      source: row.source,
    })),
    practices: (research?.practices || []).slice(0, 8).map((row) => ({
      id: row.id,
      title: row.title,
      advice: row.advice,
    })),
  }
  spec.designDna = buildDesignDna({
    explore,
    spec,
    mode: mode || explore?.mode || 'REDESIGN',
    novelty: novelty ?? explore?.novelty ?? 3,
    category: business?.category,
  })
  return spec
}

export function tokensSource(spec) {
  return `export const tokens = ${JSON.stringify(
    {
      look: spec.look,
      style: spec.style,
      layout: spec.layout,
      colors: spec.colors,
      typography: { heading: spec.fontHeading, body: spec.fontBody },
      radius: spec.radius,
      shadows: spec.shadows,
      animation: spec.animation,
      heroComposition: spec.heroComposition,
      navigation: spec.navigation,
      cardLanguage: spec.cardLanguage,
      imageTreatment: spec.imageTreatment,
      designDna: spec.designDna || null,
      practices: spec.practices || [],
      breakpoints: { sm: 360, md: 768, lg: 1024, xl: 1280 },
    },
    null,
    2,
  )}\n`
}

export async function writeDesignSystem(workspaceDir, spec, { preserveCss = false, preserveTokens = false } = {}) {
  const dir = path.join(workspaceDir, 'src/design-system')
  await fs.mkdir(dir, { recursive: true })
  const files = {
    'tokens.js': tokensSource(spec),
    'theme.js': `import { tokens } from './tokens.js'\nexport const theme = tokens\nexport default theme\n`,
    'components.js': `export const primitives = ['Button', 'Card', 'Nav', 'Hero', 'About', 'Offers', 'Products', 'Services', 'Feed', 'Gallery', 'Testimonials', 'Reviews', 'Contact', 'Location', 'BusinessInfo', 'Footer']\n`,
  }
  const written = []
  if (!preserveTokens) {
    for (const [name, contents] of Object.entries(files)) {
      await fs.writeFile(path.join(dir, name), contents, 'utf8')
      written.push(`src/design-system/${name}`)
    }
    if (!preserveCss) {
      const cssFile = await applyTokensToCss(workspaceDir, spec)
      if (cssFile) written.push(cssFile)
    }
    const businessFile = await applyTokensToBusiness(workspaceDir, spec)
    if (businessFile) written.push(businessFile)
  } else {
    // Ensure design-system stubs exist without rewriting tokens/theme/CSS/business colors.
    for (const [name, contents] of Object.entries(files)) {
      const full = path.join(dir, name)
      try {
        await fs.access(full)
      } catch {
        await fs.writeFile(full, contents, 'utf8')
        written.push(`src/design-system/${name}`)
      }
    }
  }
  return { ok: true, written, spec }
}

function rootCssFromSpec(spec) {
  const c = spec?.colors || {}
  const font = spec?.fontBody || spec?.typography?.body || spec?.typography?.bodyFont || "Georgia, 'Times New Roman', serif"
  const headingFont = spec?.fontHeading || spec?.typography?.heading || spec?.typography?.headingFont || font
  return `:root {
  --background: ${c.background || '#ffffff'};
  --surface: ${c.surface || c.background || '#ffffff'};
  --heading: ${c.heading || '#111111'};
  --text: ${c.text || '#1f1f1f'};
  --muted: ${c.muted || '#5c5c5c'};
  --accent: ${c.accent || '#111111'};
  --accentText: ${c.accentText || '#ffffff'};
  --border: ${c.border || '#e5e5e5'};
  --heroBg: ${c.heroBg || '#111111'};
  --heroFg: ${c.heroFg || '#ffffff'};
  --buttonBg: ${c.buttonBg || '#111111'};
  --buttonFg: ${c.buttonFg || '#ffffff'};
  --cardBg: ${c.cardBg || '#ffffff'};
  --font: ${font};
  --heading-font: ${headingFont};
}`
}

async function applyTokensToCss(workspaceDir, spec) {
  const cssPath = path.join(workspaceDir, 'src/index.css')
  try {
    const css = await fs.readFile(cssPath, 'utf8')
    const block = rootCssFromSpec(spec)
    let next = /:root\s*\{/.test(css) ? css.replace(/:root\s*\{[\s\S]*?\}/, block) : `${block}\n${css}`
    if (next === css) return null
    await fs.writeFile(cssPath, next, 'utf8')
    return 'src/index.css'
  } catch {
    return null
  }
}

async function applyTokensToBusiness(workspaceDir, spec) {
  const jsonPath = path.join(workspaceDir, 'src/data/business.json')
  try {
    const current = JSON.parse(await fs.readFile(jsonPath, 'utf8'))
    const next = {
      ...current,
      look: spec.look || current.look,
      colors: spec.colors && Object.keys(spec.colors).length ? spec.colors : current.colors,
    }
    if (JSON.stringify(current.look) === JSON.stringify(next.look) && JSON.stringify(current.colors) === JSON.stringify(next.colors)) {
      return null
    }
    await fs.writeFile(jsonPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    return 'src/data/business.json'
  } catch {
    return null
  }
}
