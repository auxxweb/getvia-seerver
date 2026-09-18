import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { indexProject, refreshProjectBrain, readProjectBrain, BRAIN_REL } from '../brain/index.js'
import { buildContext, locate, classifyTask } from '../context/index.js'

async function siteWorkspace() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-brain-'))
  await fs.mkdir(path.join(dir, 'src/data'), { recursive: true })
  await fs.mkdir(path.join(dir, 'src/pages'), { recursive: true })
  await fs.mkdir(path.join(dir, 'src/assets'), { recursive: true })
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'salon-site',
      private: true,
      type: 'module',
      dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0', axios: '^1.0.0' },
      devDependencies: { vite: '^6.0.0' },
    }),
  )
  await fs.writeFile(path.join(dir, 'package-lock.json'), '{}\n')
  await fs.writeFile(path.join(dir, 'vite.config.js'), 'export default { plugins: [] }\n')
  await fs.writeFile(path.join(dir, 'index.html'), '<div id="root"></div>\n')
  await fs.writeFile(path.join(dir, 'src/assets/logo.svg'), '<svg />\n')
  await fs.writeFile(
    path.join(dir, 'src/data/business.json'),
    JSON.stringify({
      name: 'LaFemina',
      sections: ['hero', 'about', 'contact'],
      hero: { title: 'Color that lasts', primaryCta: { label: 'Book Appointment', href: '#contact' } },
    }),
  )
  await fs.writeFile(
    path.join(dir, 'src/main.jsx'),
    `import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
const api = import.meta.env.VITE_API_URL
createRoot(document.getElementById('root')).render(<App />)
`,
  )
  await fs.writeFile(
    path.join(dir, 'src/App.jsx'),
    `import business from './data/business.json'

function Nav() {
  return (
    <header className="nav">
      <a className="brand" href="#top">{business.name}</a>
      <details className="nav-toggle">
        <summary>Menu</summary>
        <nav>
          <a href="#about">About</a>
        </nav>
      </details>
      <nav className="nav-desktop">
        <a href="#about">About</a>
      </nav>
    </header>
  )
}

function Hero() {
  const hero = business.hero || {}
  return (
    <section id="hero" className="hero">
      <h1>{hero.title}</h1>
      <a className="btn primary" href={hero.primaryCta.href}>{hero.primaryCta.label}</a>
    </section>
  )
}

export default function App() {
  return (
    <div id="top" className="site">
      <Nav />
      <Hero />
    </div>
  )
}
`,
  )
  await fs.writeFile(
    path.join(dir, 'src/index.css'),
    `.nav { display: flex; }
.nav-desktop { display: flex; }
.nav-toggle { display: none; }
@media (max-width: 768px) {
  .nav-desktop { display: none; }
  .nav-toggle { display: block; }
}
.btn { padding: .8rem 1.2rem; }
.btn.primary { background: #111; color: #fff; }
.cta { text-align: center; }
.hero { min-height: 70vh; }
`,
  )
  await fs.writeFile(
    path.join(dir, 'src/pages/Unused.jsx'),
    `export default function Unused() {
  return <p>Not the homepage, navbar, or CTA.</p>
}
`,
  )
  await fs.writeFile(
    path.join(dir, 'src/pages/Catalog.jsx'),
    `import axios from 'axios'
export default function Catalog() {
  axios.get('/api/catalog')
  return <div className="flex gap-4 p-4 bg-white">catalog</div>
}
`,
  )
  return dir
}

test('ProjectIndexer records files, components, routes, CSS, APIs, env, and deps', async () => {
  const dir = await siteWorkspace()
  const index = await indexProject(dir)
  assert.equal(index.framework, 'React')
  assert.equal(index.bundler, 'Vite')
  assert.equal(index.packageManager, 'npm')
  assert.equal(index.homepage, 'src/App.jsx')
  assert.ok(index.files.includes('src/App.jsx'))
  assert.ok(!index.files.some((f) => f.startsWith('.getvia/')))
  const names = index.components.map((c) => c.name)
  assert.ok(names.includes('App'))
  assert.ok(names.includes('Nav'))
  assert.ok(names.includes('Hero'))
  assert.ok(index.routes.some((r) => r.path === '#top' || r.path === '#about'))
  assert.ok(index.styles.some((s) => s.path === 'src/index.css' && s.classes.includes('nav-toggle')))
  assert.ok(index.assets.includes('src/assets/logo.svg'))
  assert.ok(index.dependencies.includes('react'))
  assert.ok(index.apiCalls.some((a) => a.url === '/api/catalog'))
  assert.ok(index.envRefs.some((e) => e.name === 'VITE_API_URL'))
  assert.ok(index.tailwind.some((t) => t.path === 'src/pages/Catalog.jsx'))
  assert.ok(index.config.includes('vite.config.js'))
})

test('ProjectBrain persists at .getvia/brain.json and keeps prior errors', async () => {
  const dir = await siteWorkspace()
  const first = await refreshProjectBrain(dir, { userId: 'u1', projectId: 'p1', knownErrors: [{ message: 'React is not defined' }] })
  assert.equal(first.brain.framework, 'React')
  assert.equal(first.brain.bundler, 'Vite')
  assert.equal(first.brain.homepage, 'src/App.jsx')
  assert.ok(first.brain.importantFiles.includes('src/App.jsx'))
  assert.ok(first.brain.styles.includes('src/index.css'))
  assert.ok(first.brain.components.some((c) => c.name === 'Nav'))
  assert.equal(first.brain.designDNA.heroStyle, null)
  const disk = JSON.parse(await fs.readFile(path.join(dir, BRAIN_REL), 'utf8'))
  assert.equal(disk.packageManager, 'npm')
  const second = await refreshProjectBrain(dir, { userId: 'u1', projectId: 'p1' })
  assert.equal(second.brain.knownErrors[0].message, 'React is not defined')
  const loaded = await readProjectBrain(dir)
  assert.equal(loaded.previewStatus, 'unknown')
})

test('locate answers homepage / navbar / mobile menu / primary CTA', async () => {
  const dir = await siteWorkspace()
  const home = await locate(dir, 'Where is the homepage?')
  assert.equal(home.files[0], 'src/App.jsx')
  assert.ok(home.components.some((c) => c.name === 'App'))

  const nav = await locate(dir, 'Where is the navbar?')
  assert.ok(nav.files.includes('src/App.jsx'))
  assert.ok(nav.components.some((c) => c.name === 'Nav'))
  assert.ok(nav.files.includes('src/index.css'))

  const menu = await locate(dir, 'Where is the mobile menu?')
  assert.ok(menu.files.includes('src/App.jsx'))
  assert.ok(menu.files.includes('src/index.css'))
  assert.ok(menu.evidence.some((e) => /nav-toggle/.test(e.snippet)))

  const cta = await locate(dir, 'Where is the primary CTA?')
  assert.ok(cta.files.includes('src/App.jsx'))
  assert.ok(cta.files.includes('src/data/business.json'))
  assert.ok(cta.components.some((c) => c.name === 'Hero'))
})

test('ContextEngine returns only ranked files for a homepage CTA task', async () => {
  const dir = await siteWorkspace()
  const { brain } = await refreshProjectBrain(dir)
  const ctx = await buildContext({ workspaceDir: dir, task: 'Change the homepage CTA.', brain })
  assert.equal(classifyTask(ctx.task).kind, 'cta')
  assert.ok(ctx.files.includes('src/App.jsx'))
  assert.ok(ctx.files.includes('src/data/business.json'))
  assert.ok(ctx.styles.includes('src/index.css'))
  assert.ok(ctx.imports.some((row) => row.import.includes('business.json')))
  assert.ok(ctx.components.some((c) => c.name === 'Hero'))
  assert.ok(ctx.cta.files.includes('src/App.jsx'))
  assert.ok(!ctx.files.includes('src/pages/Unused.jsx'))
  assert.ok(!ctx.files.includes('src/pages/Catalog.jsx'))
  assert.ok(ctx.files.length <= 8)
  assert.ok(ctx.files.length < brain.importantFiles.length + 5)
})
