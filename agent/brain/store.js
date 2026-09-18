import fs from 'node:fs/promises'
import path from 'node:path'
import { assertInsideWorkspace } from '../../src/ai-builder/security/pathPolicy.js'
import { BRAIN_REL, emptyBrain } from './schema.js'

export async function readProjectBrain(workspaceDir, ids = {}) {
  const inside = assertInsideWorkspace(workspaceDir, BRAIN_REL)
  if (!inside.ok) return emptyBrain(ids)
  try {
    const raw = await fs.readFile(inside.path, 'utf8')
    return { ...emptyBrain(ids), ...JSON.parse(raw) }
  } catch {
    return emptyBrain(ids)
  }
}

export async function writeProjectBrain(workspaceDir, brain) {
  const inside = assertInsideWorkspace(workspaceDir, BRAIN_REL)
  if (!inside.ok) throw new Error(inside.message)
  await fs.mkdir(path.dirname(inside.path), { recursive: true })
  const next = { ...emptyBrain(), ...brain, updatedAt: new Date().toISOString() }
  await fs.writeFile(inside.path, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}
