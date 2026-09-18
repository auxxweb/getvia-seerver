function blobOf({ prompt, style, category } = {}) {
  return `${prompt || ''} ${style || ''} ${category || ''}`.toLowerCase()
}

export function localDesignPractices({ prompt, style, category } = {}) {
  const blob = blobOf({ prompt, style, category })
  const practices = [
    {
      id: 'native-first',
      title: 'React + CSS first',
      advice:
        'Compose in src/App.jsx with semantic JSX and design tokens in src/index.css. Load an external CSS/JS library only when it provides a capability React and CSS cannot do well.',
      source: 'practice',
    },
    {
      id: 'a11y-motion',
      title: 'Accessible motion',
      advice:
        'Visible focus rings, keyboard menus via details/summary, contrast on cream/gold, and @media (prefers-reduced-motion: reduce).',
      source: 'practice',
    },
    {
      id: 'cdn-fallback',
      title: 'CDN fallback',
      advice:
        'The site must remain readable if a font or script CDN fails. Never put essential booking or nav behind a third-party script.',
      source: 'practice',
    },
  ]

  if (/fashion|clothing|apparel|boutique|lookbook|gossip|editorial/.test(blob)) {
    practices.push({
      id: 'editorial-fashion',
      title: 'Editorial fashion layout',
      advice:
        'Serif display + modern sans, full-bleed or split hero, asymmetric product tiles, lookbook crop, hairline nav, colophon footer. Original composition — not a theme pack.',
      source: 'practice',
    })
  }
  if (/luxury|elegant|premium|quiet/.test(blob)) {
    practices.push({
      id: 'quiet-luxury',
      title: 'Quiet luxury spacing',
      advice: 'Vast margins, restrained CTAs, one accent, thin rules. Avoid noisy cards and stock UI kits.',
      source: 'practice',
    })
  }
  if (/technolog|saas|software|startup|product/.test(blob)) {
    practices.push({
      id: 'product-ui-type',
      title: 'Product typography',
      advice: 'Geometric sans headings, high-readability body, tight product grids, clear form labels.',
      source: 'practice',
    })
  }
  if (/ultra-modern|asymmetric|experimental/.test(blob)) {
    practices.push({
      id: 'asymmetric-modern',
      title: 'Asymmetric contemporary layout',
      advice: 'Broken columns, mixed media scale, display sans for headlines only. Keep body copy in a readable face.',
      source: 'practice',
    })
  }

  return practices
}

export function researchQueries({ prompt, style, category } = {}) {
  const visual = String(style || '').trim() || 'contemporary'
  const biz = String(category || '').trim() || guessCategory(prompt)
  const brief = String(prompt || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return [
    `${biz} ${visual} website typography layout design`,
    `${visual} landing page navigation hero footer accessibility CSS`,
    brief ? `${brief} web design patterns` : `${biz} one page marketing site design`,
  ].filter((q, i, all) => q && all.indexOf(q) === i)
}

function guessCategory(prompt) {
  const blob = String(prompt || '').toLowerCase()
  if (/fashion|clothing|apparel|boutique/.test(blob)) return 'fashion'
  if (/salon|spa|beauty/.test(blob)) return 'salon'
  if (/restaurant|cafe|food/.test(blob)) return 'restaurant'
  if (/technolog|saas|software/.test(blob)) return 'technology'
  return 'brand'
}
