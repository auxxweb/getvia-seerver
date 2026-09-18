export function buildRecommendations({ profile, validation, websiteState }) {
  const items = []
  const missing = profile?.missing || []
  const map = {
    logo: {
      message: 'Add your business logo so customers recognize you.',
      prompt: 'Add my business logo to the header',
    },
    description: {
      message: 'Add a short description of what you offer.',
      prompt: 'Rewrite the about section from my business description',
    },
    gallery: {
      message: 'Add gallery photos so the page feels complete on mobile.',
      prompt: 'Add a photo gallery section',
    },
    whatsapp: {
      message: 'Add WhatsApp so visitors can message you in one tap.',
      prompt: 'Add a WhatsApp button in the hero',
    },
    openingHours: {
      message: 'Add opening hours so people know when to visit.',
      prompt: 'Add an opening hours section',
    },
    landingBannerImage: {
      message: 'Choose a hero photo from your gallery.',
      prompt: 'Use a gallery photo as the hero image',
    },
    coreServices: {
      message: 'Add at least one service you already provide.',
      prompt: 'Add a services section from my listing',
    },
  }
  for (const key of missing) {
    if (map[key]) items.push({ id: key, type: 'missing', ...map[key], approvalRequired: true })
  }
  if (!websiteState?.seo?.description) {
    items.push({
      id: 'seo',
      type: 'seo',
      message: 'Add a search description so Google can show your listing.',
      prompt: 'Write an SEO description from my business details',
      approvalRequired: true,
    })
  }
  if (websiteState?.functionality && !websiteState.functionality.whatsapp && missing.includes('whatsapp')) {
    items.push({
      id: 'whatsapp-cta',
      type: 'cta',
      message: 'A WhatsApp button is hidden until a number is on your profile.',
      prompt: 'Add a WhatsApp button once my number is on the listing',
      approvalRequired: true,
    })
  }
  for (const err of validation?.errors || []) {
    if (err.type === 'LOW_CONTRAST') {
      items.push({
        id: 'contrast',
        type: 'mobile',
        message: 'Some text may be hard to read. Ask AI to fix the colours.',
        prompt: 'Fix text colour contrast so headings are easy to read',
        approvalRequired: true,
      })
    }
  }
  const unique = []
  const seen = new Set()
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    unique.push(item)
  }
  return unique.slice(0, 8)
}
