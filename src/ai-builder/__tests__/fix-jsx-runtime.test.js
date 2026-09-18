import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { ensureJsxRuntimeImports, repairWorkspaceJsx } from '../workspace/fixJsxRuntime.js'
import { applyWorkspaceFiles } from '../workspace/projectFiles.js'

test('injects React import when generated code uses React.useState', () => {
  const src = `import business from './data/business.json'

function Contact() {
  const [formData, setFormData] = React.useState({ name: '' })
  return <form>{formData.name}</form>
}
`
  const next = ensureJsxRuntimeImports(src)
  assert.match(next, /import React from 'react'/)
  assert.match(next, /React\.useState/)
})

test('adds named hook imports for bare useState', () => {
  const src = `function Contact() {
  const [open, setOpen] = useState(false)
  useEffect(() => {}, [])
  return <div>{open ? 'yes' : 'no'}</div>
}
`
  const next = ensureJsxRuntimeImports(src)
  assert.match(next, /import \{ useEffect, useState \} from 'react'/)
})

test('upgrades named react import when React namespace is used', () => {
  const src = `import { useEffect } from 'react'
function Nav() {
  const [open, setOpen] = React.useState(false)
  useEffect(() => {}, [open])
  return <button onClick={() => setOpen(!open)} />
}
`
  const next = ensureJsxRuntimeImports(src)
  assert.match(next, /import React, \{ useEffect \} from 'react'/)
  assert.equal(next.match(/from 'react'/g)?.length, 1)
})

test('leaves valid files unchanged', () => {
  const src = `import React from 'react'
export default function App() {
  const [n, setN] = React.useState(0)
  return <button onClick={() => setN(n + 1)}>{n}</button>
}
`
  assert.equal(ensureJsxRuntimeImports(src), src)
})

test('applyWorkspaceFiles auto-fixes React.useState without import', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-jsx-'))
  await fs.mkdir(path.join(dir, 'src'), { recursive: true })
  const result = await applyWorkspaceFiles({
    workspaceDir: dir,
    files: [{
      path: 'src/App.jsx',
      contents: 'function Contact(){ const [x,setX]=React.useState(0); return <p>{x}</p> }\n',
    }],
  })
  assert.deepEqual(result.written, ['src/App.jsx'])
  const app = await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8')
  assert.match(app, /import React from 'react'/)
})

test('repairWorkspaceJsx patches existing App.jsx on disk', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-repair-'))
  await fs.mkdir(path.join(dir, 'src'), { recursive: true })
  await fs.writeFile(
    path.join(dir, 'src/App.jsx'),
    'function Contact(){ const [x,setX]=React.useState(0); return <p>{x}</p> }\n',
  )
  const repaired = await repairWorkspaceJsx(dir)
  assert.deepEqual(repaired.repaired, ['src/App.jsx'])
  const app = await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8')
  assert.match(app, /import React from 'react'/)
})

test('applyWorkspaceFiles rejects truncated LLM dumps', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-trunc-write-'))
  const result = await applyWorkspaceFiles({
    workspaceDir: dir,
    files: [{ path: 'src/App.jsx', contents: 'export default function App(){\n  return <div/>\n}\n…truncated\n' }],
  })
  assert.equal(result.written.length, 0)
  assert.equal(result.rejected[0].reason, 'TRUNCATED_SOURCE')
})

test('repairWorkspaceJsx restores truncated App.jsx from checkpoint', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-trunc-repair-'))
  await fs.mkdir(path.join(dir, 'src'), { recursive: true })
  await fs.mkdir(path.join(dir, '.getvia/checkpoints/c1/src'), { recursive: true })
  const good = 'export default function App(){ return <div>ok</div> }\n'
  await fs.writeFile(path.join(dir, '.getvia/checkpoints/c1/src/App.jsx'), good)
  await fs.writeFile(
    path.join(dir, '.getvia/checkpoints.json'),
    JSON.stringify([{ id: 'c1', copied: ['src/App.jsx'] }]),
  )
  await fs.writeFile(path.join(dir, 'src/App.jsx'), 'if (id === "hours")\n…truncated\n')
  const repaired = await repairWorkspaceJsx(dir)
  assert.ok(repaired.repaired.includes('src/App.jsx'))
  assert.equal(await fs.readFile(path.join(dir, 'src/App.jsx'), 'utf8'), good)
})
