import business from './data/business.json'
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
