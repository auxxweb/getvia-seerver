const SIMILAR_THRESHOLD = 0.92

export function screenshotSimilarity(a, b) {
  if (!a?.length || !b?.length) return 0
  const left = Buffer.isBuffer(a) ? a : Buffer.from(a)
  const right = Buffer.isBuffer(b) ? b : Buffer.from(b)
  if (left.equals(right)) return 1
  const len = Math.min(left.length, right.length)
  if (!len) return 0
  const step = Math.max(1, Math.floor(len / 5000))
  let same = 0
  let n = 0
  for (let i = 8; i < len; i += step) {
    n += 1
    if (left[i] === right[i]) same += 1
  }
  const size = Math.min(left.length, right.length) / Math.max(left.length, right.length)
  const pixel = n ? same / n : 0
  return Number((pixel * 0.75 + size * 0.25).toFixed(4))
}

export function isSameComposition(previous, next, { screenshots } = {}) {
  if (screenshots?.before?.length && screenshots?.after?.length) {
    const score = screenshotSimilarity(screenshots.before, screenshots.after)
    if (score >= SIMILAR_THRESHOLD) return { similar: true, score, reason: 'screenshot' }
    return { similar: false, score, reason: 'screenshot' }
  }
  const prevKey = previous?.direction || previous?.layoutStyle
  const nextKey = next?.direction || next?.layoutStyle
  if (prevKey && nextKey && prevKey === nextKey) {
    return { similar: true, score: 1, reason: 'composition' }
  }
  return { similar: false, score: 0, reason: 'composition' }
}

export { SIMILAR_THRESHOLD }
