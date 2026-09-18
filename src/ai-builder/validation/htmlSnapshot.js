function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const PLAYWRIGHT_VIEWPORTS = [390, 768, 1280]

export function websiteStateToHtml(state = {}) {
  const landing = state.content?.landing || {}
  const colors = state.theme?.colors || {}
  const name = state.settings?.businessName || landing.bannerTitle || 'Website'
  const order = Array.isArray(state.sectionOrder) && state.sectionOrder.length ? state.sectionOrder : ['hero', 'contact', 'footer']
  const vis = state.sectionVisibility || {}
  const heroSection = (state.pages?.[0]?.sections || []).find((row) => row.id === 'hero' || row.type === 'hero')
  const fromComps = (heroSection?.components || []).filter((row) => row.type === 'button').map((row) => row.props || {})
  const extraButtons = Array.isArray(landing.extraButtons) ? landing.extraButtons : []
  const heroButtons = fromComps.length
    ? fromComps
    : [{ text: landing.bannerCtaLabel || 'Get in touch', href: landing.bannerCtaLink || '#contact' }, ...extraButtons]
  const parts = order
    .filter((id) => vis[id] !== false)
    .map((id) => {
      if (id === 'hero') {
        const buttons = heroButtons
          .map((btn) => `<a data-component-type="button" href="${esc(btn.href || '#contact')}">${esc(btn.text || 'Get in touch')}</a>`)
          .join('')
        return `<section id="hero"><h1>${esc(landing.bannerTitle || name)}</h1><p>${esc(landing.bannerDescription || '')}</p>${buttons}</section>`
      }
      if (id === 'about') {
        return `<section id="about"><h2>${esc(landing.welcomeTitle || `About ${name}`)}</h2><p>${esc(landing.welcomeDescription || '')}</p></section>`
      }
      if (id === 'footer') {
        return `<footer id="footer">© ${esc(name)}</footer>`
      }
      return `<section id="${esc(id)}"><h2>${esc(id)}</h2></section>`
    })
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(state.seo?.title || name)}</title>
  <style>
    * { box-sizing: border-box; overflow-wrap: anywhere; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: ${esc(colors.background || '#FFFFFF')}; color: ${esc(colors.text || '#111111')}; }
    section, header, footer { width: 100%; max-width: 72rem; margin: 0 auto; padding: 2rem 1rem; }
    img { max-width: 100%; height: auto; }
    a, button { display: inline-block; max-width: 100%; }
  </style>
</head>
<body>
${parts.join('\n')}
</body>
</html>`
}
