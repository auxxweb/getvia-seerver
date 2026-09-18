const AGENT_TOOLS = {
  requirement: ['getBusinessProfile', 'getWebsiteState'],
  context: ['getBusinessProfile', 'getWebsiteState', 'getBusinessAssets'],
  planner: ['getBusinessProfile', 'getWebsiteState', 'getAvailableTemplates', 'getAvailableSections'],
  design: ['getWebsiteState', 'getAvailableTemplates'],
  content: ['getBusinessProfile', 'getWebsiteState'],
  asset: ['getBusinessProfile', 'getBusinessAssets'],
  functionality: ['getBusinessProfile', 'getWebsiteState'],
  seo: ['getBusinessProfile', 'getWebsiteState'],
  designer: ['getWebsiteState', 'getAvailableSections'],
  validation: ['getWebsiteState', 'runWebsiteValidation'],
  repair: ['getWebsiteState'],
  publisher: ['validateChangeSet', 'createVersion', 'publishWebsite'],
}

export function toolsAllowedForAgent(agent) {
  return AGENT_TOOLS[agent] || []
}

export function assertToolAllowed(agent, toolName) {
  const allowed = toolsAllowedForAgent(agent)
  if (!allowed.includes(toolName)) {
    const err = new Error(`Tool ${toolName} is not allowed for agent ${agent}`)
    err.code = 'AI_TOOL_DENIED'
    throw err
  }
}
