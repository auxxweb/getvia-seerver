import { applyAiTheme, inferAiTypography, resolveAiThemePreset } from '../theme/aiTheme.js'
import { lookStylePatch, resolveVisualLook } from '../theme/visualLook.js'

export function designAgent({ plan, state, requirements }) {
  const look =
    (requirements?.changes || []).find((c) => c.property === 'look')?.value ||
    resolveVisualLook(JSON.stringify(requirements || {})) ||
    resolveVisualLook(plan?.themePreset)
  const operations = [
    {
      type: 'PAGE_PLAN_CHANGE',
      target: { site: true },
      changes: {
        engine: 'ai',
        layout: 'one-page',
        templateId: null,
        sections: plan?.sections || [],
        sectionOrder: (plan?.sections || []).map((s) => s.id || s.type).filter(Boolean),
        typography: plan?.typography || inferAiTypography(plan?.themePreset),
      },
    },
  ]

  const presetName =
    look ||
    plan?.themePreset ||
    (requirements?.changes || []).find((c) => c.property === 'primaryPalette')?.value ||
    (requirements?.changes || []).find((c) => c.property === 'style')?.value ||
    'original'
  const preset = resolveAiThemePreset(presetName) || resolveAiThemePreset('original')
  const colors = applyAiTheme({}, preset || {})
  operations.push({
    type: 'THEME_CHANGE',
    target: { site: true },
    changes: { preset: presetName || 'original', look: look || (presetName === 'original' ? 'original' : undefined), colors },
  })

  const styleChanges = (requirements?.changes || []).filter((c) => c.target === 'style' || c.target === 'theme')
  const stylePatch = lookStylePatch(look || 'original')
  for (const c of styleChanges) {
    if (c.property === 'alignment') stylePatch.alignment = c.value
    if (c.property === 'radius') stylePatch.radius = { card: c.value }
    if (c.property === 'headingScale') stylePatch.headingScale = c.value
    if (c.property === 'look' || c.property === 'visualStyle') stylePatch.visualStyle = c.value
  }
  if (Object.keys(stylePatch).length) {
    operations.push({ type: 'STYLE_CHANGE', target: { site: true }, changes: stylePatch })
  }
  return { operations }
}
