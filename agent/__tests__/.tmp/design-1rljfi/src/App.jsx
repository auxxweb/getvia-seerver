import business from './data/business.json'
import design from './data/design.json'

function hrefFor(action = {}) {
  if (action.href) return action.href
  if (action.phone) return 'tel:' + action.phone
  if (action.email) return 'mailto:' + action.email
  return '#contact'
}

function links() {
  return (design.sectionOrder || business.sections || []).filter((id) => !['hero', 'footer', 'cta'].includes(id)).slice(0, 6)
}

function Nav() {
  const items = links()
  return (
    <header className={'nav ' + (design.navigationStrategy || 'top-ruled')}>
      <a className="brand" href="#top">{business.name}</a>
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
        <p className="eyebrow">{hero.eyebrow || business.category || design.label}</p>
        <h1>{hero.title || business.name}</h1>
        <p className="lede">{hero.subtitle}</p>
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
            {item.image ? <img src={item.image} alt="" /> : null}
            <h3>{item.name}</h3>
            <p>{item.description}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export default function App() {
  const order = design.sectionOrder?.length ? design.sectionOrder : ['hero', 'about', 'services', 'contact', 'footer']
  return (
    <div id="top" className={'site look-' + (design.direction || 'editorial')} data-design={design.direction} data-nav={design.navigationStrategy} data-hero={design.heroComposition}>
      <Nav />
      {order.map((id) => {
        if (id === 'hero') return <Hero key="hero" />
        if (id === 'about') {
          return (
            <section id="about" key="about" className="section">
              <h2>{business.about?.title || ('About ' + business.name)}</h2>
              <p>{business.about?.body}</p>
            </section>
          )
        }
        if (id === 'services') return <Cards key="services" id="services" title="Services" items={business.services} />
        if (id === 'products') return <Cards key="products" id="products" title="Products" items={business.products} />
        if (id === 'reviews') return <Cards key="reviews" id="reviews" title="Reviews" items={business.reviews} />
        if (id === 'gallery') {
          const images = business.gallery || []
          if (!images.length) return null
          return (
            <section id="gallery" key="gallery" className="section">
              <h2>Gallery</h2>
              <div className={'grid ' + (design.gridStrategy || '')}>
                {images.map((src, i) => <img key={i} src={typeof src === 'string' ? src : src.url || src.src} alt="" />)}
              </div>
            </section>
          )
        }
        if (id === 'contact') {
          return (
            <section id="contact" key="contact" className="section">
              <h2>Contact</h2>
              <p>{business.address}</p>
              {business.phone ? <p><a href={'tel:' + business.phone}>{business.phone}</a></p> : null}
            </section>
          )
        }
        if (id === 'cta') {
          return (
            <section id="cta" key="cta" className="section cta-band">
              <a className="btn primary" href={hrefFor(business.cta || business.hero?.primaryCta || {})}>
                {business.cta?.label || business.hero?.primaryCta?.label || 'Contact us'}
              </a>
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
