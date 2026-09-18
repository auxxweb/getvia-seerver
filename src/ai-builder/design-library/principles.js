/** Design principles the agent must apply (universal, industry-agnostic). */

export const DESIGN_PRINCIPLES = Object.freeze([
  { id: 'hierarchy', title: 'Visual hierarchy', rule: 'Most important content must dominate size, contrast, and position.' },
  { id: 'whitespace', title: 'Whitespace', rule: 'Use deliberate empty space; avoid cramped card stacks.' },
  { id: 'contrast', title: 'Contrast', rule: 'Text and CTAs must meet accessible contrast against surfaces.' },
  { id: 'alignment', title: 'Alignment', rule: 'Share a clear grid and edge rhythm across sections.' },
  { id: 'proximity', title: 'Proximity', rule: 'Group related items; separate unrelated blocks.' },
  { id: 'consistency', title: 'Consistency', rule: 'One type system, one radius language, one button language.' },
  { id: 'rhythm', title: 'Vertical rhythm', rule: 'Section padding follows a spacing scale, not random gaps.' },
  { id: 'variety', title: 'Visual variety', rule: 'Do not repeat the same 3-card layout in consecutive sections.' },
  { id: 'originality', title: 'Anti-template', rule: 'Avoid generic AI purple gradients, cream+terracotta defaults, and identical hero cards.' },
  { id: 'industry_fit', title: 'Industry fit', rule: 'Direction and variants must feel native to the business category.' },
  { id: 'authenticity', title: 'Authenticity', rule: 'Prefer real GetVia photos and facts; never invent claims.' },
  { id: 'imagery_first', title: 'Imagery first', rule: 'When strong photos exist, let media lead composition.' },
  { id: 'typography_as_hero', title: 'Typography as hero', rule: 'When imagery is weak, lead with expressive type and layout.' },
  { id: 'negative_space', title: 'Negative space', rule: 'Luxury and premium looks need restraint, not decoration noise.' },
  { id: 'conversion_path', title: 'Conversion path', rule: 'Primary CTA must be obvious above the fold and after key sections.' },
  { id: 'mobile_first', title: 'Mobile first', rule: 'Design stacking, tap targets, and type for phones first.' },
  { id: 'accessibility', title: 'Accessibility', rule: 'Semantic headings, focus states, labels, reduced motion.' },
  { id: 'performance', title: 'Performance', rule: 'Avoid heavy animation libraries and oversized decorative assets.' },
  { id: 'trust', title: 'Trust', rule: 'Surface contact, location, hours, and reviews where they build confidence.' },
  { id: 'scannable_menu', title: 'Scannable content', rule: 'Long lists become structured rows/cards with clear labels.' },
  { id: 'scannable_services', title: 'Scannable services', rule: 'Services must be skimmable in under 5 seconds.' },
  { id: 'scannable_listings', title: 'Scannable listings', rule: 'Catalogue items need clear name, image, and action.' },
  { id: 'warmth', title: 'Warmth', rule: 'Hospitality and beauty benefit from soft radius and human imagery.' },
  { id: 'energy', title: 'Energy', rule: 'Fitness and sport can use bold type and dynamic asymmetry.' },
  { id: 'atmosphere', title: 'Atmosphere', rule: 'Travel and hotels sell mood — full-bleed media and quiet type.' },
  { id: 'clarity', title: 'Clarity', rule: 'Professional and medical sites prioritize clear IA over decoration.' },
  { id: 'bold_hierarchy', title: 'Bold hierarchy', rule: 'Trade and auto sites can use strong display type and hard edges.' },
  { id: 'appetite_imagery', title: 'Appetite imagery', rule: 'Food sites prioritize dish photography and readable menus.' },
  { id: 'local_trust', title: 'Local trust', rule: 'Show map, hours, and WhatsApp/call early for local businesses.' },
  { id: 'brand_first', title: 'Brand first', rule: 'Business name is a hero-level signal, not only nav text.' },
])

export function principlesForIds(ids = []) {
  const set = new Set(ids)
  const picked = DESIGN_PRINCIPLES.filter((p) => set.has(p.id))
  return picked.length ? picked : DESIGN_PRINCIPLES.filter((p) => ['hierarchy', 'variety', 'industry_fit', 'authenticity', 'mobile_first'].includes(p.id))
}

export function formatPrinciplesBrief(principles) {
  return [
    'DESIGN PRINCIPLES (apply all):',
    ...principles.map((p) => `- ${p.title}: ${p.rule}`),
  ].join('\n')
}
