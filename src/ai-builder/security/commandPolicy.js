const ALLOWED_NPM = new Set(['install', 'ci', 'run'])
const ALLOWED_SCRIPTS = new Set(['dev', 'build', 'lint', 'test', 'preview'])
const BLOCKED = [
  /\brm\s+-rf\s+(\/|~)\b/,
  /\bsudo\b/,
  /\bchmod\s+-R\b/,
  /\bchown\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bcurl\b.*\|\s*(sh|bash)/,
  /\bwget\b.*\|\s*(sh|bash)/,
  /\bssh\b/,
  /\bscp\b/,
  /\bdocker\s+run\b.*--privileged/,
  /\biptables\b/,
  /\bsystemctl\b/,
  /\bservice\s+/,
  /\beval\b/,
  /\bchild_process\b/,
]

export function parseCommand(input) {
  const text = String(input || '').trim()
  if (!text) return { ok: false, code: 'COMMAND_REJECTED', message: 'Command is empty.' }
  if (/[;&|`$<>]/.test(text) && !/^npx vite( --host localhost)?$/.test(text)) {
    return { ok: false, code: 'COMMAND_REJECTED', message: 'Shell metacharacters are not allowed.' }
  }
  for (const re of BLOCKED) {
    if (re.test(text)) {
      return { ok: false, code: 'COMMAND_REJECTED', message: 'That command is blocked by policy.' }
    }
  }
  const parts = text.split(/\s+/).filter(Boolean)
  return { ok: true, parts, text }
}

/**
 * Browser never supplies this. The OpenAI coding loop / worker may request a command;
 * the backend still validates it. Production never allows yolo.
 */
export function assertAllowedCommand(input, { production = process.env.NODE_ENV === 'production' } = {}) {
  const parsed = parseCommand(input)
  if (!parsed.ok) return parsed
  const [bin, ...rest] = parsed.parts
  if (bin === 'npm' || bin === 'npm.cmd') {
    const sub = rest[0]
    if (!ALLOWED_NPM.has(sub)) {
      return { ok: false, code: 'COMMAND_REJECTED', message: `npm ${sub || ''} is not allowed.` }
    }
    if (sub === 'run') {
      const script = rest[1]
      if (!ALLOWED_SCRIPTS.has(script)) {
        return { ok: false, code: 'COMMAND_REJECTED', message: `npm run ${script || ''} is not allowed.` }
      }
    }
    return { ok: true, argv: parsed.parts, command: parsed.text }
  }
  if (bin === 'npx' && rest[0] === 'vite') {
    if (production) {
      return { ok: false, code: 'COMMAND_REJECTED', message: 'Host Vite preview is not allowed in production.' }
    }
    return { ok: true, argv: parsed.parts, command: parsed.text }
  }
  return { ok: false, code: 'COMMAND_REJECTED', message: `Binary "${bin}" is not on the allowlist.` }
}

export function approvalModeForEnv() {
  if (process.env.NODE_ENV === 'production') return 'ask'
  const raw = String(process.env.AI_COMMAND_APPROVAL || 'ask').toLowerCase()
  if (raw === 'yolo') return 'ask'
  if (raw === 'auto' || raw === 'ask') return raw
  return 'ask'
}
