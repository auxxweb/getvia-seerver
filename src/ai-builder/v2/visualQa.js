import { completeJson } from '../openai/structuredOutput.js'
import { shouldSkipOpenAiLlm } from '../openai/availability.js'
import { resolveVisionModel } from '../openai/modelRouter.js'

export function visualQa({ browser, structural, spec, vision } = {}) {
  const issues = [
    ...(structural?.issues || []).filter((i) => i.severity === 'high' || i.severity === 'medium'),
    ...(browser?.issues || []),
    ...(vision?.issues || []),
  ]
  if (spec?.look === 'glassmorphism' && !/glass/.test(JSON.stringify(spec))) {
    issues.push({
      severity: 'medium',
      type: 'design',
      description: 'Glassmorphism was requested but tokens do not mention glass.',
      target: 'src/design-system/tokens.js',
    })
  }
  if (browser?.status === 'skipped') {
    return {
      approved: true,
      status: 'skipped',
      issues: [],
      screenshots: browser.screenshots || [],
      vision: { skipped: true },
      message: 'Visual QA skipped so the isolated preview can load immediately.',
    }
  }
  if (browser?.status === 'unavailable') {
    return {
      approved: false,
      status: 'unavailable',
      issues,
      message: browser.message || 'Visual QA unavailable without Playwright screenshots.',
    }
  }
  const high = issues.filter((i) => i.severity === 'high')
  const approved = Boolean(browser?.approved) && high.length === 0
  return {
    approved,
    status: approved ? 'passed' : 'failed',
    issues,
    screenshots: browser?.screenshots || [],
    vision: vision || { skipped: true },
    message: approved ? 'Visual QA passed.' : issues[0]?.description || 'Visual QA found issues.',
  }
}

export function visualRepairPrompt(issues, originalPrompt) {
  const lines = (issues || [])
    .filter((i) => i.severity === 'high' || i.severity === 'medium')
    .slice(0, 8)
    .map((i) => `- [${i.viewport || 'all'}] ${i.description}${i.target ? ` (${i.target})` : ''}`)
  return [
    'VISUAL REPAIR. Keep existing content. Fix only these layout/visual issues:',
    ...lines,
    `User request was: ${String(originalPrompt || '').slice(0, 500)}`,
    'Prefer CSS/layout changes in src/index.css and src/App.jsx. Do not regenerate the whole site.',
  ].join('\n')
}

export async function visionInspect({ screenshot, spec } = {}) {
  if (!screenshot?.length) {
    return { skipped: true, status: 'skipped', issues: [], message: 'No screenshot for vision analysis.' }
  }
  if (shouldSkipOpenAiLlm()) {
    return { skipped: true, status: 'skipped', issues: [], message: 'Vision model skipped; Playwright findings still apply.' }
  }
  const image = `data:image/png;base64,${Buffer.from(screenshot).toString('base64')}`
  const result = await completeJson({
    tier: 'medium',
    model: resolveVisionModel(),
    images: [image],
    schemaName: 'visual_qa',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        issues: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              severity: { type: 'string' },
              description: { type: 'string' },
              target: { type: 'string' },
            },
          },
        },
      },
    },
    system:
      'You are a visual QA reviewer for a React website. Return JSON {status:"PASS"|"FAIL", issues:[{severity,description,target}]}. Check spacing, alignment, overflow, typography, contrast, broken layout, missing images, mobile responsiveness. Do not invent issues you cannot see.',
    user: JSON.stringify({
      look: spec?.look || null,
      screenshotBytes: screenshot.length,
      note: 'A Playwright screenshot was captured. Prefer FAIL only for high-severity layout problems.',
    }),
    soft: true,
  })
  if (!result.ok || result.skipped) {
    return { skipped: true, status: 'skipped', issues: [], message: result.error || 'Vision model unavailable.' }
  }
  const issues = Array.isArray(result.data?.issues) ? result.data.issues : []
  return {
    skipped: false,
    status: String(result.data?.status || (issues.length ? 'FAIL' : 'PASS')).toUpperCase(),
    issues: issues.map((issue) => ({
      severity: issue.severity === 'high' ? 'high' : 'medium',
      type: 'vision',
      description: String(issue.description || '').slice(0, 240),
      target: issue.target || 'src/App.jsx',
    })),
    message: issues.length ? 'Vision model reported visual issues.' : 'Vision model reported no high-severity issues.',
  }
}
