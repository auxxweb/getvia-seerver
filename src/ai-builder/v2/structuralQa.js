const LOREM = /lorem ipsum|dolor sit amet|consectetur adipiscing/i

export function structuralQa(business, { prompt } = {}) {
  const issues = []
  if (!business || typeof business !== 'object') {
    return { approved: false, issues: [{ severity: 'high', type: 'data', description: 'business.json is missing.' }] }
  }
  const blob = JSON.stringify(business)
  if (LOREM.test(blob)) {
    issues.push({ severity: 'high', type: 'content', description: 'Placeholder lorem ipsum copy is present.' })
  }
  if (!business.name) {
    issues.push({ severity: 'high', type: 'content', description: 'Business name is missing.' })
  }
  const buttons = [
    business.hero?.primaryCta,
    ...(business.hero?.extraButtons || []),
    business.cta,
  ].filter(Boolean)
  for (const btn of buttons) {
    const href = btn.href || btn.whatsapp || (btn.phone ? `tel:${btn.phone}` : '')
    if (btn.label && !href) {
      issues.push({ severity: 'high', type: 'link', description: `Button "${btn.label}" has no destination.` })
    }
    if (href === '#') {
      issues.push({ severity: 'medium', type: 'link', description: `Button "${btn.label}" uses a dead # href.` })
    }
  }
  const sections = business.sections || []
  if (!sections.includes('hero')) {
    issues.push({ severity: 'high', type: 'layout', description: 'Hero section is missing.' })
  }
  if (!sections.includes('contact') && !sections.includes('footer')) {
    issues.push({ severity: 'medium', type: 'layout', description: 'Contact/footer is missing.' })
  }
  if (/pricing/i.test(String(prompt || '')) && !sections.includes('pricing') && !sections.includes('offers')) {
    issues.push({ severity: 'high', type: 'feature', description: 'Pricing was requested but no pricing/offers section exists.' })
  }
  if (/whatsapp/i.test(String(prompt || '')) && !business.whatsapp && !buttons.some((b) => /whatsapp/i.test(b.label || '') || /wa\.me/i.test(b.href || ''))) {
    issues.push({ severity: 'high', type: 'feature', description: 'WhatsApp was requested but no WhatsApp action exists.' })
  }
  const approved = !issues.some((i) => i.severity === 'high')
  return { approved, issues }
}

export function accessibilityQa(business) {
  const issues = []
  if (!business?.hero?.title) issues.push({ severity: 'medium', type: 'a11y', description: 'Hero has no heading text.' })
  const gallery = business?.gallery || []
  if (gallery.some((img) => typeof img === 'object' && !img.alt && !img.src)) {
    issues.push({ severity: 'medium', type: 'a11y', description: 'A gallery image is missing src/alt.' })
  }
  return { approved: !issues.some((i) => i.severity === 'high'), issues }
}

export function seoQa(business) {
  const issues = []
  if (!business?.name) issues.push({ severity: 'high', type: 'seo', description: 'Document title/business name missing.' })
  if (!business?.about?.body && !business?.hero?.subtitle) {
    issues.push({ severity: 'medium', type: 'seo', description: 'No description copy for meta description.' })
  }
  return { approved: !issues.some((i) => i.severity === 'high'), issues }
}
