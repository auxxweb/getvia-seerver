export function tokensSource(spec) {
  const c = spec.colorStrategy || {}
  const t = spec.typographyHierarchy || {}
  return `export const direction = ${JSON.stringify(spec.direction)}
export const tokens = {
  background: ${JSON.stringify(c.background || '#ffffff')},
  surface: ${JSON.stringify(c.surface || '#ffffff')},
  heading: ${JSON.stringify(c.heading || '#111111')},
  text: ${JSON.stringify(c.text || '#1f1f1f')},
  accent: ${JSON.stringify(c.accent || '#111111')},
  accentText: ${JSON.stringify(c.accentText || '#ffffff')},
  heroBg: ${JSON.stringify(c.heroBg || c.background || '#111111')},
  heroFg: ${JSON.stringify(c.heroFg || '#ffffff')},
  fontHeading: ${JSON.stringify(t.heading || 'Georgia, serif')},
  fontBody: ${JSON.stringify(t.body || 'Georgia, serif')},
  nav: ${JSON.stringify(spec.navigationStrategy)},
  hero: ${JSON.stringify(spec.heroComposition)},
  grid: ${JSON.stringify(spec.gridStrategy)},
  cards: ${JSON.stringify(spec.cardStrategy)},
  cta: ${JSON.stringify(spec.ctaPlacement)},
  footer: ${JSON.stringify(spec.footerStrategy)},
}
export default tokens
`
}

export function cssForSpec(spec) {
  const c = spec.colorStrategy || {}
  const t = spec.typographyHierarchy || {}
  const look = spec.direction || 'editorial'
  return `:root {
  --background: ${c.background || '#fff'};
  --surface: ${c.surface || '#fff'};
  --heading: ${c.heading || '#111'};
  --text: ${c.text || '#222'};
  --accent: ${c.accent || '#111'};
  --accentText: ${c.accentText || '#fff'};
  --heroBg: ${c.heroBg || '#111'};
  --heroFg: ${c.heroFg || '#fff'};
  --font-heading: ${t.heading || 'Georgia, serif'};
  --font-body: ${t.body || 'Georgia, serif'};
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: var(--font-body);
  background: var(--background);
  color: var(--text);
}
h1, h2, h3 { font-family: var(--font-heading); color: var(--heading); }
.site { min-height: 100vh; }
.look-${look} { --look: '${look}'; }
.nav.top-ruled, .nav.hairline-top, .nav.issue-masthead, .nav.pill-header, .nav.tiny-wordmark, .nav.overlay-on-media {
  display: flex; justify-content: space-between; align-items: center; padding: 1rem 6vw;
}
.nav.left-rail { position: sticky; top: 0; width: 220px; float: left; min-height: 100vh; padding: 2rem 1rem; }
.nav.cell-nav { display: grid; grid-template-columns: repeat(6, 1fr); gap: 2px; }
.nav.hidden-until-hover { position: fixed; top: 0; left: 0; right: 0; opacity: .15; }
.nav.hidden-until-hover:hover { opacity: 1; }
.nav-toggle { display: none; }
@media (max-width: 768px) {
  .nav-desktop { display: none; }
  .nav-toggle { display: block; }
  .nav.left-rail { float: none; width: auto; min-height: 0; }
}
.hero.typographic-column { padding: 18vh 12vw; max-width: 18ch; }
.hero.full-bleed-photo { min-height: 100vh; display: grid; place-items: end start; padding: 8vh 6vw; background: var(--heroBg); color: var(--heroFg); }
.hero.centered-void { min-height: 88vh; display: grid; place-items: center; text-align: center; padding: 10vh 8vw; }
.hero.offset-split { display: grid; grid-template-columns: 1.4fr .8fr; min-height: 80vh; padding: 8vh 4vw; }
.hero.headline-deck-spread { padding: 4vh 5vw; display: grid; grid-template-columns: 2fr 1fr; gap: 2rem; background: var(--heroBg); color: var(--heroFg); }
.hero.viewport-stage { min-height: 100vh; display: grid; place-items: center; background: var(--heroBg); color: var(--heroFg); }
.hero.bento-hero { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; min-height: 70vh; padding: 12px; }
.hero.soft-split-portrait { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; padding: 10vh 8vw; }
.hero.one-line-hero { padding: 30vh 8vw 10vh; }
.hero h1 { font-size: clamp(2.2rem, 7vw, 6rem); line-height: .95; margin: 0 0 1rem; color: inherit; }
.actions { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1.5rem; }
.cta-band { padding: 4rem 6vw; background: var(--accent); color: var(--accentText); text-align: center; }
.btn, .btn.primary {
  display: inline-flex; align-items: center; justify-content: center;
  padding: .85rem 1.3rem; background: var(--accent); color: var(--accentText); text-decoration: none;
}
.look-neo-minimal .btn, .look-editorial .btn { background: transparent; color: inherit; border-bottom: 1px solid currentColor; padding: .4rem 0; }
.look-immersive .btn { border-radius: 999px; box-shadow: 0 0 24px color-mix(in srgb, var(--accent) 50%, transparent); }
.look-soft-luxury .btn { border-radius: 999px; }
.section { padding: 8vh 6vw; }
.grid.mosaic, .grid.bento-12, .grid.magazine-modules { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
.grid.two-column-wide-margins { display: grid; grid-template-columns: 1fr 1fr; gap: 4rem; max-width: 960px; margin: 0 auto; }
.grid.broken-columns { display: grid; grid-template-columns: 1.2fr .8fr; gap: 2rem; }
.grid.single-track { display: flex; flex-direction: column; gap: 0; max-width: 40rem; }
.card.ruled-text-first, .card.article-deck { border-top: 1px solid var(--heading); padding: 1.2rem 0; }
.card.photo-tile, .card.scene-panels { min-height: 220px; background: var(--surface); }
.card.rounded-shadow { border-radius: 1.5rem; box-shadow: 0 20px 40px rgba(80,40,20,.08); padding: 1.5rem; background: var(--surface); }
.card.list-rows { border-bottom: 1px solid #eee; padding: .8rem 0; }
.card.bento-cells { border: 1px solid #ddd; padding: 1rem; }
.footer.colophon, .footer.thin-centered, .footer.one-line { padding: 2rem 6vw; text-align: center; }
.footer.index-columns, .footer.split-asymmetric { display: grid; grid-template-columns: 1fr 1fr; padding: 4rem 6vw; }
.footer.end-credits, .footer.dark-minimal { padding: 6rem 6vw; background: #000; color: #fff; }
.site.loading { min-height: 100vh; display: grid; place-items: center; }
.placeholder[data-placeholder] { opacity: .55; }
img { max-width: 100%; height: auto; }
`
}

export function designAwareAppSource() {
  return `import business from './data/business.json'
import design from './data/design.json'

function hrefFor(action = {}) {
  if (action.href) return action.href
  if (action.phone) return 'tel:' + action.phone
  if (action.email) return 'mailto:' + action.email
  if (action.whatsapp) return action.whatsapp
  return '#contact'
}

function allowedSections() {
  return new Set(business.sections || [])
}

function links() {
  const allowed = allowedSections()
  return (design.sectionOrder || business.sections || []).filter((id) => {
    if (['hero', 'footer', 'cta'].includes(id)) return false
    return !allowed.size || allowed.has(id)
  }).slice(0, 6)
}

function Nav() {
  const items = links()
  return (
    <header className={'nav ' + (design.navigationStrategy || 'top-ruled')}>
      <a className="brand" href="#top">{business.logo ? <img src={business.logo} alt="" /> : null}{business.name}</a>
      <details className="nav-toggle">
        <summary>Menu</summary>
        <nav>{items.map((id) => <a key={id} href={'#' + id}>{id}</a>)}</nav>
      </details>
      <nav className="nav-desktop">{items.map((id) => <a key={id} href={'#' + id}>{id}</a>)}</nav>
    </header>
  )
}

function Hero() {
  const hero = business.hero || {}
  const cta = hero.primaryCta || business.cta || {}
  return (
    <section id="hero" className={'hero ' + (design.heroComposition || 'typographic-column')}>
      <div className="hero-copy">
        {hero.eyebrow || business.category ? <p className="eyebrow">{hero.eyebrow || business.category}</p> : null}
        <h1>{hero.title || business.name || 'Your business'}</h1>
        {hero.subtitle ? <p className="lede">{hero.subtitle}</p> : null}
        <div className={'actions cta-' + (design.ctaPlacement || 'hero-inline')}>
          {cta.label ? <a className="btn primary" href={hrefFor(cta)}>{cta.label}</a> : null}
          {business.whatsapp ? <a className="btn whatsapp" href={business.whatsapp}>WhatsApp</a> : null}
        </div>
      </div>
    </section>
  )
}

function Cards({ id, title, items }) {
  if (!items?.length) return null
  return (
    <section id={id} className="section">
      <h2>{title}</h2>
      <div className={'grid ' + (design.gridStrategy || '')}>
        {items.map((item, i) => (
          <article key={item.name || i} className={'card ' + (design.cardStrategy || '')}>
            {item.image ? <img src={item.image} alt="" loading="lazy" /> : null}
            {item.name ? <h3>{item.name}</h3> : null}
            {item.quote || item.description ? <p>{item.quote || item.description}</p> : null}
          </article>
        ))}
      </div>
    </section>
  )
}

export default function App() {
  if (!business) {
    return <div id="top" className="site loading" data-state="loading"><p>Loading listing…</p></div>
  }
  const allowed = allowedSections()
  const order = (design.sectionOrder?.length ? design.sectionOrder : business.sections || ['hero', 'footer']).filter((id) => {
    if (id === 'hero' || id === 'footer') return true
    return !allowed.size || allowed.has(id)
  })
  return (
    <div id="top" className={'site look-' + (design.direction || 'editorial')} data-design={design.direction} data-nav={design.navigationStrategy} data-hero={design.heroComposition}>
      <Nav />
      {order.map((id) => {
        if (id === 'hero') return <Hero key="hero" />
        if (id === 'about' && business.about?.body) {
          return (
            <section id="about" key="about" className="section">
              <h2>{business.about?.title || ('About ' + business.name)}</h2>
              <p>{business.about.body}</p>
            </section>
          )
        }
        if (id === 'services') return <Cards key="services" id="services" title="Services" items={business.services} />
        if (id === 'products') return <Cards key="products" id="products" title="Products" items={business.products} />
        if (id === 'offers') return <Cards key="offers" id="offers" title="Offers" items={business.offers} />
        if (id === 'reviews') return <Cards key="reviews" id="reviews" title="Reviews" items={business.reviews} />
        if (id === 'gallery') {
          const images = business.gallery || []
          if (!images.length) return null
          return (
            <section id="gallery" key="gallery" className="section">
              <h2>Gallery</h2>
              <div className={'grid ' + (design.gridStrategy || '')}>
                {images.map((src, i) => <img key={i} src={typeof src === 'string' ? src : src.url || src.src} alt="" loading="lazy" />)}
              </div>
            </section>
          )
        }
        if (id === 'hours' && business.hours) {
          return (
            <section id="hours" key="hours" className="section">
              <h2>Hours</h2>
              <p>{business.hours}</p>
            </section>
          )
        }
        if (id === 'contact') {
          const social = business.socialLinks || {}
          return (
            <section id="contact" key="contact" className="section">
              <h2>Contact</h2>
              {business.address ? <p>{business.address}</p> : null}
              {business.phone ? <p><a href={'tel:' + business.phone}>{business.phone}</a></p> : null}
              {business.email ? <p><a href={'mailto:' + business.email}>{business.email}</a></p> : null}
              {business.whatsapp ? <p><a href={business.whatsapp}>WhatsApp</a></p> : null}
              {social.instagram ? <p><a href={social.instagram}>Instagram</a></p> : null}
              {social.facebook ? <p><a href={social.facebook}>Facebook</a></p> : null}
            </section>
          )
        }
        if (id === 'cta') {
          const cta = business.cta || business.hero?.primaryCta
          if (!cta?.label) return null
          return (
            <section id="cta" key="cta" className="section cta-band">
              <a className="btn primary" href={hrefFor(cta)}>{cta.label}</a>
            </section>
          )
        }
        if (id === 'footer') {
          return (
            <footer id="footer" key="footer" className={'footer ' + (design.footerStrategy || '')}>
              © {new Date().getFullYear()} {business.name}
            </footer>
          )
        }
        return null
      })}
    </div>
  )
}
`
}

