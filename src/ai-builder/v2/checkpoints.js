import fs from 'node:fs/promises'
import path from 'node:path'

async function copyIfExists(from, to) {
  try {
    await fs.mkdir(path.dirname(to), { recursive: true })
    await fs.copyFile(from, to)
    return true
  } catch {
    return false
  }
}

export async function createCheckpoint(workspaceDir, { taskId, prompt } = {}) {
  const id = `${Date.now()}-${String(taskId || 'task').slice(-8)}`
  const dest = path.join(workspaceDir, '.getvia', 'checkpoints', id)
  await fs.mkdir(dest, { recursive: true })
  const copied = []
  for (const rel of ['src/data/business.json', 'src/App.jsx', 'src/index.css', 'src/design-system/tokens.js', '.getvia/brain.json']) {
    if (await copyIfExists(path.join(workspaceDir, rel), path.join(dest, rel))) copied.push(rel)
  }
  const meta = { id, prompt: String(prompt || '').slice(0, 500), copied, createdAt: new Date().toISOString() }
  await fs.writeFile(path.join(dest, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
  const listPath = path.join(workspaceDir, '.getvia', 'checkpoints.json')
  let list = []
  try {
    list = JSON.parse(await fs.readFile(listPath, 'utf8'))
  } catch {
    list = []
  }
  list.push(meta)
  await fs.mkdir(path.dirname(listPath), { recursive: true })
  await fs.writeFile(listPath, `${JSON.stringify(list.slice(-20), null, 2)}\n`, 'utf8')
  return meta
}

export async function listCheckpoints(workspaceDir) {
  try {
    return JSON.parse(await fs.readFile(path.join(workspaceDir, '.getvia', 'checkpoints.json'), 'utf8'))
  } catch {
    return []
  }
}

export async function restoreCheckpoint(workspaceDir, checkpointId) {
  const list = await listCheckpoints(workspaceDir)
  const meta = checkpointId ? list.find((row) => row.id === checkpointId) : list[list.length - 1]
  if (!meta) return { ok: false, code: 'CHECKPOINT_MISSING', message: 'No checkpoint to restore.' }
  const src = path.join(workspaceDir, '.getvia', 'checkpoints', meta.id)
  for (const rel of meta.copied || []) {
    await fs.mkdir(path.dirname(path.join(workspaceDir, rel)), { recursive: true })
    await fs.copyFile(path.join(src, rel), path.join(workspaceDir, rel))
  }
  return { ok: true, checkpoint: meta }
}
