export async function reviewCompletion({ runtime, ctx, expect = [], files = [] }) {
  const needles = (expect || []).filter(Boolean)
  if (!needles.length) {
    return { ok: true, skipped: true, hits: [], message: 'No textual expectation to verify.' }
  }
  const hits = []
  const missing = []
  for (const needle of needles) {
    const found = await runtime.callTool('search_code', { query: needle }, ctx)
    if (found.success && found.data?.hits?.length) {
      hits.push({ needle, files: found.data.hits.map((h) => h.path) })
    } else {
      missing.push(needle)
    }
  }
  if (missing.length && missing.length === needles.length) {
    return {
      ok: false,
      hits,
      missing,
      files,
      message: `Review did not find expected text: ${missing.join(', ')}`,
    }
  }
  return {
    ok: missing.length === 0 || hits.length > 0,
    hits,
    missing,
    files,
    message: hits.length ? `Verified: ${hits.map((h) => h.needle).join(', ')}` : 'Review passed.',
  }
}
