import { toolOk } from './result.js'
import { runDesignResourceTool, DESIGN_RESOURCE_TOOL_NAMES } from '../../src/ai-builder/design-resources/tools.js'

const STRING = { type: 'string' }

const SCHEMAS = {
  search_design_resources: {
    type: 'object',
    additionalProperties: false,
    properties: {
      category: STRING,
      query: STRING,
      style: STRING,
      framework: STRING,
      requirements: STRING,
    },
  },
  inspect_design_resource: {
    type: 'object',
    additionalProperties: false,
    properties: { id: STRING, name: STRING, resourceId: STRING },
  },
  get_component_reference: {
    type: 'object',
    additionalProperties: false,
    properties: { query: STRING, style: STRING, id: STRING },
  },
  get_icon_reference: {
    type: 'object',
    additionalProperties: false,
    properties: { query: STRING, style: STRING },
  },
  get_font_reference: {
    type: 'object',
    additionalProperties: false,
    properties: { query: STRING, style: STRING },
  },
  get_animation_reference: {
    type: 'object',
    additionalProperties: false,
    properties: { query: STRING, style: STRING },
  },
  get_cdn_resource: {
    type: 'object',
    additionalProperties: false,
    properties: { id: STRING, name: STRING, url: STRING },
  },
  research_design_practices: {
    type: 'object',
    additionalProperties: false,
    properties: { query: STRING, style: STRING, category: STRING, prompt: STRING },
  },
  search_cdn_libraries: {
    type: 'object',
    additionalProperties: false,
    properties: { query: STRING, package: STRING },
  },
  search_web_design: {
    type: 'object',
    additionalProperties: false,
    properties: { query: STRING },
  },
}

const DESCRIPTIONS = {
  search_design_resources: 'Search the approved design-resource registry (fonts, icons, animation, CSS, component references).',
  inspect_design_resource: 'Inspect a registry resource: CDN, license, usage, and required CSS/JS.',
  get_component_reference: 'Get a structural component reference. Adapt it to the brand; do not paste a template.',
  get_icon_reference: 'Recommend a single icon system from the registry.',
  get_font_reference: 'Recommend typography from the registry for the current design direction.',
  get_animation_reference: 'Recommend CSS-first animation; libraries only when needed.',
  get_cdn_resource: 'Resolve an approved CDN URL. Unknown domains are rejected.',
  research_design_practices: 'Research live design practices, CDN libraries, and current versions before coding.',
  search_cdn_libraries: 'Search jsDelivr/cdnjs and the trusted registry for libraries.',
  search_web_design: 'Web-search design references. Inspiration only; never inject unknown scripts.',
}

export function registerDesignResourceTools(registry) {
  for (const name of DESIGN_RESOURCE_TOOL_NAMES) {
    registry.register({
      name,
      description: DESCRIPTIONS[name],
      permission: 'read',
      inputSchema: SCHEMAS[name],
      async executor({ input }) {
        const payload = await runDesignResourceTool(name, input || {})
        if (payload?.ok === false) {
          return {
            success: false,
            tool: name,
            data: payload,
            errorType: payload.error || 'RESOURCE_FAILED',
            message: payload.message || payload.error || 'Design resource tool failed.',
            recoverable: true,
          }
        }
        return toolOk(name, payload)
      },
    })
  }
}
