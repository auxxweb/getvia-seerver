import { dnaFromSpec } from './catalog.js'
import { cssForSpec, designAwareAppSource, tokensSource } from './render.js'

export async function applyDesignToWorkspace({ runtime, ctx, spec, novelty = 3 } = {}) {
  if (!spec?.direction) return { role: 'coder', changed: [], observations: [{ ok: false, message: 'No design spec.' }] }
  const files = [
    { path: 'src/data/design.json', contents: `${JSON.stringify(spec, null, 2)}\n` },
    { path: 'src/design-system/tokens.js', contents: tokensSource(spec) },
    { path: 'src/index.css', contents: cssForSpec(spec) },
    { path: 'src/App.jsx', contents: designAwareAppSource() },
  ]
  const changed = []
  const observations = []
  for (const file of files) {
    const write = await runtime.callTool('write_file', file, ctx)
    if (write.success) changed.push(file.path)
    else observations.push({ path: file.path, ok: false, message: write.message })
  }
  return {
    role: 'coder',
    changed,
    observations,
    dna: dnaFromSpec(spec, { novelty }),
    spec,
  }
}
