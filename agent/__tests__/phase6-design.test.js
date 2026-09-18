import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createAgentRuntime } from '../runtime.js'
import { createLLMRouter, FakeProvider } from '../llm/index.js'
import { createOrchestrator } from '../orchestrator/index.js'
import { classifyIntent } from '../core/intent.js'
import { classifyDesignMode, noveltyFor, DESIGN_MODES } from '../core/designMode.js'
import {
  exploreDirections,
  applyDesignToWorkspace,
  specFromDirection,
  compositionKey,
  DIRECTION_IDS,
} from '../visual/design-explorer/index.js'
import { screenshotSimilarity, isSameComposition } from '../visual/similarity.js'
import { cssForSpec } from '../visual/design-explorer/render.js'

const TMP = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp')

function orch() {
  return createOrchestrator({
    runtime: createAgentRuntime({
      llm: createLLMRouter({ providers: [new FakeProvider()] }),
    }),
  })
}

async function withIsolatedNpm(fn) {
  const previous = process.env.AI_ISOLATED_RUNTIME
  const skip = process.env.AI_SKIP_WORKSPACE_NPM
  process.env.AI_ISOLATED_RUNTIME = '1'
  delete process.env.AI_SKIP_WORKSPACE_NPM
  try {
    return await fn()
  } finally {
    if (previous == null) delete process.env.AI_ISOLATED_RUNTIME
    else process.env.AI_ISOLATED_RUNTIME = previous
    if (skip == null) delete process.env.AI_SKIP_WORKSPACE_NPM
    else process.env.AI_SKIP_WORKSPACE_NPM = skip
  }
}

async function siteWorkspace() {
  await fs.mkdir(TMP, { recursive: true })
  const dir = await fs.mkdtemp(path.join(TMP, 'design-'))
  await fs.mkdir(path.join(dir, 'src/data'), { recursive: true })
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'salon-site',
      private: true,
      type: 'module',
      scripts: { build: 'node -e "console.log(\'built\')"' },
    }),
  )
  await fs.writeFile(
    path.join(dir, 'src/data/business.json'),
    JSON.stringify({
      name: 'LaFemina',
      hero: { title: 'Color that lasts', subtitle: 'Salon', primaryCta: { label: 'Book', href: '#contact' } },
      about: { title: 'About', body: 'A studio in Goa.' },
      services: [{ name: 'Color', description: 'Lived-in color' }],
      sections: ['hero', 'about', 'services', 'contact', 'footer'],
    }, null, 2),
  )
  await fs.writeFile(
    path.join(dir, 'src/App.jsx'),
    `import business from './data/business.json'
function Nav(){return <header className="nav"><a href="#top">{business.name}</a></header>}
function Hero(){const hero=business.hero||{};return <section id="hero" className="hero"><h1>{hero.title}</h1><a className="btn primary" href={hero.primaryCta.href}>{hero.primaryCta.label}</a></section>}
export default function App(){return <div id="top"><Nav /><Hero /></div>}
`,
  )
  await fs.writeFile(path.join(dir, 'src/index.css'), '.nav{display:flex}.hero{min-height:70vh}.btn.primary{background:#111}\n')
  return dir
}

function ids(dir) {
  return { userId: 'user1', projectId: 'site-design', workspaceDir: dir }
}

test('design mode defaults and novelty', () => {
  assert.deepEqual(DESIGN_MODES, ['PRESERVE', 'EVOLVE', 'REDESIGN', 'REIMAGINE'])
  assert.equal(classifyDesignMode("Change the homepage H1 to 'X'.", 'EDIT'), 'PRESERVE')
  assert.equal(classifyDesignMode('Redesign the homepage', 'REDESIGN'), 'REDESIGN')
  assert.equal(classifyDesignMode('Reimagine the website', 'REIMAGINE'), 'REIMAGINE')
  assert.equal(classifyDesignMode('evolve the look slightly', 'EDIT'), 'EVOLVE')
  assert.equal(noveltyFor('PRESERVE'), 1)
  assert.equal(noveltyFor('EVOLVE'), 2)
  assert.equal(noveltyFor('REDESIGN'), 3)
  assert.equal(noveltyFor('REDESIGN', 'major overhaul'), 4)
  assert.equal(noveltyFor('REIMAGINE', 'Reimagine the site', 'REIMAGINE'), 5)
  assert.equal(classifyIntent('Reimagine the website').intent, 'REIMAGINE')
})

test('DesignExplorer proposes several directions and avoids the current composition', () => {
  const result = exploreDirections({
    currentDNA: { direction: 'editorial' },
    mode: 'REIMAGINE',
    novelty: 5,
    seed: 'site-design',
    count: 4,
  })
  assert.ok(result.candidates.length >= 3)
  assert.ok(DIRECTION_IDS.includes(result.chosen.direction))
  assert.notEqual(result.chosen.direction, 'editorial')
  assert.ok(result.chosen.navigationStrategy)
  assert.ok(result.chosen.heroComposition)
  assert.ok(result.chosen.sectionOrder.length > 3)
  assert.ok(result.chosen.gridStrategy)
  assert.ok(result.chosen.typographyHierarchy.heading)
  assert.ok(result.chosen.colorStrategy.accent)
  assert.ok(result.chosen.ctaPlacement)
  assert.ok(result.chosen.cardStrategy)
  assert.ok(result.chosen.footerStrategy)
  assert.ok(result.chosen.mobileStrategy)
  assert.equal(result.reusedComposition, false)
})

test('the same business data yields different visual systems', () => {
  const a = specFromDirection('editorial')
  const b = specFromDirection('immersive')
  assert.notEqual(compositionKey(a), compositionKey(b))
  assert.notEqual(a.heroComposition, b.heroComposition)
  assert.notEqual(a.navigationStrategy, b.navigationStrategy)
  assert.notEqual(a.sectionOrder.join(','), b.sectionOrder.join(','))
  assert.notEqual(a.gridStrategy, b.gridStrategy)
  assert.notEqual(a.typographyHierarchy.heading, b.typographyHierarchy.heading)
  assert.notEqual(a.ctaPlacement, b.ctaPlacement)
  assert.notEqual(a.cardStrategy, b.cardStrategy)
  assert.notEqual(a.footerStrategy, b.footerStrategy)
  const cssA = cssForSpec(a)
  const cssB = cssForSpec(b)
  assert.notEqual(cssA, cssB)
  assert.match(cssA, /typographic-column/)
  assert.match(cssB, /viewport-stage/)
})

test('visual similarity treats identical shots as the same composition', () => {
  const buf = Buffer.from('PNG-FAKE-ABCDEF')
  assert.equal(screenshotSimilarity(buf, buf), 1)
  assert.ok(screenshotSimilarity(buf, Buffer.from('PNG-FAKE-ZZZZZZZZ')) < 0.92)
  assert.equal(isSameComposition({ direction: 'editorial' }, specFromDirection('immersive')).similar, false)
  assert.equal(isSameComposition({ direction: 'editorial' }, specFromDirection('editorial')).similar, true)
})

test('applyDesign leaves business copy intact', async () => {
  const dir = await siteWorkspace()
  const runtime = createAgentRuntime({ llm: createLLMRouter({ providers: [new FakeProvider()] }) })
  const ctx = ids(dir)
  const spec = specFromDirection('magazine')
  const applied = await applyDesignToWorkspace({ runtime, ctx, spec, novelty: 5 })
  assert.ok(applied.changed.includes('src/data/design.json'))
  assert.ok(applied.changed.includes('src/App.jsx'))
  assert.ok(applied.changed.includes('src/index.css'))
  assert.ok(!applied.changed.includes('src/data/business.json'))
  const business = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
  assert.equal(business.hero.title, 'Color that lasts')
  assert.equal(business.name, 'LaFemina')
  const design = JSON.parse(await fs.readFile(path.join(dir, 'src/data/design.json'), 'utf8'))
  assert.equal(design.direction, 'magazine')
  const app = await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8')
  assert.match(app, /import design from '.\/data\/design.json'/)
  assert.match(app, /hero\.title/)
  assert.match(app, /design\.sectionOrder/)
  assert.match(app, /design\.navigationStrategy/)
  assert.match(app, /design\.heroComposition/)
  assert.match(app, /design\.gridStrategy/)
  assert.match(app, /design\.cardStrategy/)
  assert.match(app, /design\.footerStrategy/)
  assert.match(app, /design\.ctaPlacement/)
})

test('Reimagine the website changes design without dropping business data', async () => {
  const dir = await siteWorkspace()
  const result = await withIsolatedNpm(() => orch().runTask('Reimagine the website.', ids(dir)))
  assert.equal(result.success, true, result.message)
  assert.equal(result.intent, 'REIMAGINE')
  assert.equal(result.design.mode, 'REIMAGINE')
  assert.equal(result.design.novelty, 5)
  assert.ok(result.design.spec.direction)
  assert.ok(result.filesChanged.includes('src/data/design.json'))
  assert.ok(!result.filesChanged.includes('src/data/business.json'))
  const business = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
  assert.equal(business.hero.title, 'Color that lasts')
  const design = JSON.parse(await fs.readFile(path.join(dir, 'src/data/design.json'), 'utf8'))
  assert.equal(design.direction, result.design.spec.direction)
  const app = await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8')
  assert.match(app, /data-design/)
  assert.match(app, /design\.sectionOrder/)
  const css = await fs.readFile(path.join(dir, 'src/index.css'), 'utf8')
  assert.match(css, new RegExp(`look-${design.direction}`))
  const brain = JSON.parse(await fs.readFile(path.join(dir, '.getvia/brain.json'), 'utf8'))
  assert.equal(brain.designDNA.direction, design.direction)
  assert.equal(brain.designDNA.novelty, 5)
})
