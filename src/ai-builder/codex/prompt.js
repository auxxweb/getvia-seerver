import { buildCodingSystemPrompt } from '../getvia/masterAgentPrompt.js'

export function buildCodexDeveloperPrompt({
  prompt,
  brief,
  learningBrief = '',
  allowedFiles = null,
  scoped = false,
  profile,
  inspect,
} = {}) {
  const system = buildCodingSystemPrompt({ scoped })
  const files = Array.isArray(allowedFiles) && allowedFiles.length ? allowedFiles.join(', ') : ''
  const briefLimit = scoped ? 800 : 2400
  const promptLimit = scoped ? 2500 : 5000
  return [
    system,
    scoped
      ? 'Inspect the targeted files first. Change only the allowlisted section. Keep GetVia data bindings. Do not rewrite unrelated sections.'
      : 'You are the autonomous website developer for this isolated React + Vite workspace. Inspect, implement, then build if needed. Success is a working website, not merely writing files.',
    'Never invent business facts. Use src/data/business.json, src/data/getvia.json, and AGENTS.md.',
    'Never write secrets or files outside this workspace. Never modify GetVia core (API, admin, auth, database).',
    'Do not call /api/owner, /api/admin, or /api/auth. Business features use public APIs in src/data/getvia-public-api.json.',
    files
      ? `SCOPED FILE ALLOWLIST: write only ${files}. You may read other files.`
      : 'You may update section components, CSS, and design-system files as needed. Keep GetVia data bindings.',
    profile?.identity?.name ? `Business: ${profile.identity.name}.` : '',
    inspect?.homepage ? `Homepage file: ${inspect.homepage}.` : '',
    learningBrief ? String(learningBrief).slice(0, scoped ? 900 : 1600) : '',
    brief ? String(brief).slice(0, briefLimit) : '',
    `USER REQUEST:\n${String(prompt || '').slice(0, promptLimit)}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}
