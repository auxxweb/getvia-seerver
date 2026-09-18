/** Category-level layout principles. Never copy another tenant's website. */

const PATTERNS = [
  {
    id: 'salon',
    match: /salon|beauty|spa|bridal|makeup|hair|nail/i,
    preferredTemplates: ['template-six', 'template-four', 'template-one'],
    emphasize: ['gallery', 'core-services', 'testimonials'],
    ctas: ['whatsapp', 'call'],
    structuredDataType: 'BeautySalon',
  },
  {
    id: 'restaurant',
    match: /restaurant|cafe|café|bakery|food|hotel|dining|cloud kitchen/i,
    preferredTemplates: ['template-seven', 'template-fourteen', 'template-two'],
    emphasize: ['catalogue', 'offers', 'hours', 'map'],
    ctas: ['call', 'whatsapp', 'directions'],
    structuredDataType: 'Restaurant',
  },
  {
    id: 'clinic',
    match: /clinic|hospital|doctor|dental|medical|health/i,
    preferredTemplates: ['template-nine', 'template-ten', 'template-three'],
    emphasize: ['core-services', 'contact', 'hours'],
    ctas: ['call', 'enquiry'],
    structuredDataType: 'MedicalBusiness',
  },
  {
    id: 'realestate',
    match: /real estate|property|homes|housing/i,
    preferredTemplates: ['template-thirteen', 'template-five', 'template-one'],
    emphasize: ['gallery', 'catalogue', 'map'],
    ctas: ['call', 'whatsapp', 'enquiry'],
    structuredDataType: 'RealEstateAgent',
  },
  {
    id: 'retail',
    match: /boutique|store|shop|fashion|apparel/i,
    preferredTemplates: ['template-two', 'template-four', 'template-one'],
    emphasize: ['catalogue', 'offers', 'gallery'],
    ctas: ['whatsapp', 'directions'],
    structuredDataType: 'Store',
  },
  {
    id: 'travel',
    match: /travel|tour|holiday|destination/i,
    preferredTemplates: ['template-thirteen', 'template-fifteen', 'template-five'],
    emphasize: ['gallery', 'core-services', 'catalogue'],
    ctas: ['whatsapp', 'enquiry'],
    structuredDataType: 'TravelAgency',
  },
  {
    id: 'services',
    match: /.*/,
    preferredTemplates: ['template-eleven', 'template-twelve', 'template-one'],
    emphasize: ['core-services', 'contact', 'testimonials'],
    ctas: ['whatsapp', 'call', 'enquiry'],
    structuredDataType: 'LocalBusiness',
  },
]

export function categoryPatternFor(category = '', subcategory = '') {
  const hay = `${category} ${subcategory}`
  return PATTERNS.find((p) => p.match.test(hay)) || PATTERNS[PATTERNS.length - 1]
}

export function structuredDataTypeForCategory(category = '', subcategory = '') {
  return categoryPatternFor(category, subcategory).structuredDataType
}

export function pickTemplateForCategory(category, subcategory, allowedTemplateIds, currentTemplateId) {
  const pattern = categoryPatternFor(category, subcategory)
  const allowed = Array.isArray(allowedTemplateIds) && allowedTemplateIds.length ? allowedTemplateIds : []
  if (currentTemplateId && allowed.includes(currentTemplateId)) return currentTemplateId
  for (const id of pattern.preferredTemplates) {
    if (allowed.includes(id)) return id
  }
  return allowed[0] || currentTemplateId || 'template-one'
}
