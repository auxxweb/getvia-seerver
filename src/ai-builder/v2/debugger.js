import { extractCompilerMessage } from '../validation/buildError.js'

export function parseBuildError(build = {}) {
  const text = `${build.stderr || ''}\n${build.stdout || ''}\n${build.message || ''}`
  const fileMatch = text.match(/((?:src\/)?[\w./-]+\.jsx?):\s*(\d+)/) || text.match(/from\s+((?:src\/)?[\w./-]+\.jsx?)/)
  return {
    type: 'BUILD_ERROR',
    file: fileMatch?.[1] || '',
    line: fileMatch?.[2] ? Number(fileMatch[2]) : null,
    message: extractCompilerMessage(text) || 'Build failed.',
    severity: 'high',
    exitCode: build.exitCode ?? build.code,
  }
}

export function debugPrompt(error, originalPrompt) {
  return [
    'DEBUG the isolated React + Vite workspace.',
    `Original user request: ${String(originalPrompt || '').slice(0, 800)}`,
    `Build error: ${error.message}`,
    error.file ? `Likely file: ${error.file}` : '',
    'Fix only what is broken. Keep existing sections and buttons. npm run build must pass.',
    'Never write incomplete files or the text …truncated into source.',
  ]
    .filter(Boolean)
    .join('\n')
}
