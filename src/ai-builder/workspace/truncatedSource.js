const TRUNCATION_MARKERS = [
  /…truncated/,
  /\.{3}truncated/i,
  /\/\*\s*\.{3}[\s\S]{0,40}existing code/i,
  /\/\/\s*\.{3}\s*(rest of|existing)/i,
]

export function looksLikeTruncatedSource(text) {
  const src = String(text || '')
  if (!src.trim()) return false
  return TRUNCATION_MARKERS.some((re) => re.test(src))
}
