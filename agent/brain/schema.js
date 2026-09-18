export const BRAIN_REL = '.getvia/brain.json'

export const EMPTY_DESIGN_DNA = Object.freeze({
  direction: null,
  layoutStyle: null,
  navigationStyle: null,
  heroStyle: null,
  typography: null,
  colors: null,
  colorSystem: null,
  cards: null,
  cardStyle: null,
  buttons: null,
  buttonStyle: null,
  spacing: null,
  sectionRhythm: null,
  imageTreatment: null,
  interactions: null,
  interactionStyle: null,
  footer: null,
  footerStyle: null,
  animation: null,
  animationStyle: null,
  novelty: null,
})

export function emptyBrain({ userId, projectId } = {}) {
  return {
    projectId: String(projectId || ''),
    userId: String(userId || ''),
    framework: 'React',
    bundler: 'Vite',
    packageManager: 'npm',
    routes: [],
    pages: [],
    components: [],
    importantFiles: [],
    styles: [],
    assets: [],
    dependencies: [],
    integrations: [],
    envRefs: [],
    apiCalls: [],
    knownErrors: [],
    recentChanges: [],
    buildStatus: 'unknown',
    previewStatus: 'unknown',
    designDNA: { ...EMPTY_DESIGN_DNA },
    designResources: [],
    homepage: null,
    entry: null,
    indexedAt: null,
    updatedAt: new Date().toISOString(),
  }
}

const KNOWN_INTEGRATIONS = [
  'react-router',
  'react-router-dom',
  'axios',
  'firebase',
  'tailwindcss',
  'framer-motion',
  'cloudinary',
  '@tanstack/react-query',
]

export function brainFromIndex(index, extra = {}) {
  const important = uniqueExisting([
    index.homepage,
    index.entry,
    'src/App.jsx',
    'src/index.css',
    'src/data/business.json',
    'src/data/design.json',
    'src/design-system/tokens.js',
    'index.html',
    'package.json',
  ], index.files)
  const pageFiles = (index.files || []).filter((p) => /^src\/pages\/.+\.(jsx|tsx)$/.test(p))
  const fromDeps = (index.dependencies || []).filter((d) => KNOWN_INTEGRATIONS.includes(d) || KNOWN_INTEGRATIONS.some((k) => d.startsWith(`${k}/`)))
  const fromApis = (index.apiCalls || []).map((a) => a.url)
  const fromTw = index.tailwind?.length ? ['tailwind'] : []

  return {
    ...emptyBrain(extra),
    framework: index.framework || 'React',
    bundler: index.bundler || 'Vite',
    packageManager: index.packageManager || 'npm',
    routes: (index.routes || []).slice(0, 40),
    pages: uniqueExisting([
      index.homepage ? 'Home' : null,
      ...pageFiles.map((p) => p.replace(/^src\/pages\//, '').replace(/\.(jsx|tsx)$/, '')),
    ]),
    components: (index.components || []).slice(0, 80),
    importantFiles: important,
    styles: uniqueExisting((index.styles || []).map((s) => s.path).filter((p) => p.endsWith('.css'))),
    assets: (index.assets || []).slice(0, 40),
    dependencies: index.dependencies || [],
    integrations: uniqueExisting([...fromDeps, ...fromApis, ...fromTw]).slice(0, 20),
    envRefs: (index.envRefs || []).slice(0, 40),
    apiCalls: (index.apiCalls || []).slice(0, 40),
    homepage: index.homepage || null,
    entry: index.entry || null,
    indexedAt: index.indexedAt,
    updatedAt: new Date().toISOString(),
    ...extra,
  }
}

function uniqueExisting(list, files) {
  const raw = (list || []).filter(Boolean)
  if (!files) return [...new Set(raw)]
  const set = new Set(files)
  return [...new Set(raw.filter((p) => set.has(p)))]
}
