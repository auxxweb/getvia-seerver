import { DIRECTION_IDS, DIRECTIONS, specFromDirection, compositionKey } from './catalog.js'

function hashSeed(value) {
  let h = 2166136261
  for (const ch of String(value || 'getvia')) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function shuffle(list, seed) {
  const out = [...list]
  let s = hashSeed(seed)
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function exploreDirections({
  currentDNA,
  mode = 'REDESIGN',
  novelty = 3,
  seed = '',
  avoid = [],
  count = 4,
  preferredPool = null,
} = {}) {
  const currentKey = compositionKey(currentDNA)
  const currentId = currentDNA?.direction
  const blocked = new Set([...(avoid || []), mode === 'PRESERVE' ? null : currentId].filter(Boolean))
  const preferred = Array.isArray(preferredPool)
    ? preferredPool.filter((id) => DIRECTIONS[id] && !blocked.has(id))
    : []
  let pool = preferred.length ? preferred : DIRECTION_IDS.filter((id) => !blocked.has(id))
  if (!pool.length) pool = [...DIRECTION_IDS]
  const ordered = shuffle(pool, `${seed}:${mode}:${novelty}`)
  const candidateIds = ordered.slice(0, Math.max(1, count))
  if (mode === 'PRESERVE' && currentId && DIRECTIONS[currentId]) {
    return {
      mode,
      novelty: 1,
      candidates: [specFromDirection(currentId)],
      chosen: specFromDirection(currentId),
      reusedComposition: true,
    }
  }
  if (mode === 'EVOLVE' && currentId && DIRECTIONS[currentId]) {
    const spec = specFromDirection(currentId)
    spec.colorStrategy = { ...spec.colorStrategy, accent: spec.colorStrategy.accent === '#111111' ? '#3d2b24' : spec.colorStrategy.accent }
    spec.evolved = true
    return { mode, novelty, candidates: [spec], chosen: spec, reusedComposition: true }
  }
  const candidates = candidateIds.map((id) => specFromDirection(id))
  const chosen = candidates.find((s) => compositionKey(s) !== currentKey) || candidates[0]
  return {
    mode,
    novelty,
    candidates,
    chosen,
    reusedComposition: false,
    poolSize: pool.length,
  }
}

export { specFromDirection, compositionKey, DIRECTION_IDS, DIRECTIONS }
