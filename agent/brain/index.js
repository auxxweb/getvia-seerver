import { indexProject } from './indexer/index.js'
import { brainFromIndex, emptyBrain, EMPTY_DESIGN_DNA, BRAIN_REL } from './schema.js'
import { readProjectBrain, writeProjectBrain } from './store.js'

export async function refreshProjectBrain(workspaceDir, extra = {}) {
  const index = await indexProject(workspaceDir)
  const previous = await readProjectBrain(workspaceDir, extra)
  const next = brainFromIndex(index, {
    ...extra,
    knownErrors: extra.knownErrors || previous.knownErrors,
    recentChanges: extra.recentChanges || previous.recentChanges,
    buildStatus: extra.buildStatus || previous.buildStatus,
    previewStatus: extra.previewStatus || previous.previewStatus,
    designDNA: extra.designDNA || previous.designDNA || { ...EMPTY_DESIGN_DNA },
    designResources: extra.designResources || previous.designResources || [],
  })
  const saved = await writeProjectBrain(workspaceDir, next)
  return { index, brain: saved }
}

export { indexProject, brainFromIndex, emptyBrain, EMPTY_DESIGN_DNA, BRAIN_REL, readProjectBrain, writeProjectBrain }
