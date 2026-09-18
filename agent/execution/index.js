export const MAX_BUILD_REPAIRS = 5
export const MAX_BROWSER_REPAIRS = 5
export const MAX_DESIGN_ITERS = 3

export function parseBuildFailure(build = {}) {
  const text = [build.message, build.details?.stderr, build.details?.stdout, build.data?.stdout]
    .filter(Boolean)
    .join('\n')
  const files = [...text.matchAll(/src\/[A-Za-z0-9._/-]+\.(jsx?|tsx?|css|json)/g)].map((m) => m[0])
  return {
    text,
    files: [...new Set(files)],
    marker: /BROKEN/.test(text) ? 'BROKEN' : null,
  }
}
