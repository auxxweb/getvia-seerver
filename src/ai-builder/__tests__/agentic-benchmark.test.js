import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { writeViteScaffold, businessJsonFrom } from '../workspace/viteScaffold.js'
import { inspectProject, inspectMobileNav } from '../v2/contextEngine.js'
import { applyTypedWorkspaceEdit } from '../v2/typedEdits.js'
import { executeCoding } from '../v2/codingExecutor.js'
import { persistMerge, applyHeuristicBusinessEdits } from '../agents/codingAgent.js'
import { analyzeIntent } from '../v2/intentAnalyzer.js'
import { executeTool } from '../v2/toolExecutor.js'
import { listLLMProviders, routeTask } from '../providers/llmProvider.js'

function profile() {
  return {
    identity: { name: 'Gossip Girls', category: 'Fashion', description: 'Editorial fashion studio' },
    location: { city: 'Mumbai', address: 'Bandra' },
    contact: { phone: '9999999999', email: 'hello@gossip.test' },
    content: {
      coreServices: [{ name: 'Styling', description: 'Personal styling', price: '₹4,500' }],
      catalogue: [{ name: 'Lookbook', description: 'Season edit', price: '₹2,200' }],
    },
  }
}

async function scaffold() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-agentic-'))
  const business = businessJsonFrom({
    profile: profile(),
    prompt: 'Create a fashion website for Gossip Girls',
  })
  await writeViteScaffold({ workspaceDir: dir, business, overwrite: true })
  return dir
}

async function snapshot(dir) {
  const names = ['src/App.jsx', 'src/index.css', 'src/data/business.json', 'index.html', 'src/main.jsx']
  const out = {}
  for (const rel of names) {
    out[rel] = await fs.readFile(path.join(dir, rel), 'utf8')
  }
  return out
}

test('LLM provider list and task routing stay configuration-based', () => {
  const rows = listLLMProviders()
  assert.ok(rows.some((row) => row.name === 'openai'))
  assert.ok(rows.some((row) => row.name === 'anthropic'))
  assert.ok(rows.some((row) => row.name === 'grok'))
  assert.equal(routeTask('classification').tier, 'simple')
  assert.equal(routeTask('review').tier, 'simple')
  assert.equal(routeTask('debugging').tier, 'medium')
  assert.equal(routeTask('coding').tier, 'complex')
})

test('persistMerge keeps an explicit H1 change', () => {
  const existing = { hero: { title: 'Old Title' } }
  const incoming = { hero: { title: 'Fashion That Speaks Her Style.' } }
  const merged = persistMerge(
    existing,
    incoming,
    'Change only the homepage H1 to "Fashion That Speaks Her Style."',
  )
  assert.equal(merged.hero.title, 'Fashion That Speaks Her Style.')
})

test('persistMerge uses incoming title and colors on a create prompt', () => {
  const merged = persistMerge(
    { hero: { title: 'Old Title' }, look: 'original', colors: { heroBg: '#111111' } },
    { hero: { title: 'New Studio' }, look: 'modern', colors: { heroBg: '#0F172A' } },
    'Create a modern one-page website for my salon',
  )
  assert.equal(merged.hero.title, 'New Studio')
  assert.equal(merged.look, 'modern')
  assert.equal(merged.colors.heroBg, '#0F172A')
})

test('persistMerge keeps existing colors on a local button add', () => {
  const merged = persistMerge(
    { hero: { title: 'Keep me', extraButtons: [] }, look: 'glassmorphism', colors: { heroBg: '#DBEAFE' } },
    { hero: { title: 'Other', extraButtons: [{ label: 'Book Appointment', href: '#contact' }] }, look: 'original', colors: { heroBg: '#FFFFFF' } },
    'Add a Book Appointment button',
  )
  assert.equal(merged.hero.title, 'Keep me')
  assert.equal(merged.look, 'glassmorphism')
  assert.equal(merged.colors.heroBg, '#DBEAFE')
})

test('agentic benchmarks: READ, EDIT, FEATURE, DESIGN, DEBUG, BROWSER', async () => {
  const dir = await scaffold()
  const owner = { userId: 'owner-agentic', projectId: 'site-agentic', workspaceDir: dir }

  const listed = await executeTool({ tool: 'list_files', ...owner })
  assert.equal(listed.success, true)
  assert.ok(listed.files.includes('src/App.jsx'))

  const readPrompt =
    'Find the homepage component and tell me which file contains the main H1. Do not modify anything.'
  assert.equal(analyzeIntent(readPrompt, { hasSite: true }).type, 'INSPECT')
  const beforeRead = await snapshot(dir)
  const inspect = await inspectProject(dir, readPrompt)
  const afterRead = await snapshot(dir)
  assert.equal(inspect.homepage, 'src/App.jsx')
  assert.equal(inspect.h1.file, 'src/data/business.json')
  assert.equal(inspect.h1.via, 'hero.title')
  assert.ok(inspect.h1.text)
  assert.deepEqual(afterRead, beforeRead)

  const editPrompt = 'Change only the homepage H1 to "Fashion That Speaks Her Style."'
  const beforeEdit = await snapshot(dir)
  const edited = await executeCoding({
    workspaceDir: dir,
    prompt: editPrompt,
    profile: profile(),
  })
  assert.equal(edited.ok, true)
  const afterEdit = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
  assert.equal(afterEdit.hero.title, 'Fashion That Speaks Her Style.')
  const appAfterEdit = await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8')
  assert.equal(appAfterEdit, beforeEdit['src/App.jsx'])
  assert.equal(await fs.readFile(path.join(dir, 'src/index.css'), 'utf8'), beforeEdit['src/index.css'])

  const featurePrompt = 'Add a pricing section to the homepage. Reuse existing components and styles.'
  assert.equal(analyzeIntent(featurePrompt, { hasSite: true }).type, 'FEATURE')
  const featured = await executeCoding({
    workspaceDir: dir,
    prompt: featurePrompt,
    profile: profile(),
  })
  assert.equal(featured.ok, true)
  const afterFeature = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
  assert.ok(afterFeature.sections.includes('pricing'))
  assert.ok(Array.isArray(afterFeature.pricing) && afterFeature.pricing.length)
  assert.equal(afterFeature.hero.title, 'Fashion That Speaks Her Style.')

  const designPrompt =
    'Transform the existing homepage into a premium fashion-editorial design with subtle glassmorphism.'
  assert.equal(analyzeIntent(designPrompt, { hasSite: true }).type, 'DESIGN')
  const designed = await executeCoding({
    workspaceDir: dir,
    prompt: designPrompt,
    profile: profile(),
  })
  assert.equal(designed.ok, true)
  const afterDesign = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
  assert.equal(afterDesign.look, 'glassmorphism')
  assert.ok(afterDesign.sections.includes('pricing'))

  const appPath = path.join(dir, 'src/App.jsx')
  const app = await fs.readFile(appPath, 'utf8')
  await fs.writeFile(appPath, `import './missing.js'\n${app}`, 'utf8')
  const debugPrompt = 'Find and fix the build error. Failed to resolve import "./missing.js". Do not modify unrelated files.'
  assert.equal(analyzeIntent(debugPrompt, { hasSite: true }).type, 'DEBUG')
  const debugged = await executeCoding({
    workspaceDir: dir,
    prompt: debugPrompt,
    profile: profile(),
  })
  assert.equal(debugged.ok, true)
  const appFixed = await fs.readFile(appPath, 'utf8')
  assert.equal(/missing\.js/.test(appFixed), false)
  assert.match(appFixed, /export default function App/)

  const cssPath = path.join(dir, 'src/index.css')
  const css = await fs.readFile(cssPath, 'utf8')
  await fs.writeFile(cssPath, css.replace('.nav-toggle { display: block; }', '.nav-toggle { display: none; }'), 'utf8')
  const browserPrompt = 'Test the homepage in a mobile viewport. Find any navigation or layout problems. Fix them and verify again.'
  const mobileBefore = await inspectMobileNav(dir)
  assert.equal(mobileBefore.ok, false)
  const repaired = await applyTypedWorkspaceEdit({ workspaceDir: dir, prompt: browserPrompt })
  assert.equal(repaired.ok, true)
  const mobileAfter = await inspectMobileNav(dir)
  assert.equal(mobileAfter.ok, true, JSON.stringify(mobileAfter.issues))

  const heuristic = applyHeuristicBusinessEdits(afterDesign, editPrompt)
  assert.equal(heuristic.hero.title, 'Fashion That Speaks Her Style.')
})

test('TEST 2 production build after H1 edit', async (t) => {
  if (process.env.AGENTIC_LIVE_BUILD !== '1') {
    t.skip('Live npm build is run separately with AGENTIC_LIVE_BUILD=1')
    return
  }
  process.env.AI_ISOLATED_RUNTIME = '1'
  delete process.env.AI_SKIP_WORKSPACE_NPM
  const dir = await scaffold()
  const { installAndBuild } = await import('../jobs/isolatedWebsiteJob.js')
  const edited = await executeCoding({
    workspaceDir: dir,
    prompt: 'Change only the homepage H1 to "Fashion That Speaks Her Style."',
    profile: profile(),
  })
  assert.equal(edited.ok, true)
  const build = await installAndBuild(dir)
  assert.equal(build.ok, true, build.message)
  const data = JSON.parse(await fs.readFile(path.join(dir, 'src/data/business.json'), 'utf8'))
  assert.equal(data.hero.title, 'Fashion That Speaks Her Style.')
})
