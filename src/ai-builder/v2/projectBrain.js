import fs from 'node:fs/promises'
import path from 'node:path'

const BRAIN_REL = '.getvia/brain.json'

export function emptyBrain({ userId, projectId } = {}) {
  return {
    projectId: String(projectId || ''),
    userId: String(userId || ''),
    framework: 'react-vite',
    pages: ['Home'],
    sections: [],
    components: [],
    designSystem: {},
    assets: [],
    dependencies: ['react', 'react-dom', 'vite'],
    business: {},
    currentTask: null,
    previousTasks: [],
    recentChanges: [],
    knownIssues: [],
    buildStatus: 'unknown',
    previewStatus: 'unknown',
    conversationSummary: '',
    designResources: [],
    designDNA: null,
    designResearch: null,
    learning: null,
    updatedAt: new Date().toISOString(),
  }
}

export async function readProjectBrain(workspaceDir) {
  try {
    const raw = await fs.readFile(path.join(workspaceDir, BRAIN_REL), 'utf8')
    return { ...emptyBrain(), ...JSON.parse(raw) }
  } catch {
    return emptyBrain()
  }
}

export async function writeProjectBrain(workspaceDir, brain) {
  const dir = path.join(workspaceDir, '.getvia')
  await fs.mkdir(dir, { recursive: true })
  const next = { ...emptyBrain(), ...brain, updatedAt: new Date().toISOString() }
  await fs.writeFile(path.join(workspaceDir, BRAIN_REL), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

export function targetedContext(brain, intent) {
  const recent = (brain.recentChanges || []).slice(-8)
  const issues = (brain.knownIssues || []).slice(-6)
  return {
    framework: brain.framework,
    pages: brain.pages,
    sections: brain.sections,
    components: (brain.components || []).slice(0, 40),
    designSystem: brain.designSystem,
    recentChanges: recent,
    knownIssues: issues,
    intent: intent?.type,
    conversationSummary: String(brain.conversationSummary || '').slice(0, 800),
  }
}
