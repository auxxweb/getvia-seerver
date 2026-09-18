import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import {
  applyBusinessToWebsiteState,
  captureIsolatedSnapshot,
  restoreIsolatedSnapshot,
} from '../workspace/persistIsolatedDraft.js'

test('isolated snapshot captures workspace files and restores them', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-save-'))
  await fs.mkdir(path.join(dir, 'src/data'), { recursive: true })
  await fs.writeFile(
    path.join(dir, 'src/data/business.json'),
    `${JSON.stringify({ name: 'LaFemina', hero: { title: 'Glow' }, look: 'premium', colors: { heroBg: '#0B0B0B' }, sections: ['hero', 'about', 'contact'] }, null, 2)}\n`,
  )
  await fs.mkdir(path.join(dir, 'src'), { recursive: true })
  await fs.writeFile(path.join(dir, 'src/App.jsx'), 'export default function App(){return <h1>Glow</h1>}\n')
  const snap = await captureIsolatedSnapshot(dir)
  assert.equal(snap.business.name, 'LaFemina')
  assert.ok(snap.files['src/App.jsx'].includes('Glow'))

  const dest = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-restore-'))
  const restored = await restoreIsolatedSnapshot(dest, snap)
  assert.equal(restored.ok, true)
  const app = await fs.readFile(path.join(dest, 'src/App.jsx'), 'utf8')
  assert.match(app, /Glow/)
})

test('business.json auto-save maps into website state so drafts persist', () => {
  const next = applyBusinessToWebsiteState(
    { settings: { hasAiDesign: false }, content: { landing: { bannerTitle: 'Old' } } },
    {
      name: 'Gossip',
      look: 'modern',
      colors: { heroBg: '#0F172A' },
      hero: { title: 'New heading', subtitle: 'Edit', primaryCta: { label: 'Book', href: '#contact' } },
      sections: ['hero', 'services', 'contact'],
    },
  )
  assert.equal(next.settings.hasAiDesign, true)
  assert.equal(next.content.landing.bannerTitle, 'New heading')
  assert.equal(next.theme.look, 'modern')
  assert.equal(next.theme.colors.heroBg, '#0F172A')
  assert.deepEqual(next.sectionOrder, ['hero', 'services', 'contact'])
})
