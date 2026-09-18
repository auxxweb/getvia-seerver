import { completeJson } from '../openai/structuredOutput.js'
import { envFlag } from '../runtimeFlags.js'
import { sanitizeAiText } from '../lib/sanitize.js'
import { validateChangeSet } from '../state/changeSet.schema.js'
import { designerContextForSelection } from '../state/componentRegistry.js'
import { hydrateSectionComponents } from '../mutations/hydrateComponents.js'
import { interpretDesignerRequest, isFullWebsiteBuildPrompt, isLocalEditPrompt, normalizeDesignerOperations } from '../mutations/interpretDesignerRequest.js'
import { DESIGNER_MUTATION_SCHEMA } from '../openai/designerMutationSchema.js'

const EXECUTABLE_TYPES = new Set([
  'ADD_COMPONENT',
  'UPDATE_TEXT',
  'UPDATE_BUTTON',
  'UPDATE_LINK',
  'REMOVE_COMPONENT',
  'REORDER_SECTION',
  'ADD_SECTION',
  'UPDATE_THEME',
  'UPDATE_STYLE',
  'UPDATE_RESPONSIVE_STYLE',
  'THEME_CHANGE',
  'STYLE_CHANGE',
])

function mergeUniqueOps(base, extra) {
  const out = [...base]
  for (const op of extra || []) {
    const key = JSON.stringify({ type: op.type || op.operation, target: op.target, value: op.value, component: op.component })
    if (!out.some((row) => JSON.stringify({ type: row.type || row.operation, target: row.target, value: row.value, component: row.component }) === key)) {
      out.push(op)
    }
  }
  return out
}

function isRedesignOp(op) {
  const type = op.type || op.operation
  const changes = op.changes || {}
  if (type === 'PAGE_PLAN_CHANGE' || type === 'ADD_SECTION' || type === 'REORDER_SECTION') return true
  if ((type === 'UPDATE_THEME' || type === 'THEME_CHANGE') && (changes.look || changes.layout)) return true
  if (type === 'UPDATE_STYLE' && (changes.layout || changes.visualStyle || changes.cardStyle) && !changes.color && !changes.hideKicker) {
    return !op.target?.componentId
  }
  return false
}

function heuristicHasExecutableOps(interpreted) {
  return (interpreted.operations || []).some((op) => EXECUTABLE_TYPES.has(op.type || op.operation))
}

function logDesigner(payload) {
  if (process.env.NODE_ENV === 'production') return
  try {
    console.info('[ai-builder] designer', JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

export async function designerAgent({ prompt, selectedElement, profile, currentState, usageCtx, signal, completeJsonFn = completeJson }) {
  if (isFullWebsiteBuildPrompt(prompt) && !isLocalEditPrompt(prompt, { profile, selectedElement, websiteState: currentState })) {
    return {
      outcome: 'REROUTE_WEBSITE_BUILD',
      operations: [],
      resolvedTargets: [],
      intent: 'WEBSITE_BUILD',
      message: 'This is a full website request. GetVia will generate the site from your brief.',
    }
  }
  const state = hydrateSectionComponents(currentState || {})
  const interpreted = interpretDesignerRequest({ prompt, selectedElement, state, profile })
  let operations = interpreted.operations || []
  const context = designerContextForSelection({ state, selectedElement })
  const local = isLocalEditPrompt(prompt, { profile, selectedElement, websiteState: state }) || interpreted.intent === 'LOCAL_EDIT'
  const requirementKinds = (interpreted.analysis?.requirements || []).map((r) => r.kind)
  const heuristicComplete =
    heuristicHasExecutableOps(interpreted) &&
    interpreted.outcome !== 'UNSUPPORTED_CAPABILITY' &&
    interpreted.outcome !== 'REROUTE_WEBSITE_BUILD'
  const sendToAi =
    !local && !heuristicComplete && interpreted.outcome !== 'UNSUPPORTED_CAPABILITY' && !envFlag('AI_SKIP_CODING_LLM')

  if (interpreted.outcome === 'UNSUPPORTED_CAPABILITY' || interpreted.outcome === 'REROUTE_WEBSITE_BUILD') {
    return { ...interpreted, operations: [] }
  }

  let llmSuggestions = []
  let llmError = ''
  let llmRaw = null
  if (sendToAi) {
    const llm = await completeJsonFn({
      tier: 'simple',
      schemaName: 'designer_mutations',
      schema: DESIGNER_MUTATION_SCHEMA,
      usageCtx,
      signal,
      soft: true,
      system: `You emit executable website mutations only. Never reply in natural language.
Return JSON { intent, target, operations: [], suggestions: string[3] }.
Each operation.type must be one of: UPDATE_TEXT, UPDATE_STYLE, UPDATE_THEME, ADD_COMPONENT, REMOVE_COMPONENT, ADD_SECTION, UPDATE_LINK, UPDATE_BUTTON, REORDER_SECTION, UPDATE_RESPONSIVE_STYLE, UPDATE_VISIBILITY, UPDATE_LAYOUT.
If the user asked to add a button, operations MUST include ADD_COMPONENT with component.type "button" and props.text set to the requested label. target.sectionId must be "hero" unless they named another section.
If they asked to change heading text, emit UPDATE_TEXT with value.
Never emit UPDATE_STYLE or UPDATE_THEME instead of ADD_COMPONENT.
Never set sectionId to null. Use only ComponentRegistry types: heading, paragraph, button, image, badge.`,
      user: JSON.stringify({
        prompt: sanitizeAiText(prompt),
        analysis: interpreted.analysis,
        brief: interpreted.analysis?.brief,
        domains: interpreted.analysis?.domains,
        requirements: interpreted.analysis?.requirements,
        selectedElement: context.selectedElement,
        componentType: context.componentType,
        currentProperties: context.currentProperties,
        allowedProperties: context.allowedProperties,
        allowedComponents: context.allowedComponents,
        sectionTypes: context.sectionTypes,
        interpreted,
      }),
    })
    llmRaw = llm.data
    if (llm.ok && Array.isArray(llm.data?.operations) && llm.data.operations.length) {
      const checked = validateChangeSet({ operations: llm.data.operations })
      if (checked.operations?.length) {
        operations = mergeUniqueOps(operations, checked.operations)
      }
    } else if (!llm.ok) {
      llmError = llm.error || (llm.skipped ? 'AI is not configured or did not respond.' : 'AI did not return a change.')
    }
    if (Array.isArray(llm.data?.suggestions)) {
      llmSuggestions = llm.data.suggestions.map((row) => String(row || '').trim()).filter(Boolean).slice(0, 5)
    }
  }

  const normalized = normalizeDesignerOperations(operations)
  operations = local ? normalized.operations.filter((op) => !isRedesignOp(op)) : normalized.operations
  if (local && !operations.length) operations = interpreted.operations || []

  if (!operations.length) {
    const retry = interpretDesignerRequest({ prompt, selectedElement: { site: true }, state, profile })
    operations = local ? (retry.operations || []).filter((op) => !isRedesignOp(op)) : retry.operations || []
  }

  const suggestions = [...(llmSuggestions || []), ...(interpreted.suggestions || [])].filter(
    (row, i, arr) => row && arr.indexOf(row) === i,
  ).slice(0, 5)

  logDesigner({
    prompt,
    sendToAi,
    heuristicTypes: (interpreted.operations || []).map((op) => op.type),
    llmTypes: Array.isArray(llmRaw?.operations) ? llmRaw.operations.map((op) => op.type || op.operation) : [],
    finalTypes: operations.map((op) => op.type),
    outcome: operations.length ? 'SUCCESS' : 'FAILED',
  })

  if (!operations.length) {
    return {
      ...interpreted,
      operations: [],
      outcome: 'FAILED',
      message:
        llmError ||
        interpreted.message ||
        'I could not turn that request into a website change. Nothing was modified.',
      suggestions,
    }
  }

  return {
    ...interpreted,
    operations,
    outcome: 'SUCCESS',
    message: interpreted.message || interpreted.analysis?.summary || '',
    suggestions,
  }
}
