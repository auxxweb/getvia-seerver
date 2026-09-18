import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { writeViteScaffold, businessJsonFrom } from '../workspace/viteScaffold.js'
import { listWorkspaceFiles, applyWorkspaceFiles, isAllowedGeneratedPath } from '../workspace/projectFiles.js'
import { codingAgent, applyHeuristicBusinessEdits } from '../agents/codingAgent.js'
import { runIsolatedWebsiteJob } from '../jobs/isolatedWebsiteJob.js'
import { startIsolatedPreview } from '../preview/isolatedPreview.js'
import { allocatePreviewPort, previewPortFromUrl } from '../preview/previewManager.js'

function profile() {
  return {
    identity: { name: 'LaFemina', category: 'Salon', description: 'Hair and beauty in Pune' },
    location: { city: 'Pune', address: 'Koregaon Park' },
    contact: { phone: '9999999999', email: 'hi@lafemina.test' },
    content: {
      coreServices: [{ name: 'Haircut', description: 'Signature cut' }],
      catalogue: [{ name: 'Serum', description: 'Glow', price: '₹890' }],
    },
  }
}

test('generated file paths reject traversal', () => {
  assert.equal(isAllowedGeneratedPath('src/App.jsx'), true)
  assert.equal(isAllowedGeneratedPath('../server/.env'), false)
  assert.equal(isAllowedGeneratedPath('package.json'), true)
  assert.equal(isAllowedGeneratedPath('AGENTS.md'), true)
  assert.equal(isAllowedGeneratedPath('website.config.json'), true)
  assert.equal(isAllowedGeneratedPath('generation/design-brief.md'), true)
  assert.equal(isAllowedGeneratedPath('src/data/getvia.json'), true)
  assert.equal(isAllowedGeneratedPath('/etc/passwd'), false)
})

test('workspace file listing skips node_modules and symlink loops', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-list-'))
  await fs.mkdir(path.join(dir, 'src'), { recursive: true })
  await fs.mkdir(path.join(dir, 'node_modules', 'vite'), { recursive: true })
  await fs.writeFile(path.join(dir, 'src/App.jsx'), 'export default function App(){return null}')
  await fs.writeFile(path.join(dir, 'node_modules/vite/index.js'), 'module.exports = {}')
  try {
    await fs.symlink(dir, path.join(dir, 'src/loop'))
  } catch {
    /* platform may refuse */
  }
  const names = await listWorkspaceFiles(dir)
  assert.ok(names.includes('src/App.jsx'))
  assert.equal(names.some((n) => n.includes('node_modules')), false)
  assert.equal(names.some((n) => n === 'src/loop' || n.startsWith('src/loop/')), false)
})

test('vite scaffold writes a React + Vite app', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-vite-'))
  const business = businessJsonFrom({
    profile: profile(),
    prompt: 'Create a luxury salon site and add a Shop New Arrivals button',
  })
  const result = await writeViteScaffold({ workspaceDir: dir, business })
  assert.equal(result.ok, true)
  const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'))
  assert.equal(pkg.scripts.dev, 'vite')
  const app = await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8')
  assert.match(app, /business.json/)
  const data = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
  assert.equal(data.name, 'LaFemina')
  assert.ok(data.hero.extraButtons.some((b) => /shop new arrivals/i.test(b.label)))
})

test('vite scaffold overwrite rebuilds App.jsx', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-overwrite-'))
  const business = businessJsonFrom({ profile: profile(), prompt: 'Create a modern one-page website' })
  await writeViteScaffold({ workspaceDir: dir, business, overwrite: true })
  await fs.writeFile(path.join(dir, 'src/App.jsx'), 'export default function App(){return <h1>OLD</h1>}\n', 'utf8')
  const skipped = await writeViteScaffold({ workspaceDir: dir, business, overwrite: false })
  assert.ok(skipped.skipped.includes('src/App.jsx'))
  await writeViteScaffold({ workspaceDir: dir, business, overwrite: true })
  const app = await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8')
  assert.match(app, /business.json/)
})

test('incremental scaffold does not clobber existing section components', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-preserve-'))
  const business = businessJsonFrom({ profile: profile(), prompt: 'Create a modern one-page website' })
  await writeViteScaffold({ workspaceDir: dir, business, overwrite: true })
  await fs.writeFile(path.join(dir, 'src/components/About.jsx'), 'export default function About(){return <section id="about">CUSTOM</section>}\n', 'utf8')
  await fs.writeFile(path.join(dir, 'src/components/Hero.jsx'), 'export default function Hero(){return <section id="hero">CUSTOM_HERO</section>}\n', 'utf8')
  const again = await writeViteScaffold({ workspaceDir: dir, business, overwrite: false })
  assert.ok(again.skipped.includes('src/components/About.jsx'))
  assert.ok(again.skipped.includes('src/components/Hero.jsx'))
  assert.ok(!again.written.includes('src/components/About.jsx'))
  assert.ok(!again.written.includes('src/components/Hero.jsx'))
  const about = await fs.readFile(path.join(dir, 'src/components/About.jsx'), 'utf8')
  const hero = await fs.readFile(path.join(dir, 'src/components/Hero.jsx'), 'utf8')
  assert.match(about, /CUSTOM/)
  assert.match(hero, /CUSTOM_HERO/)
})

test('design tokens reach CSS and business.json colors', async () => {
  const { writeDesignSystem, designSpecFrom } = await import('../v2/designSystem.js')
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-tokens-'))
  const business = businessJsonFrom({
    profile: profile(),
    prompt: 'Create a website',
    websiteState: { theme: { look: 'original', colors: { heroBg: '#111111', buttonBg: '#111111' } } },
  })
  await writeViteScaffold({ workspaceDir: dir, business, overwrite: true })
  const spec = designSpecFrom({
    prompt: 'Create a modern one-page website for my salon',
    business,
  })
  assert.notEqual(String(spec.colors.heroBg).toLowerCase(), '#111111')
  const result = await writeDesignSystem(dir, spec)
  assert.ok(result.written.includes('src/index.css'))
  assert.ok(result.written.includes('src/data/business.json'))
  const css = await fs.readFile(path.join(dir, 'src/index.css'), 'utf8')
  assert.match(css, new RegExp(`--heroBg:\\s*${spec.colors.heroBg}`, 'i'))
  const data = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
  assert.equal(data.look, spec.look)
  assert.equal(data.colors.heroBg, spec.colors.heroBg)
})

test('hero-only premium layout patches Hero without rewriting other sections', async () => {
  const { isHeroLayoutPrompt, patchPremiumSplitHero } = await import('../workspace/heroLayout.js')
  assert.equal(
    isHeroLayoutPrompt(
      'Change only the Hero section. Make the hero more premium and visually impressive. Use a two-column layout.',
    ),
    true,
  )
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-hero-'))
  const business = businessJsonFrom({
    profile: profile(),
    prompt: 'Create a luxury salon site and add a Shop New Arrivals button',
  })
  await writeViteScaffold({ workspaceDir: dir, business })
  const original = await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8')
  await fs.writeFile(path.join(dir, 'src/App.jsx'), original.replaceAll('hero-split', 'hero-legacy'), 'utf8')
  const css = await fs.readFile(path.join(dir, 'src/index.css'), 'utf8')
  await fs.writeFile(path.join(dir, 'src/index.css'), css.replaceAll('.hero.hero-split', '.hero.hero-legacy'), 'utf8')
  const patched = await patchPremiumSplitHero(dir)
  assert.equal(patched.ok, true, patched.message)
  const app = await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8')
  const hero = await fs.readFile(path.join(dir, 'src/components/Hero.jsx'), 'utf8')
  assert.match(hero, /hero-split/)
  assert.match(hero, /hero-float-card/)
  assert.match(app, /components\/Hero/)
  assert.match(app, /components\/Cards/)
  assert.match(app, /id === 'about'/)
  const data = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
  assert.ok(data.hero.extraButtons.some((b) => /shop new arrivals/i.test(b.label)))
})

test('heuristic coder adds booking button and reorders services', () => {
  const next = applyHeuristicBusinessEdits(
    { sections: ['hero', 'about', 'services', 'contact'], hero: { extraButtons: [] } },
    'Add a Book Appointment button and move services above about',
  )
  assert.ok(next.hero.extraButtons.some((b) => b.label === 'Book Appointment'))
  assert.deepEqual(
    next.sections.slice(0, 4),
    ['hero', 'services', 'about', 'contact'],
  )
})

test('applyWorkspaceFiles refuses escaping the project', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-files-'))
  const denied = await applyWorkspaceFiles({
    workspaceDir: dir,
    files: [{ path: '../outside.jsx', contents: 'nope' }],
  })
  assert.equal(denied.written.length, 0)
  assert.equal(denied.rejected[0].reason, 'PATH_REJECTED')
})

test('isolated website job scaffolds without npm when skipped', async () => {
  const previous = {
    runtime: process.env.AI_ISOLATED_RUNTIME,
    skipNpm: process.env.AI_SKIP_WORKSPACE_NPM,
    skipLlm: process.env.AI_SKIP_CODING_LLM,
    skipSync: process.env.AI_SKIP_WEBSITE_STATE_SYNC,
    root: process.env.AI_WORKSPACE_ROOT,
    preview: process.env.PREVIEW_ENABLED,
  }
  process.env.AI_ISOLATED_RUNTIME = '1'
  process.env.AI_SKIP_WORKSPACE_NPM = '1'
  process.env.AI_SKIP_CODING_LLM = '1'
  process.env.AI_SKIP_WEBSITE_STATE_SYNC = '1'
  process.env.AI_WORKSPACE_ROOT = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-iso-root-'))
  delete process.env.PREVIEW_ENABLED
  try {
    const result = await runIsolatedWebsiteJob({
      userId: 'owner1',
      projectId: 'site1',
      prompt: 'Create a glassmorphism salon website and add a Shop New Arrivals button',
      profile: profile(),
    })
    assert.equal(result.ok, true, result.message)
    assert.ok(result.written.includes('src/App.jsx'))
    assert.equal(result.coder, 'heuristic')
    const business = JSON.parse(
      await fs.readFile(
        path.join(process.env.AI_WORKSPACE_ROOT, 'user_owner1', 'project_site1', 'src/data/business.json'),
        'utf8',
      ),
    )
    assert.ok(business.hero.extraButtons.some((b) => /shop new arrivals/i.test(b.label)))
    assert.equal(startIsolatedPreview({ projectId: 'site1' }).code, 'PREVIEW_SANDBOX_REQUIRED')
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const envKey = {
        runtime: 'AI_ISOLATED_RUNTIME',
        skipNpm: 'AI_SKIP_WORKSPACE_NPM',
        skipLlm: 'AI_SKIP_CODING_LLM',
        skipSync: 'AI_SKIP_WEBSITE_STATE_SYNC',
        root: 'AI_WORKSPACE_ROOT',
        preview: 'PREVIEW_ENABLED',
      }[key]
      if (value == null) delete process.env[envKey]
      else process.env[envKey] = value
    }
  }
})

test('follow-up prompts persist earlier buttons until asked to remove', async () => {
  const previous = {
    runtime: process.env.AI_ISOLATED_RUNTIME,
    skipNpm: process.env.AI_SKIP_WORKSPACE_NPM,
    skipLlm: process.env.AI_SKIP_CODING_LLM,
    skipSync: process.env.AI_SKIP_WEBSITE_STATE_SYNC,
    root: process.env.AI_WORKSPACE_ROOT,
    preview: process.env.PREVIEW_ENABLED,
  }
  process.env.AI_ISOLATED_RUNTIME = '1'
  process.env.AI_SKIP_WORKSPACE_NPM = '1'
  process.env.AI_SKIP_CODING_LLM = '1'
  process.env.AI_SKIP_WEBSITE_STATE_SYNC = '1'
  process.env.AI_WORKSPACE_ROOT = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-iso-persist-'))
  delete process.env.PREVIEW_ENABLED
  const ids = { userId: 'ownerpersist', projectId: 'sitepersist' }
  try {
    await runIsolatedWebsiteJob({
      ...ids,
      prompt: 'Create a glassmorphism salon website and add a Shop New Arrivals button',
      profile: profile(),
    })
    await runIsolatedWebsiteJob({
      ...ids,
      prompt: 'Add a Book Appointment button',
      profile: profile(),
    })
    const file = path.join(
      process.env.AI_WORKSPACE_ROOT,
      'user_ownerpersist',
      'project_sitepersist',
      'src/data/business.json',
    )
    const afterAdd = JSON.parse(await fs.readFile(file, 'utf8'))
    assert.ok(afterAdd.hero.extraButtons.some((b) => /shop new arrivals/i.test(b.label)))
    assert.ok(afterAdd.hero.extraButtons.some((b) => /book appointment/i.test(b.label)))
    assert.equal(afterAdd.look, 'glassmorphism')
    await runIsolatedWebsiteJob({
      ...ids,
      prompt: 'Remove the Shop New Arrivals button',
      profile: profile(),
    })
    const afterRemove = JSON.parse(await fs.readFile(file, 'utf8'))
    assert.equal(afterRemove.hero.extraButtons.some((b) => /shop new arrivals/i.test(b.label)), false)
    assert.ok(afterRemove.hero.extraButtons.some((b) => /book appointment/i.test(b.label)))
    assert.equal(afterRemove.look, 'glassmorphism')
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const envKey = {
        runtime: 'AI_ISOLATED_RUNTIME',
        skipNpm: 'AI_SKIP_WORKSPACE_NPM',
        skipLlm: 'AI_SKIP_CODING_LLM',
        skipSync: 'AI_SKIP_WEBSITE_STATE_SYNC',
        root: 'AI_WORKSPACE_ROOT',
        preview: 'PREVIEW_ENABLED',
      }[key]
      if (value == null) delete process.env[envKey]
      else process.env[envKey] = value
    }
  }
})

test('preview still rejects client-chosen ports', () => {
  const rejected = startIsolatedPreview({ projectId: 'abc', portFromClient: 5179 })
  assert.equal(rejected.code, 'PREVIEW_PORT_REJECTED')
})

test('preview port allocator stays in 4100-4199', async () => {
  assert.equal(previewPortFromUrl('http://127.0.0.1:4101/'), 4101)
  assert.equal(previewPortFromUrl('http://evil.example/'), null)
  const port = await allocatePreviewPort()
  if (port != null) {
    assert.ok(port >= 4100 && port <= 4199)
  }
})
