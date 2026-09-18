import { assertInsideWorkspace } from '../security/pathPolicy.js'
import { assertAllowedCommand } from '../security/commandPolicy.js'

export const V2_TOOLS = [
  'read_file',
  'search_code',
  'list_files',
  'write_file',
  'patch_file',
  'delete_file',
  'run_build',
  'run_command',
  'run_lint',
  'run_tests',
  'start_preview',
  'stop_preview',
  'browser_open',
  'browser_click',
  'browser_type',
  'browser_screenshot',
  'browser_scroll',
  'browser_console',
  'browser_network',
  'inspect_console',
  'inspect_network',
  'git_diff',
  'create_checkpoint',
  'rollback',
  'search_design_resources',
  'inspect_design_resource',
  'get_component_reference',
  'get_icon_reference',
  'get_font_reference',
  'get_animation_reference',
  'get_cdn_resource',
  'research_design_practices',
  'search_cdn_libraries',
  'search_web_design',
]

const TOOL_COMMAND = {
  run_build: 'npm run build',
  run_lint: 'npm run lint',
  run_tests: 'npm test',
}

const BROWSER_TOOLS = new Set([
  'browser_open',
  'browser_click',
  'browser_type',
  'browser_screenshot',
  'browser_scroll',
  'browser_console',
  'browser_network',
  'inspect_console',
  'inspect_network',
])

const DESIGN_RESOURCE_TOOLS = new Set([
  'search_design_resources',
  'inspect_design_resource',
  'get_component_reference',
  'get_icon_reference',
  'get_font_reference',
  'get_animation_reference',
  'get_cdn_resource',
  'research_design_practices',
  'search_cdn_libraries',
  'search_web_design',
])

export function authorizeTool({ tool, userId, projectId, workspaceDir, relativePath, command } = {}) {
  if (!V2_TOOLS.includes(tool)) {
    return { ok: false, code: 'TOOL_UNKNOWN', message: `Tool ${tool} is not registered.` }
  }
  if (!userId || !projectId) {
    return { ok: false, code: 'TOOL_AUTH', message: 'Tool calls require authenticated project ownership.' }
  }
  if (workspaceDir && !BROWSER_TOOLS.has(tool) && !DESIGN_RESOURCE_TOOLS.has(tool)) {
    const inside = assertInsideWorkspace(workspaceDir, relativePath || 'src/App.jsx')
    if (!inside.ok) return inside
  }
  if (TOOL_COMMAND[tool]) {
    const allowed = assertAllowedCommand(TOOL_COMMAND[tool])
    if (!allowed.ok) return allowed
  }
  if (command) {
    const allowed = assertAllowedCommand(command)
    if (!allowed.ok) return allowed
  }
  return { ok: true, tool }
}
