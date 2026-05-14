/**
 * Server-side copy of frontend/src/config/templateThemes.js — keep in sync.
 */

import { SEMANTIC_KEYS, SEMANTIC_SLOT_LABELS, categoryForSemanticKey } from './gvSemanticMeta.js'
import { SEMANTIC_PALETTES_BY_TEMPLATE } from './templatePalettes.js'

function buildTemplate(id, label) {
  const palette = SEMANTIC_PALETTES_BY_TEMPLATE[id]
  return {
    id,
    label,
    editableColors: SEMANTIC_KEYS.map((key) => ({
      key,
      label: SEMANTIC_SLOT_LABELS[key] || key,
      default: (palette && palette[key]) || '#FFFFFF',
      category: categoryForSemanticKey(key),
    })),
  }
}

export const TEMPLATE_THEMES = {
  'template-one': buildTemplate('template-one', 'Template One'),
  'template-two': buildTemplate('template-two', 'Template Two'),
  'template-three': buildTemplate('template-three', 'Template Three'),
  'template-four': buildTemplate('template-four', 'Template Four'),
  'template-five': buildTemplate('template-five', 'Template Five'),
  'template-six': buildTemplate('template-six', 'Template Six'),
  'template-seven': buildTemplate('template-seven', 'Template Seven'),
  'template-eight': buildTemplate('template-eight', 'Template Eight'),
  'template-nine': buildTemplate('template-nine', 'Template Nine'),
  'template-ten': buildTemplate('template-ten', 'Template Ten'),
  'template-eleven': buildTemplate('template-eleven', 'Template Eleven'),
  'template-twelve': buildTemplate('template-twelve', 'Template Twelve'),
}

export const DEFAULT_TEMPLATE_ID = 'template-one'

export function getTemplateThemeDefinition(templateId) {
  return TEMPLATE_THEMES[templateId] || TEMPLATE_THEMES[DEFAULT_TEMPLATE_ID]
}
