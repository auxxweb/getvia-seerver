import { AI_SECTION_TYPES } from '../constants.js'
import { DEFAULT_AI_THEME_COLORS } from '../theme/aiTheme.js'

const HEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/

export function isHexColor(v) {
  return typeof v === 'string' && HEX.test(v.trim())
}

export function emptyWebsiteState() {
  return {
    siteId: '',
    businessId: '',
    engine: 'ai',
    layout: 'one-page',
    templateId: null,
    theme: {
      colors: { ...DEFAULT_AI_THEME_COLORS },
      typography: {
        headingFont: 'Outfit',
        bodyFont: 'Outfit',
        headingWeight: 600,
        bodyWeight: 400,
      },
      spacing: { section: 'roomy' },
      radius: { card: 'lg' },
      shadows: { card: 'soft' },
    },
    pages: [
      {
        id: 'home',
        slug: '/',
        name: 'Home',
        sections: [],
      },
    ],
    sectionOrder: [...AI_SECTION_TYPES],
    sectionVisibility: Object.fromEntries(AI_SECTION_TYPES.map((id) => [id, true])),
    content: {
      description: '',
      landing: {},
      offers: { title: '', description: '', items: [] },
      coreServices: { title: '', description: '', items: [] },
      catalogue: { title: '', description: '', items: [] },
      gallery: [],
      faq: { title: '', items: [] },
      reviews: { title: '', items: [] },
      feed: { title: '', description: '', items: [] },
      cta: { title: '', description: '', buttonLabel: '' },
    },
    functionality: {
      call: false,
      whatsapp: false,
      enquiry: true,
      email: false,
      directions: false,
      social: false,
    },
    seo: {
      title: '',
      description: '',
      canonical: '',
      robots: 'index,follow',
      ogTitle: '',
      ogDescription: '',
      ogImage: '',
      structuredDataType: 'LocalBusiness',
    },
    settings: {
      serviceOrder: [],
      alignment: 'left',
      framework: 'react',
      bundler: 'vite',
      renderer: 'AiGeneratedOnePage',
    },
    assetRefs: [],
  }
}

export function validateWebsiteState(raw) {
  const errors = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: [{ type: 'SCHEMA', message: 'Website state must be an object' }] }
  }
  if (raw.engine && raw.engine !== 'ai') {
    errors.push({ type: 'UNSUPPORTED_ENGINE', message: `Unknown engine ${raw.engine}` })
  }
  if (raw.sectionOrder && Array.isArray(raw.sectionOrder)) {
    for (const id of raw.sectionOrder) {
      if (!AI_SECTION_TYPES.includes(id)) {
        errors.push({ type: 'UNSUPPORTED_SECTION', message: `Unknown section ${id}` })
      }
    }
  }
  const colors = raw.theme?.colors || {}
  for (const [k, v] of Object.entries(colors)) {
    if (v && typeof v === 'string' && v.startsWith('#') && !isHexColor(v)) {
      errors.push({ type: 'INVALID_COLOR', message: `Invalid color for ${k}` })
    }
  }
  return { ok: errors.length === 0, errors }
}

export function cloneState(state) {
  return JSON.parse(JSON.stringify(state || emptyWebsiteState()))
}
