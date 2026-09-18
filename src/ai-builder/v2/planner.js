import { planWebsiteHeuristic } from '../agents/plannerAgent.js'
import { composeTemplate, inferTemplateCategory } from './templates.js'
import { designSpecFrom } from './designSystem.js'
import { analyzeIntent } from './intentAnalyzer.js'
import { applyLearningToPlan, preferredDirectionFromLearning } from '../learning/index.js'
import { analyzeEditScope } from '../mutations/editScope.js'
import { DESIGN_INTELLIGENCE_STAGES, masterPlanTasks } from '../getvia/masterAgentPrompt.js'
import { selectDesignComposition } from '../design-library/index.js'

export function planV2({ prompt, profile, requirements, websiteState, hasSite, learning, selectedElement } = {}) {
  const intent = analyzeIntent(prompt, { hasSite, selectedElement })
  const scope = analyzeEditScope({ prompt, selectedElement, hasSite: Boolean(hasSite) })
  const scoped = Boolean(hasSite && scope.scope !== 'site')
  const category = inferTemplateCategory(prompt, profile) || profile?.identity?.category || ''
  const extra = []
  const lower = String(prompt || '').toLowerCase()
  if (/pricing|price list|packages/.test(lower)) extra.push('pricing')
  if (/gallery|photos/.test(lower)) extra.push('gallery')
  if (/testimonial|reviews/.test(lower)) extra.push('reviews')
  const templateSections = composeTemplate(category, extra)
  const heuristic = planWebsiteHeuristic({ profile, requirements })
  const learnedDirection = preferredDirectionFromLearning(learning, {
    category: profile?.identity?.category || category,
    prompt,
  })
  const composition = selectDesignComposition({
    category: profile?.identity?.category || category,
    prompt,
    businessName: profile?.identity?.name,
    seed: `${profile?.identity?.name || ''}:${category}:${String(prompt || '').slice(0, 40)}`,
    novelty: scoped ? 1 : 3,
    sections: scoped ? scope.sections : templateSections,
    avoidDirections: learnedDirection ? [] : undefined,
  })
  const design = designSpecFrom({
    prompt: learnedDirection && !/\b(luxury|editorial|minimal|modern|glass|clay|brutal)\b/i.test(prompt)
      ? `${prompt} ${learnedDirection}`
      : prompt,
    business: {
      look: websiteState?.theme?.look,
      category: profile?.identity?.category,
      name: profile?.identity?.name,
    },
    preserveLook: scoped,
    mode: scoped ? 'PRESERVE' : undefined,
    explore: scoped ? null : { chosen: composition.spec, mode: 'REDESIGN', novelty: 3 },
  })
  const pages = heuristic.pages?.length ? heuristic.pages : [{ type: 'home', sections: templateSections }]
  const heuristicSections = (heuristic.sections || []).map((s) => s.type || s.id).filter(Boolean)
  const sections = scoped
    ? scope.sections.length
      ? scope.sections
      : [...new Set([...(heuristicSections.length ? heuristicSections : templateSections), ...extra])]
    : [...new Set([...(heuristicSections.length ? heuristicSections : templateSections), ...extra])]
  const tasks = masterPlanTasks({
    intentType: intent.type,
    designDirection: learnedDirection || composition.directionId || design.style,
    sections: scoped ? scope.sections : templateSections,
    scoped,
  })
  if (!scoped) {
    tasks.unshift({
      id: 'task-library',
      type: 'design-library',
      description: `Apply pattern ${composition.patternId} (${composition.industry?.label})`,
    })
  }
  const plan = {
    type: intent.type,
    category,
    pages: pages.map((p) => p.type || p),
    sections,
    designDirection: learnedDirection || composition.directionId || design.style,
    look: design.look,
    seo: { titleFromBusiness: true, noFakeBusiness: true },
    responsive: ['360x800', '390x844', '768x1024', '1280x800'],
    tasks,
    intelligenceStages: DESIGN_INTELLIGENCE_STAGES,
    composition,
    scope,
    scoped,
    themePreset: heuristic.themePreset,
    heuristic,
    design,
    intent,
    hasSite: Boolean(hasSite),
  }
  return applyLearningToPlan(plan, learning, { category: profile?.identity?.category || category, prompt })
}
