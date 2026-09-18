import { parseBuildFailure } from '../execution/index.js'
import { repairWorkspaceJsx } from '../../src/ai-builder/workspace/fixJsxRuntime.js'

function unique(list) {
  return [...new Set((list || []).filter(Boolean))]
}

export async function repairBuildFailure({ runtime, ctx, build, files = [] }) {
  const parsed = parseBuildFailure(build)
  const targets = unique([...parsed.files, ...files, 'src/App.jsx', 'src/data/business.json', 'index.html'])
  const patched = []
  for (const rel of targets.slice(0, 8)) {
    const read = await runtime.callTool('read_file', { path: rel }, ctx)
    if (!read.success) continue
    let next = read.data.contents
    let changed = false
    if (parsed.marker && next.includes(parsed.marker)) {
      next = next.split(parsed.marker).join('')
      changed = true
    }
    if (rel.endsWith('.json')) {
      try {
        JSON.parse(next)
      } catch {
        next = next.replace(/,(\s*[}\]])/g, '$1')
        try {
          JSON.parse(next)
          changed = true
        } catch {
          /* leave for next attempt */
        }
      }
    }
    if (!changed) continue
    const write = await runtime.callTool('patch_file', { path: rel, contents: next }, ctx)
    if (write.success) patched.push(rel)
  }
  return { patched, parsed, ok: patched.length > 0 }
}

export async function repairBrowserFailure({ runtime, ctx, qa, files = [] }) {
  const jsx = await repairWorkspaceJsx(ctx.workspaceDir).catch(() => ({ repaired: [] }))
  const patched = []
  const issues = qa?.issues || []
  const html = await runtime.callTool('read_file', { path: 'index.html' }, ctx)
  if (html.success) {
    let next = html.data.contents
    let changed = false
    if (issues.some((i) => i.type === 'console') || /throw new Error/i.test(next)) {
      const stripped = next.replace(/<script\b[^>]*>[\s\S]*?throw new Error[\s\S]*?<\/script>/gi, '')
      if (stripped !== next) {
        next = stripped
        changed = true
      }
    }
    if (issues.some((i) => i.type === 'network')) {
      const stripped = next.replace(/<img\b[^>]*src=["']https?:\/\/127\.0\.0\.1:1[^"']*["'][^>]*>/gi, '')
      if (stripped !== next) {
        next = stripped
        changed = true
      }
    }
    if (changed) {
      const write = await runtime.callTool('patch_file', { path: 'index.html', contents: next }, ctx)
      if (write.success) patched.push('index.html')
    }
  }
  const blob = {
    message: [qa?.message, ...(qa?.console || []), ...(qa?.issues || []).map((i) => i.description)].join('\n'),
    details: { stderr: (qa?.console || []).join('\n') },
  }
  const fromBuild = await repairBuildFailure({ runtime, ctx, build: blob, files })
  const all = unique([...patched, ...(fromBuild.patched || []), ...(jsx.repaired || [])])
  return { ok: all.length > 0, patched: all, parsed: fromBuild.parsed, role: 'debugger' }
}
