import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import {
  applyReferenceSection,
  heuristicReferenceSpec,
  isReferenceDesignPrompt,
  sanitizeReferenceImageUrl,
  sectionFromPrompt,
} from '../visual/referenceDesign.js'

test('only https Cloudinary URLs are accepted as reference images', () => {
  assert.equal(sanitizeReferenceImageUrl('https://res.cloudinary.com/demo/image/upload/x.jpg'), 'https://res.cloudinary.com/demo/image/upload/x.jpg')
  assert.equal(sanitizeReferenceImageUrl('http://res.cloudinary.com/demo/x.jpg'), '')
  assert.equal(sanitizeReferenceImageUrl('https://evil.example/ssrf'), '')
})

test('footer is detected from the prompt even when the target is the whole site', () => {
  assert.equal(sectionFromPrompt('I want a design like this image for the footer section', { site: true }), 'footer')
  assert.equal(sectionFromPrompt('match the hero', { sectionId: 'about' }), 'hero')
  assert.equal(sectionFromPrompt('make it look like this', { sectionId: 'about' }), 'about')
  assert.equal(isReferenceDesignPrompt('make the footer look like this image'), true)
})

test('applying a reference spec restyles the footer without copying outside brand copy', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-ref-'))
  await fs.mkdir(path.join(dir, 'src'), { recursive: true })
  await fs.writeFile(
    path.join(dir, 'src/App.jsx'),
    `export default function App() {
  return (
    <div>
      <footer id="footer" className="footer">© {business.name}</footer>
    </div>
  )
}
`,
  )
  await fs.writeFile(path.join(dir, 'src/index.css'), '.footer { background: #000; }\n')
  const spec = heuristicReferenceSpec({ prompt: 'luxury gold centered footer', section: 'footer' })
  const applied = await applyReferenceSection({ workspaceDir: dir, spec })
  assert.equal(applied.ok, true)
  const app = await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8')
  const css = await fs.readFile(path.join(dir, 'src/index.css'), 'utf8')
  assert.match(app, /footer-ref/)
  assert.match(app, /business\.name/)
  assert.doesNotMatch(app, /Lorem ipsum/)
  assert.match(css, /getvia-ref-footer/)
  assert.match(css, /#c9a227/)
})
