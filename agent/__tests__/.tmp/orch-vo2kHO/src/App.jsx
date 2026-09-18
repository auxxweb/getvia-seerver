import business from './data/business.json'

function Nav() {
  return (
    <header className="nav">
      <a className="brand" href="#top">{business.name}</a>
    </header>
  )
}

function Hero() {
  const hero = business.hero || {}
  return (
    <section id="hero" className="hero">
      <h1>{hero.title}</h1>
      <a className="btn primary" href={hero.primaryCta.href}>{hero.primaryCta.label}</a>
    </section>
  )
}

export default function App() {
  return (
    <div id="top" className="site">
      <Nav />
      <Hero />
      // 
    </div>
  )
}
