/**
 * V3 coder policy: skip Codex and the OpenAI coding loop when a typed edit,
 * heuristic, or shared recipe already covers the request.
 */

import { heuristicSufficient } from '../agents/codingAgent.js'
import { classifyPromptClass, isExpensiveClass, isFeatureClass } from './promptClass.js'
import { shouldSkipFromMemory } from './memory.js'

export function decideCoder({ prompt, typed, hasSite = true, match } = {}) {
  const promptClass = match?.promptClass || classifyPromptClass(prompt)
  const typedHit = Boolean(typed?.written?.length)
  const heuristicHit = heuristicSufficient(prompt)
  const memoryHit = shouldSkipFromMemory(match, { hasSite })

  if (isExpensiveClass(promptClass) || promptClass === 'scoped-design') {
    return { useCodex: true, useOpenAiLoop: true, promptClass, reason: 'needs-developer' }
  }
  if (promptClass === 'fix-repair' && !typedHit) {
    return { useCodex: true, useOpenAiLoop: true, promptClass, reason: 'repair' }
  }
  if (typedHit) {
    return { useCodex: false, useOpenAiLoop: false, promptClass, reason: 'typed-edit' }
  }
  if (heuristicHit) {
    return { useCodex: false, useOpenAiLoop: false, promptClass, reason: 'heuristic' }
  }
  if (memoryHit && (isFeatureClass(promptClass) || promptClass === 'other')) {
    return { useCodex: false, useOpenAiLoop: false, promptClass, reason: 'shared-brain' }
  }
  return { useCodex: true, useOpenAiLoop: true, promptClass, reason: 'needs-developer' }
}
