import { ALL_TEMPLATE_IDS } from '../../constants/planEntitlements.js'
import { GETVIA_SECTION_IDS } from '../constants.js'
import { SEMANTIC_KEYS } from '../../config/gvSemanticMeta.js'

const EDITABLE_CONTENT = [
  'description',
  'landing.bannerTitle',
  'landing.bannerDescription',
  'landing.bannerImageUrl',
  'landing.welcomeTitle',
  'landing.welcomeDescription',
  'landing.welcomeImageUrl',
  'offers.title',
  'offers.items',
  'coreServices.title',
  'coreServices.items',
  'catalogue.title',
  'catalogue.items',
  'gallery',
  'feed.items',
]

const FUNCTIONS = ['call', 'whatsapp', 'enquiry', 'email', 'directions', 'social']

const LABELS = {
  'template-one': 'Classic listing',
  'template-two': 'Editorial',
  'template-three': 'Split hero',
  'template-four': 'Brand bar',
  'template-five': 'Stats hero',
  'template-six': 'Warm dual image',
  'template-seven': 'Restaurant',
  'template-eight': 'Glass / auto',
  'template-nine': 'Clinic',
  'template-ten': 'Specialist',
  'template-eleven': 'Home services',
  'template-twelve': 'Hybrid services',
  'template-thirteen': 'Travel',
  'template-fourteen': 'Café',
  'template-fifteen': 'Tours',
}

export function getTemplateCapability(templateId) {
  const id = ALL_TEMPLATE_IDS.includes(templateId) ? templateId : 'template-one'
  return {
    templateId: id,
    label: LABELS[id] || id,
    supportedSections: [...GETVIA_SECTION_IDS],
    supportedComponents: ['heading', 'text', 'image', 'button', 'card', 'gallery', 'form', 'map'],
    editableContent: [...EDITABLE_CONTENT],
    editableThemeKeys: [...SEMANTIC_KEYS],
    functions: [...FUNCTIONS],
    designCapabilities: ['semanticTokens', 'sectionVisibility', 'sectionOrder'],
    responsiveCapabilities: ['fluidLayout', 'mobileNav', 'responsiveImages'],
  }
}

export function getAllTemplateCapabilities(allowedTemplateIds) {
  const ids =
    Array.isArray(allowedTemplateIds) && allowedTemplateIds.length
      ? allowedTemplateIds.filter((id) => ALL_TEMPLATE_IDS.includes(id))
      : [...ALL_TEMPLATE_IDS]
  return ids.map(getTemplateCapability)
}

export function isSupportedSection(sectionType) {
  return GETVIA_SECTION_IDS.includes(sectionType)
}

export function isSupportedTemplate(templateId) {
  return ALL_TEMPLATE_IDS.includes(templateId)
}
