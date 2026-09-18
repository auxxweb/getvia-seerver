import { exploreDirections, specFromDirection } from '../../../agent/visual/design-explorer/index.js'
import { classifyDesignMode, noveltyFor } from '../../../agent/core/designMode.js'
import { selectDesignResources, resourceMode, formatResourceBrief } from './selector.js'
import { applyDesignResources } from './apply.js'
import { researchDesign, applyResearchToSelection, formatResearchBrief } from './research.js'
import { designDirectionForCategory, productBriefLines } from '../getvia/profileContract.js'
import { buildDesignDna, designDnaBrief } from '../getvia/designDna.js'
import { preferredDirectionFromLearning, buildLearningPromptAppendix } from '../learning/index.js'
import {
  selectDesignComposition,
  formatDesignLibraryBrief,
  industryDirectionPool,
} from '../design-library/index.js'

function exploreModeFor(resourceModeName) {
  if (resourceModeName === 'CREATE') return 'REDESIGN'
  return resourceModeName
}

export function exploreDesignWithResources({
  prompt,
  brain,
  mode = 'REDESIGN',
  seed = '',
  explore,
  business,
  novelty,
  learning,
} = {}) {
  const designMode = exploreModeFor(mode)
  const level = novelty ?? noveltyFor(designMode, prompt)
  const industryPool = industryDirectionPool(business?.category, '', prompt)
  const next =
    explore ||
    exploreDirections({
      currentDNA: brain?.designDNA || brain?.designSystem,
      mode: designMode,
      seed: `${seed}:${business?.name || business?.category || ''}`,
      novelty: level,
      preferredPool: industryPool,
      count: Math.min(6, Math.max(4, industryPool.length)),
    })
  const learned = preferredDirectionFromLearning(learning || brain?.learning, {
    category: business?.category,
    prompt,
  })
  const composition = selectDesignComposition({
    category: business?.category,
    prompt,
    businessName: business?.name,
    seed: `${seed}:${projectSafe(business)}`,
    novelty: level,
    avoidDirections: learned ? [] : [brain?.designDNA?.direction, brain?.designSystem?.style].filter(Boolean),
    sections: business?.sections,
  })
  const categoryDir =
    learned ||
    composition.directionId ||
    designDirectionForCategory(business?.category, '', prompt, business?.name || seed)

  if (designMode === 'PRESERVE') {
    return { ...next, mode: designMode, novelty: level, learned: Boolean(learned), composition }
  }

  if ((designMode === 'REDESIGN' || designMode === 'REIMAGINE' || designMode === 'CREATE') && categoryDir) {
    const preferred = specFromDirection(categoryDir)
    if (preferred) {
      return {
        ...next,
        mode: designMode,
        novelty: level,
        chosen: preferred,
        pinned: categoryDir,
        learned: Boolean(learned),
        composition: {
          ...composition,
          directionId: preferred.direction,
          directionLabel: preferred.label,
          spec: preferred,
          patternId: `${composition.industry?.id || 'general'}__${preferred.direction}__${composition.components?.hero || 'hero'}`,
        },
      }
    }
  }
  return { ...next, mode: designMode, novelty: level, learned: Boolean(learned), composition }
}

function projectSafe(business) {
  return `${business?.name || ''}:${business?.category || ''}`
}

export async function selectAndApplyDesignResources({
  workspaceDir,
  prompt,
  intent,
  hasSite = false,
  rebuild = false,
  brain,
  explore,
  business,
  projectId,
  learning,
  scoped = false,
} = {}) {
  const mode = resourceMode({ intent, hasSite, rebuild, prompt, scoped })
  const designMode = classifyDesignMode(prompt, intent === 'CREATE' ? 'CREATE' : intent, { scoped })
  const novelty = noveltyFor(designMode === 'PRESERVE' && mode !== 'PRESERVE' ? mode : designMode, prompt, intent)
  // Scoped section edits keep existing fonts/icons — skip live redesign research.
  if (scoped && mode === 'PRESERVE') {
    const selection = selectDesignResources({
      prompt,
      style: '',
      spec: {},
      intent: 'EDIT',
      existing: brain?.designResources,
      hasSite,
      rebuild: false,
      framework: 'react-vite',
      scoped: true,
    })
    const designDna = buildDesignDna({
      explore: null,
      spec: {},
      mode: 'PRESERVE',
      novelty: 1,
      category: business?.category,
    })
    const learnBrief = buildLearningPromptAppendix(learning || brain?.learning, {
      prompt,
      intent,
      category: business?.category,
    })
    const brief = [
      ...productBriefLines({
        mode: 'PRESERVE',
        novelty: 1,
        designDna,
        functionality: business?.functionality,
        scoped: true,
      }),
      learnBrief,
      formatResourceBrief(selection),
      'SCOPED EDIT: Keep current Design DNA, fonts, and CDNs. Change only the requested section presentation.',
    ]
      .filter(Boolean)
      .join('\n\n')
    return {
      explore: { mode: 'PRESERVE', novelty: 1, skipped: true },
      selection,
      applied: { ok: true, written: [], used: selection.used || [], skipped: true },
      research: { ok: true, live: false, practices: [], web: [], libraries: [], pins: [], queries: [], skipped: true },
      mode: 'PRESERVE',
      novelty: 1,
      designDna,
      learningBrief: learnBrief,
      brief,
      scoped: true,
    }
  }
  const exploration = exploreDesignWithResources({
    prompt,
    brain,
    mode,
    novelty,
    business,
    learning: learning || brain?.learning,
    seed: `${projectId || ''}:${String(prompt || '').slice(0, 40)}`,
    explore,
  })
  let selection = selectDesignResources({
    prompt,
    style: exploration.chosen?.label || exploration.chosen?.direction,
    spec: {
      ...exploration.chosen,
      look: business?.look,
      direction: exploration.chosen?.direction || exploration.chosen?.id,
    },
    intent,
    existing: brain?.designResources,
    hasSite,
    rebuild,
    framework: 'react-vite',
    scoped,
  })
  let research = { ok: true, live: false, practices: [], web: [], libraries: [], pins: [], queries: [] }
  if (mode === 'REDESIGN' || mode === 'REIMAGINE' || mode === 'CREATE' || mode === 'EVOLVE') {
    if (mode !== 'PRESERVE') {
      research = await researchDesign({
        prompt,
        style: exploration.chosen?.label || exploration.chosen?.direction,
        category: business?.category,
        selection,
      })
      selection = applyResearchToSelection(selection, research)
    }
  }
  const applied = workspaceDir
    ? await applyDesignResources(workspaceDir, selection, {
        replace: mode === 'CREATE' || mode === 'REDESIGN' || mode === 'REIMAGINE',
      })
    : { ok: false, written: [], used: [] }
  const designDna = buildDesignDna({
    explore: exploration,
    spec: {
      colors: exploration.chosen?.colorStrategy,
      fontHeading: exploration.chosen?.typographyHierarchy?.heading,
      fontBody: exploration.chosen?.typographyHierarchy?.body,
      style: exploration.chosen?.direction,
      layout: exploration.chosen?.layoutStyle,
      animation: exploration.chosen?.animation,
    },
    mode: exploration.mode || mode,
    novelty: exploration.novelty ?? novelty,
    category: business?.category,
  })
  const learnBrief = buildLearningPromptAppendix(learning || brain?.learning, {
    prompt,
    intent,
    category: business?.category,
  })
  const libraryBrief = formatDesignLibraryBrief(exploration.composition)
  const brief = [
    ...productBriefLines({
      mode: exploration.mode || mode,
      novelty: exploration.novelty ?? novelty,
      designDna,
      functionality: business?.functionality,
      scoped: Boolean(scoped),
      libraryBrief,
    }),
    learnBrief,
    formatResourceBrief(selection),
    designDnaBrief(designDna),
    formatResearchBrief(research),
  ]
    .filter(Boolean)
    .join('\n\n')
  return {
    explore: exploration,
    composition: exploration.composition || null,
    selection,
    applied,
    research,
    mode: exploration.mode || mode,
    novelty: exploration.novelty ?? novelty,
    designDna,
    learningBrief: learnBrief,
    brief,
    scoped: Boolean(scoped),
  }
}
