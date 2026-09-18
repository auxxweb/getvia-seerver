import { getOpenAiClient, isOpenAiConfigured, recordUsage } from './client.js'
import { resolveModelTier, routeV2Task } from './modelRouter.js'
import { modelSupportsCustomTemperature } from './structuredOutput.js'
import {
  isOpenAiBillingError,
  markOpenAiHealthy,
  markOpenAiUnavailable,
  OPENAI_QUOTA_MESSAGE,
  shouldSkipOpenAiLlm,
} from './availability.js'
import { executeTool } from '../v2/toolExecutor.js'
import { buildCodingSystemPrompt } from '../getvia/masterAgentPrompt.js'

export { buildCodingSystemPrompt } from '../getvia/masterAgentPrompt.js'

export const MAX_CODING_STEPS = 12

const OPENAI_CODING_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List source files in the isolated React+Vite website workspace.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a workspace file. Use this before editing.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_code',
      description: 'Find files containing a string.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write the full contents of one allowed file (src/**, index.html).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string' },
          contents: { type: 'string' },
        },
        required: ['path', 'contents'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_design_resources',
      description: 'Search the approved Design Resource registry (fonts, icons, animation, CSS libs, component references). Never invent CDN URLs.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string' },
          query: { type: 'string' },
          style: { type: 'string' },
          framework: { type: 'string' },
          requirements: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'inspect_design_resource',
      description: 'Inspect a registry resource: CDN, license, usage, accessibility, and required CSS/JS.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          resourceId: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_component_reference',
      description: 'Get structural component references (hero, nav, cards). Adapt to the brand; do not paste templates.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string' },
          style: { type: 'string' },
          id: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_icon_reference',
      description: 'Recommend a single icon system from the registry.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { query: { type: 'string' }, style: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_font_reference',
      description: 'Recommend typography from the registry based on DesignSpec / business style.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { query: { type: 'string' }, style: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_animation_reference',
      description: 'Recommend CSS-first animation; libraries only when the request needs them.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { query: { type: 'string' }, style: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cdn_resource',
      description: 'Resolve an approved CDN URL. Unknown domains are rejected.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          url: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'research_design_practices',
      description: 'Research live design practices, CDN libraries, and font/CDN versions for this brief before writing code. Does not inject untrusted scripts.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string' },
          style: { type: 'string' },
          category: { type: 'string' },
          prompt: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_cdn_libraries',
      description: 'Search jsDelivr/cdnjs plus the trusted registry. Returned CDNs are marked allowed or rejected.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string' },
          package: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web_design',
      description: 'Web-search design references (Brave if BRAVE_SEARCH_API_KEY is set, otherwise DuckDuckGo). Treat results as inspiration only.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
]

export function toolCallToExecutorInput(name, args = {}) {
  const tool = String(name || '')
  return {
    tool,
    relativePath: args.path || args.relativePath || '',
    contents: args.contents,
    query: args.query,
    command: args.command,
    category: args.category,
    style: args.style,
    framework: args.framework,
    requirements: args.requirements,
    id: args.id,
    name: args.name,
    url: args.url,
    resourceId: args.resourceId,
    package: args.package,
  }
}

function parseArgs(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(String(raw))
  } catch {
    return {}
  }
}

export const MAX_TOOL_FILE_CHARS = 120_000

export function clipToolOutput(result) {
  const payload = {
    success: Boolean(result?.success),
    error: result?.error || null,
    path: result?.path,
    written: result?.written,
    files: result?.files,
    hits: result?.hits,
    results: result?.results,
    id: result?.id,
    name: result?.name,
    category: result?.category,
    cdn: result?.cdn,
    usage: result?.usage,
    license: result?.license,
    allowed: result?.allowed,
    blocked: result?.blocked,
    version: result?.version,
    documentation: result?.documentation,
    structure: result?.structure,
    cssIdeas: result?.cssIdeas,
    practices: result?.practices,
    web: result?.web,
    libraries: result?.libraries,
    pins: result?.pins,
    queries: result?.queries,
    live: result?.live,
    source: result?.source,
    message: result?.message || result?.output?.slice?.(0, 4000) || result?.output,
  }
  if (typeof result?.output === 'string') {
    payload.bytes = result.output.length
    payload.contents = result.output.slice(0, MAX_TOOL_FILE_CHARS)
    if (result.output.length > MAX_TOOL_FILE_CHARS) {
      payload.truncated = true
      payload.message =
        'File is longer than the read window. Do not write this partial text back. Read the section you need, then write a complete valid file.'
    }
  }
  return JSON.stringify(payload)
}

export async function runOpenAiCodingLoop({
  workspaceDir,
  prompt,
  profile,
  userId,
  projectId,
  signal,
  onEvent,
  inspect,
  learningBrief = '',
  allowedFiles = null,
} = {}) {
  if (!workspaceDir || !prompt) {
    return { ok: false, skipped: true, written: [], steps: [], coder: 'openai-loop', message: 'Missing workspace or prompt.' }
  }
  if (!isOpenAiConfigured() || shouldSkipOpenAiLlm()) {
    return { ok: false, skipped: true, written: [], steps: [], coder: 'openai-loop', code: 'OPENAI_SKIPPED' }
  }

  const routed = routeV2Task('coding')
  const { model } = resolveModelTier(routed.tier, { model: routed.model })
  const client = getOpenAiClient()
  const written = []
  const steps = []
  const allow = Array.isArray(allowedFiles) && allowedFiles.length ? [...new Set(allowedFiles.map(String))] : null
  const baseSystem = buildCodingSystemPrompt({ scoped: Boolean(allow) })
  const system = learningBrief
    ? `${baseSystem}\n\n${String(learningBrief).slice(0, 2500)}`
    : baseSystem
  const messages = [
    { role: 'system', content: system },
    {
      role: 'user',
      content: JSON.stringify({
        prompt: String(prompt).slice(0, 8000),
        businessName: profile?.identity?.name || '',
        homepage: inspect?.homepage || 'src/App.jsx',
        files: (inspect?.files || []).slice(0, 40),
        allowedWriteFiles: allow || undefined,
        instruction: allow
          ? `Inspect first, then write ONLY these files: ${allow.join(', ')}. Do not modify other components.`
          : 'Inspect the current one-page site, then implement the request with the smallest sufficient file writes. Apply self-learning lessons when relevant.',
      }),
    },
  ]

  const timeout = AbortSignal.timeout(90_000)
  const combined = signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : signal || timeout

  try {
    for (let i = 0; i < MAX_CODING_STEPS; i += 1) {
      const body = {
        model,
        messages,
        tools: OPENAI_CODING_TOOLS,
        tool_choice: 'auto',
      }
      if (modelSupportsCustomTemperature(model)) body.temperature = 0.2
      const resp = await client.chat.completions.create(body, { signal: combined })
      await recordUsage({ userId, model, operation: 'coding_loop', usage: resp.usage })
      markOpenAiHealthy()
      const msg = resp.choices?.[0]?.message
      if (!msg) break
      messages.push(msg)
      const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : []
      if (!calls.length) {
        steps.push({ type: 'summary', message: String(msg.content || '').slice(0, 400) })
        break
      }
      for (const call of calls) {
        const name = call.function?.name
        const args = parseArgs(call.function?.arguments)
        const input = toolCallToExecutorInput(name, args)
        await onEvent?.({ type: 'FILE_READ', message: `${name} ${input.relativePath || input.query || ''}`.trim() })
        const result = await executeTool({
          ...input,
          userId,
          projectId,
          workspaceDir,
          signal,
          allowedFiles: allow,
        })
        if (result.written?.length) written.push(...result.written)
        steps.push({ tool: name, path: input.relativePath, ok: result.success, error: result.error || null })
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: clipToolOutput(result),
        })
      }
    }
  } catch (err) {
    if (isOpenAiBillingError(err)) {
      markOpenAiUnavailable('quota')
      return {
        ok: false,
        skipped: true,
        written: [],
        steps,
        coder: 'openai-loop',
        code: 'OPENAI_QUOTA',
        error: OPENAI_QUOTA_MESSAGE,
        summary: OPENAI_QUOTA_MESSAGE,
      }
    }
    return {
      ok: written.length > 0,
      skipped: false,
      written: [...new Set(written)],
      steps,
      coder: 'openai-loop',
      error: String(err?.message || err).slice(0, 240),
    }
  }

  return {
    ok: written.length > 0,
    skipped: false,
    written: [...new Set(written)],
    steps,
    coder: 'openai-loop',
    summary: steps.find((s) => s.type === 'summary')?.message || 'Updated isolated website files.',
  }
}
