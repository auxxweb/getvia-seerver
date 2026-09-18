import fs from 'node:fs/promises'
import path from 'node:path'
import { classifyPromptClass, anonymizeSnippet, extractRequirements } from '../v3/promptClass.js'

const LEARNING_REL = '.getvia/learning.json'
const MAX_RUNS = 40
const MAX_LESSONS = 24
const MAX_WINS = 20

export function emptyLearning() {
  return {
    version: 3,
    runs: [],
    stats: {
      byIntent: {},
      byDirection: {},
      byCategory: {},
      byPromptClass: {},
    },
    lessons: [],
    promptWins: [],
    requirements: [],
    updatedAt: new Date().toISOString(),
  }
}

export async function readLearning(workspaceDir) {
  if (!workspaceDir) return emptyLearning()
  try {
    const raw = await fs.readFile(path.join(workspaceDir, LEARNING_REL), 'utf8')
    return { ...emptyLearning(), ...JSON.parse(raw) }
  } catch {
    return emptyLearning()
  }
}

export async function writeLearning(workspaceDir, learning) {
  if (!workspaceDir) return emptyLearning()
  const dir = path.join(workspaceDir, '.getvia')
  await fs.mkdir(dir, { recursive: true })
  const next = { ...emptyLearning(), ...learning, updatedAt: new Date().toISOString() }
  await fs.writeFile(path.join(workspaceDir, LEARNING_REL), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

function bump(map, key, field) {
  if (!key) return
  const row = map[key] || { success: 0, fail: 0, partial: 0 }
  row[field] = (row[field] || 0) + 1
  map[key] = row
}

function outcomeField(outcome) {
  const o = String(outcome || '').toUpperCase()
  if (o === 'SUCCESS' || o === 'COMPLETED') return 'success'
  if (o === 'PARTIAL') return 'partial'
  return 'fail'
}

function isNegativeFollowUp(prompt) {
  return /\b(fix|wrong|undo|revert|not what|don't like|do not like|ugly|broken|overflow|too (much|little)|change it back)\b/i.test(
    String(prompt || ''),
  )
}

function lessonId(kind, text) {
  return `${kind}:${String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 48)}`
}

function upsertLesson(lessons, { kind, text, weight = 1 }) {
  const id = lessonId(kind, text)
  const existing = lessons.find((row) => row.id === id)
  if (existing) {
    existing.weight = Math.min(12, (existing.weight || 1) + weight)
    existing.at = new Date().toISOString()
    existing.text = text
    return lessons
  }
  lessons.unshift({ id, kind, text, weight, at: new Date().toISOString() })
  return lessons.slice(0, MAX_LESSONS)
}

/**
 * Record a completed (or failed) run so planner / design / prompts improve next time.
 */
export async function recordRunLearning({
  workspaceDir,
  prompt,
  intent,
  outcome,
  designDirection,
  category,
  failedStage,
  errors = [],
  gates = {},
  look,
} = {}) {
  const learning = await readLearning(workspaceDir)
  learning.stats = {
    byIntent: {},
    byDirection: {},
    byCategory: {},
    byPromptClass: {},
    ...(learning.stats || {}),
  }
  if (!learning.stats.byPromptClass) learning.stats.byPromptClass = {}
  if (!Array.isArray(learning.requirements)) learning.requirements = []
  const field = outcomeField(outcome)
  const direction = String(designDirection || look || '').trim()
  const cat = String(category || '').trim()
  const intentType = String(intent || 'EDIT').toUpperCase()
  const promptClass = classifyPromptClass(prompt)
  const requirements = extractRequirements(prompt)

  bump(learning.stats.byIntent, intentType, field)
  bump(learning.stats.byDirection, direction, field)
  bump(learning.stats.byCategory, cat, field)
  bump(learning.stats.byPromptClass, promptClass, field)
  learning.requirements = [...new Set([...(learning.requirements || []), ...requirements])].slice(0, 24)

  const run = {
    at: new Date().toISOString(),
    prompt: anonymizeSnippet(prompt, 280),
    promptClass,
    intent: intentType,
    outcome: String(outcome || 'FAILED').toUpperCase(),
    direction: direction || null,
    category: cat || null,
    failedStage: failedStage || null,
    errors: (errors || []).map((e) => String(e).slice(0, 200)).slice(0, 4),
    gates: {
      build: Boolean(gates.build),
      runtime: Boolean(gates.runtime),
      visual: Boolean(gates.visual),
      review: Boolean(gates.review),
    },
  }
  learning.runs = [run, ...(learning.runs || [])].slice(0, MAX_RUNS)

  if (field === 'success' && direction) {
    learning.promptWins = [
      {
        promptSnippet: anonymizeSnippet(prompt, 160),
        direction,
        category: cat || null,
        intent: intentType,
        at: run.at,
      },
      ...(learning.promptWins || []),
    ].slice(0, MAX_WINS)
    learning.lessons = upsertLesson(learning.lessons || [], {
      kind: 'prefer',
      text: `For ${cat || 'this business'}, ${direction} design direction has worked well.`,
      weight: 1,
    })
  }

  if (field === 'fail') {
    if (failedStage) {
      learning.lessons = upsertLesson(learning.lessons || [], {
        kind: 'repair',
        text: `Previous ${intentType} run failed at ${failedStage}. Inspect and fix that stage before expanding scope.`,
        weight: 2,
      })
    }
    for (const err of run.errors) {
      learning.lessons = upsertLesson(learning.lessons || [], {
        kind: 'avoid',
        text: `Avoid repeating: ${err}`,
        weight: 1,
      })
    }
    if (direction) {
      learning.lessons = upsertLesson(learning.lessons || [], {
        kind: 'avoid',
        text: `${direction} struggled on the last failed run — verify tokens and section composition carefully.`,
        weight: 1,
      })
    }
  }

  if (isNegativeFollowUp(prompt) && learning.runs[1]) {
    const prev = learning.runs[1]
    learning.lessons = upsertLesson(learning.lessons || [], {
      kind: 'avoid',
      text: `User corrected the previous "${prev.direction || prev.intent}" result. Prefer a clearer visual change and keep GetVia data intact.`,
      weight: 3,
    })
  }

  return writeLearning(workspaceDir, learning)
}

export function preferredDirectionFromLearning(learning, { category, prompt } = {}) {
  const blob = String(prompt || '').toLowerCase()
  if (/fashion|clothing|apparel|boutique|lookbook|gossip/.test(blob)) return 'editorial'
  const wins = (learning?.promptWins || []).filter((row) => {
    if (!row?.direction) return false
    if (category && row.category && String(row.category).toLowerCase() !== String(category).toLowerCase()) return false
    return true
  })
  if (wins[0]?.direction) return wins[0].direction

  const byDir = learning?.stats?.byDirection || {}
  let best = null
  let score = -1
  for (const [direction, row] of Object.entries(byDir)) {
    if (!direction) continue
    const s = (row.success || 0) * 2 + (row.partial || 0) - (row.fail || 0) * 2
    if (s > score) {
      score = s
      best = direction
    }
  }
  return score > 0 ? best : null
}

export function applyLearningToPlan(plan, learning, { category, prompt } = {}) {
  if (!plan) return plan
  const preferred = preferredDirectionFromLearning(learning, { category, prompt })
  const next = { ...plan, learning: summarizeLearning(learning) }
  if (preferred && (plan.type === 'CREATE' || plan.type === 'DESIGN' || !plan.hasSite)) {
    next.designDirection = preferred
    next.look = plan.look
    next.learnedDirection = preferred
  }
  const repairLessons = (learning?.lessons || []).filter((l) => l.kind === 'repair').slice(0, 3)
  if (repairLessons.length) {
    next.tasks = [
      ...(plan.tasks || []),
      ...repairLessons.map((l, i) => ({
        id: `task-learn-${i}`,
        type: 'repair',
        description: l.text.slice(0, 180),
      })),
    ]
  }
  return next
}

export function summarizeLearning(learning) {
  if (!learning) return null
  return {
    runs: (learning.runs || []).length,
    topDirection: preferredDirectionFromLearning(learning, {}),
    lessons: (learning.lessons || []).slice(0, 8).map((l) => ({ kind: l.kind, text: l.text, weight: l.weight })),
    recentOutcomes: (learning.runs || []).slice(0, 5).map((r) => ({
      outcome: r.outcome,
      intent: r.intent,
      direction: r.direction,
      failedStage: r.failedStage,
    })),
  }
}

/**
 * Compact appendix injected into planner / design / coding prompts.
 */
export function buildLearningPromptAppendix(learning, { prompt, intent, category } = {}) {
  if (!learning || (!(learning.lessons || []).length && !(learning.runs || []).length)) return ''
  const preferred = preferredDirectionFromLearning(learning, { category, prompt })
  const lines = [
    'SELF-LEARNING (from prior runs on this GetVia site — improve, do not ignore):',
  ]
  if (preferred) lines.push(`- Prefer visual direction "${preferred}" when it fits the user request.`)
  const ranked = [...(learning.lessons || [])].sort((a, b) => (b.weight || 0) - (a.weight || 0)).slice(0, 8)
  for (const lesson of ranked) {
    lines.push(`- [${lesson.kind}] ${lesson.text}`)
  }
  const lastFail = (learning.runs || []).find((r) => outcomeField(r.outcome) === 'fail')
  if (lastFail?.failedStage) {
    lines.push(`- Last failure stage: ${lastFail.failedStage}. Validate that path after edits.`)
  }
  if (intent) lines.push(`- Current intent: ${intent}. Keep scope tight unless the user asked for a redesign.`)
  const win = (learning.promptWins || []).find((w) => !category || !w.category || w.category === category)
  if (win?.promptSnippet) {
    lines.push(`- Similar win: "${win.promptSnippet}" → ${win.direction}`)
  }
  if ((learning.requirements || []).length) {
    lines.push(`- Remembered requirements: ${learning.requirements.slice(0, 8).join(', ')}`)
  }
  return lines.join('\n')
}
