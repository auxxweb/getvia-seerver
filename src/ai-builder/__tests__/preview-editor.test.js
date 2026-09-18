import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { writeViteScaffold, businessJsonFrom } from '../workspace/viteScaffold.js'
import { PREVIEW_EDITOR_MSG } from '../workspace/previewEditorScript.js'
import { normalizeSelectedElement } from '../lib/selectedElement.js'

test('scaffold injects preview editor for isolated edit mode', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-preview-edit-'))
  const business = businessJsonFrom({
    profile: {
      identity: { name: 'EditCo', category: 'Salon', description: 'Test' },
      contact: { phone: '1' },
      content: { coreServices: [{ title: 'Cut' }] },
    },
    prompt: 'Make my salon look premium',
  })
  await writeViteScaffold({ workspaceDir: dir, business, overwrite: true })
  const main = await fs.readFile(path.join(dir, 'src/main.jsx'), 'utf8')
  assert.match(main, /getvia\/previewEditor/)
  const editor = await fs.readFile(path.join(dir, 'src/getvia/previewEditor.js'), 'utf8')
  assert.match(editor, /getvia-preview-set-edit/)
  assert.match(editor, /getvia-preview-select/)
  assert.match(editor, /getvia-resize-handle/)
  assert.match(editor, /contenteditable/)
  assert.match(editor, /data-act="color"/)
  assert.equal(PREVIEW_EDITOR_MSG.TEXT, 'getvia-preview-text')
  const hero = await fs.readFile(path.join(dir, 'src/components/Hero.jsx'), 'utf8')
  assert.match(hero, /data-getvia-section="hero"/)
})

test('selectedElement accepts preview section targets', () => {
  assert.deepEqual(normalizeSelectedElement({ sectionId: 'hero' }), { sectionId: 'hero' })
  assert.deepEqual(normalizeSelectedElement({ sectionId: 'nav' }), { sectionId: 'nav' })
  assert.deepEqual(normalizeSelectedElement({ sectionId: 'feed' }), { sectionId: 'feed' })
  assert.deepEqual(normalizeSelectedElement({ site: true }), { site: true })
})
