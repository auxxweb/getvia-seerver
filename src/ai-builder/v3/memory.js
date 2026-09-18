/**
 * Shared GetVia brain: anonymized recipes that help later jobs (same owner and other users on this host).
 * File store always works. Mongo is used when the connection is ready.
 * Never store raw PII, emails, phones, or tenant secrets.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import mongoose from 'mongoose'
import { getWorkspaceRoot } from '../workspace/workspaceManager.js'
import {
  classifyPromptClass,
  anonymizeSnippet,
  extractRequirements,
  normalizeCategory,
} from './promptClass.js'
import { recordRunLearning, readLearning, buildLearningPromptAppendix } from '../learning/index.js'

const MAX_RECIPES = 200
const MIN_SKIP_SUCCESSES = 2

function brainDir() {
  return path.join(getWorkspaceRoot(), '.getvia-brain')
}

function recipesPath() {
  return path.join(brainDir(), 'recipes.json')
}

export function emptyBrain() {
  return { version: 3, recipes: [], updatedAt: new Date().toISOString() }
}

export async function readSharedBrain() {
  try {
    const raw = await fs.readFile(recipesPath(), 'utf8')
    return { ...emptyBrain(), ...JSON.parse(raw) }
  } catch {
    return emptyBrain()
  }
}

export async function writeSharedBrain(brain) {
  const dir = brainDir()
  await fs.mkdir(dir, { recursive: true })
  const next = { ...emptyBrain(), ...brain, updatedAt: new Date().toISOString() }
  next.recipes = (next.recipes || []).slice(0, MAX_RECIPES)
  await fs.writeFile(recipesPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

function recipeKey({ promptClass, category } = {}) {
  return `${promptClass || 'other'}::${normalizeCategory(category)}`
}

export function scoreRecipe(recipe, { promptClass, category } = {}) {
  if (!recipe) return 0
  if (recipe.promptClass !== promptClass) return 0
  const sameCat = normalizeCategory(recipe.category) === normalizeCategory(category)
  const success = Number(recipe.success || 0)
  const fail = Number(recipe.fail || 0)
  const base = success * 2 - fail * 3
  if (base <= 0) return 0
  return base + (sameCat ? 4 : 0)
}

export function matchRecipe(brain, { prompt, category } = {}) {
  const promptClass = classifyPromptClass(prompt)
  const cat = normalizeCategory(category)
  let best = null
  let bestScore = 0
  for (const recipe of brain?.recipes || []) {
    const score = scoreRecipe(recipe, { promptClass, category: cat })
    if (score > bestScore) {
      bestScore = score
      best = recipe
    }
  }
  if (!best || bestScore < 2) return { promptClass, recipe: null, confidence: 0, category: cat }
  const confidence = Math.min(1, bestScore / 10)
  return { promptClass, recipe: best, confidence, category: cat }
}

export function shouldSkipFromMemory(match, { hasSite = true } = {}) {
  if (!match?.recipe || !hasSite) return false
  if (match.promptClass === 'create-site' || match.promptClass === 'redesign-site' || match.promptClass === 'scoped-design') {
    return false
  }
  const success = Number(match.recipe.success || 0)
  const fail = Number(match.recipe.fail || 0)
  if (success < MIN_SKIP_SUCCESSES) return false
  if (fail > success) return false
  return match.confidence >= 0.4 && Boolean(match.recipe.skipCodex)
}

export async function recordV3Outcome({
  workspaceDir,
  prompt,
  intent,
  outcome,
  designDirection,
  category,
  failedStage,
  errors,
  gates,
  look,
  files = [],
  siteId,
  ownerId,
} = {}) {
  const site = await recordRunLearning({
    workspaceDir,
    prompt,
    intent,
    outcome,
    designDirection,
    category,
    failedStage,
    errors,
    gates,
    look,
  })
  const promptClass = classifyPromptClass(prompt)
  const cat = normalizeCategory(category)
  const field = /SUCCESS|COMPLETED|PARTIAL/i.test(String(outcome || '')) ? 'success' : 'fail'
  const skipCodex = ['feature-enquiry', 'feature-whatsapp', 'feature-button', 'feature-contact', 'copy-edit'].includes(
    promptClass,
  )
  const brain = await readSharedBrain()
  const key = recipeKey({ promptClass, category: cat })
  let recipe = brain.recipes.find((row) => recipeKey(row) === key)
  if (!recipe) {
    recipe = {
      key,
      promptClass,
      category: cat,
      success: 0,
      fail: 0,
      skipCodex,
      direction: designDirection || look || '',
      snippet: anonymizeSnippet(prompt),
      requirements: extractRequirements(prompt),
      files: (files || []).filter((f) => typeof f === 'string' && !f.includes('..')).slice(0, 8),
      updatedAt: new Date().toISOString(),
    }
    brain.recipes.unshift(recipe)
  }
  recipe[field] = (recipe[field] || 0) + 1
  if (field === 'success' && (designDirection || look)) recipe.direction = designDirection || look
  recipe.snippet = anonymizeSnippet(prompt)
  recipe.skipCodex = field === 'fail' ? false : skipCodex
  recipe.requirements = [...new Set([...(recipe.requirements || []), ...extractRequirements(prompt)])].slice(0, 12)
  recipe.updatedAt = new Date().toISOString()
  brain.recipes = [recipe, ...brain.recipes.filter((row) => row !== recipe)].slice(0, MAX_RECIPES)
  await writeSharedBrain(brain)
  await persistMongo({ recipe, site, siteId, ownerId, category: cat, promptClass }).catch(() => null)
  return { site, recipe, promptClass }
}

async function persistMongo({ recipe, site, siteId, ownerId, category, promptClass } = {}) {
  if (mongoose.connection.readyState !== 1) return
  const { AiRecipe } = await import('../../models/AiRecipe.js')
  await AiRecipe.findOneAndUpdate(
    { key: recipe.key },
    {
      $set: {
        promptClass: recipe.promptClass,
        category: recipe.category,
        success: recipe.success,
        fail: recipe.fail,
        skipCodex: recipe.skipCodex,
        direction: recipe.direction,
        snippet: recipe.snippet,
        requirements: recipe.requirements,
        files: recipe.files,
      },
    },
    { upsert: true },
  )
  if (siteId) {
    const { AiSiteMemory } = await import('../../models/AiSiteMemory.js')
    await AiSiteMemory.findOneAndUpdate(
      { siteId },
      {
        $set: {
          ownerId: ownerId || undefined,
          category,
          lastPromptClass: promptClass,
          preferredDirection: preferredFrom(site),
          requirements: (site?.requirements || recipe.requirements || []).slice(0, 24),
        },
      },
      { upsert: true },
    )
  }
  if (ownerId) {
    const { AiOwnerMemory } = await import('../../models/AiOwnerMemory.js')
    const update = { $set: { preferredDirection: preferredFrom(site) || '' } }
    if (category) update.$addToSet = { categories: category }
    await AiOwnerMemory.findOneAndUpdate({ ownerId }, update, { upsert: true })
  }
}

function preferredFrom(site) {
  const byDir = site?.stats?.byDirection || {}
  let best = ''
  let score = 0
  for (const [direction, row] of Object.entries(byDir)) {
    const s = (row.success || 0) * 2 - (row.fail || 0) * 2
    if (s > score && direction) {
      score = s
      best = direction
    }
  }
  return best
}

export async function loadV3Context({ workspaceDir, prompt, category } = {}) {
  const site = await readLearning(workspaceDir)
  const brain = await readSharedBrain()
  const match = matchRecipe(brain, { prompt, category })
  const learningBrief = [
    buildLearningPromptAppendix(site, { prompt, category }),
    match.recipe
      ? `SHARED BRAIN: class ${match.promptClass} for ${match.recipe.category} succeeded ${match.recipe.success || 0} times (failed ${match.recipe.fail || 0}). Prefer direction "${match.recipe.direction || ''}". Requirements: ${(match.recipe.requirements || []).join(', ') || 'none'}.`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
  return { site, brain, match, learningBrief, promptClass: match.promptClass }
}
