import path from 'node:path'
import fs from 'node:fs/promises'
import { inferLookFromPrompt } from '../mutations/promptAnalysis.js'
import { applyAiTheme, resolveAiThemePreset } from '../theme/aiTheme.js'
import { resolveVisualLook } from '../theme/visualLook.js'
import {
  sectionsFromGetviaProfile,
  functionalityFromProfile,
  pickFact,
  formatHoursText,
} from '../getvia/profileContract.js'
import { PREVIEW_EDITOR_JS } from './previewEditorScript.js'
import { attachPublicApiToBusiness, GETVIA_PUBLIC_CLIENT_JS, getPublicApiOrigin, publicApiContract } from '../getvia/publicApi.js'

const PACKAGE_JSON = {
  name: 'getvia-isolated-site',
  private: true,
  type: 'module',
  scripts: {
    dev: 'vite',
    build: 'vite build',
    preview: 'vite preview',
  },
  dependencies: {
    react: '^19.2.5',
    'react-dom': '^19.2.5',
  },
  devDependencies: {
    '@vitejs/plugin-react': '^4.7.0',
    vite: '^6.3.5',
  },
}

function viteConfigSource(apiOrigin = getPublicApiOrigin()) {
  const target = JSON.stringify(apiOrigin)
  return `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const port = Number(process.env.GETVIA_PREVIEW_PORT || 5179)
const apiOrigin = process.env.GETVIA_API_ORIGIN || ${target}
const previewBase = process.env.GETVIA_PREVIEW_BASE || '/'
const buildOutDir = process.env.GETVIA_BUILD_OUTDIR || 'dist'
const enableHmr = process.env.GETVIA_PREVIEW_HMR === '1'

export default defineConfig({
  base: previewBase.endsWith('/') ? previewBase : \`\${previewBase}/\`,
  build: { outDir: buildOutDir, emptyOutDir: true },
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    // Production iframe is HTTP-proxied; Vite HMR websockets cannot reach 127.0.0.1:4100 from the browser.
    hmr: enableHmr ? { host: '127.0.0.1', port, protocol: 'ws', clientPort: port } : false,
    cors: {
      origin: [
        'http://localhost:5175',
        'http://127.0.0.1:5175',
        'http://localhost:5174',
        'http://127.0.0.1:5174',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'https://business.getvia.in',
        'https://admin.getvia.in',
        'https://getvia.in',
      ],
    },
    proxy: {
      '/getvia-api': {
        target: apiOrigin,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\\/getvia-api/, '/api'),
      },
    },
  },
  preview: { host: '127.0.0.1', port, strictPort: true },
})
`
}

const VITE_CONFIG = viteConfigSource()

/** Rewrite vite.config.js so existing workspaces pick up preview base / proxy settings. */
export async function writePreviewViteConfig(workspaceDir, { apiOrigin } = {}) {
  if (!workspaceDir) return { ok: false }
  const vitePath = path.join(workspaceDir, 'vite.config.js')
  await fs.writeFile(vitePath, viteConfigSource(apiOrigin || getPublicApiOrigin()), 'utf8')
  return { ok: true, written: ['vite.config.js'] }
}
const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Website</title>
    <!-- getvia:fonts -->
    <!-- getvia:icons -->
    <!-- getvia:css-libs -->
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.jsx"></script>
    <!-- getvia:js-libs -->
  </body>
</html>
`

const MAIN_JSX = `import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './getvia/previewEditor.js'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`

const HREF_JS = `export function hrefFor(action = {}) {
  if (action?.href) return action.href
  if (action?.phone) return \`tel:\${action.phone}\`
  if (action?.email) return \`mailto:\${action.email}\`
  if (action?.whatsapp) return action.whatsapp
  return '#contact'
}
`

const NAV_JSX = `import business from '../data/business.json'

const LABELS = {
  about: 'About',
  offers: 'Offers',
  products: 'Products',
  services: 'Services',
  feed: 'Feed',
  gallery: 'Gallery',
  testimonials: 'Stories',
  reviews: 'Reviews',
  contact: 'Contact',
  location: 'Location',
  hours: 'Hours',
  social: 'Social',
}

export default function Nav() {
  const links = (business.sections || []).filter((id) => !['hero', 'footer', 'cta'].includes(id)).slice(0, 8)
  return (
    <header className="nav" data-getvia-section="nav">
      <a className="brand" href="#top">{business.logo ? <img src={business.logo} alt="" /> : null}{business.name}</a>
      <details className="nav-toggle">
        <summary>Menu</summary>
        <nav>
          {links.map((id) => (
            <a key={id} href={\`#\${id}\`}>{LABELS[id] || id}</a>
          ))}
        </nav>
      </details>
      <nav className="nav-desktop">
        {links.map((id) => (
          <a key={id} href={\`#\${id}\`}>{LABELS[id] || id}</a>
        ))}
      </nav>
    </header>
  )
}
`

const HERO_JSX = `import business from '../data/business.json'
import { hrefFor } from './hrefFor.js'

export default function Hero() {
  const hero = business.hero || {}
  const gallery = business.gallery || []
  const firstGallery = typeof gallery[0] === 'string' ? gallery[0] : gallery[0]?.url || gallery[0]?.src || gallery[0]?.image
  const image = hero.image || firstGallery || business.services?.[0]?.image || business.logo || ''
  const featured = (business.services || [])[0]
  const secondary = (hero.extraButtons || [])[0]
  const moreButtons = (hero.extraButtons || []).slice(1)
  return (
    <section id="hero" className="hero hero-split" data-getvia-section="hero">
      <div className="hero-copy">
        <p className="eyebrow">{hero.eyebrow || business.category}</p>
        <h1>{hero.title || business.name}</h1>
        <p className="lede">{hero.subtitle}</p>
        <div className="actions">
          {hero.primaryCta?.label ? (
            <a className="btn primary" href={hrefFor(hero.primaryCta)}>{hero.primaryCta.label}</a>
          ) : null}
          {secondary?.label ? (
            <a className="btn ghost" data-component-type="button" href={hrefFor(secondary)}>{secondary.label}</a>
          ) : null}
          {moreButtons.map((btn) => (
            <a key={btn.label} className="btn ghost" data-component-type="button" href={hrefFor(btn)}>{btn.label}</a>
          ))}
        </div>
      </div>
      <div className="hero-media">
        {image ? <img src={image} alt="" /> : <div className="hero-photo-fallback" aria-hidden="true" />}
        {featured?.name ? (
          <article className="hero-float-card">
            <p className="eyebrow">Signature</p>
            <h3>{featured.name}</h3>
            <p>{featured.description}</p>
          </article>
        ) : null}
      </div>
    </section>
  )
}
`

const CARDS_JSX = `import business from '../data/business.json'

export default function Cards({ id, title, items, kind }) {
  if (!items?.length) return null
  return (
    <section id={id} className="section" data-getvia-section={id}>
      <h2>{title}</h2>
      <div className="grid">
        {items.map((item, i) => (
          <article key={item.name || i} className="card">
            {item.image ? <img src={item.image} alt="" /> : null}
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            {item.price ? <p className="price">{item.price}</p> : null}
            {kind === 'product' && business.hero?.shopHref ? (
              <a className="btn ghost" href={business.hero.shopHref}>Shop</a>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}
`

const GALLERY_JSX = `import business from '../data/business.json'

export default function Gallery() {
  const images = business.gallery || []
  if (!images.length) return null
  return (
    <section id="gallery" className="section" data-getvia-section="gallery">
      <h2>Gallery</h2>
      <div className="gallery">
        {images.map((src, i) => (
          <img key={(typeof src === 'string' ? src : src.url || src.src) + i} src={typeof src === 'string' ? src : src.url || src.src} alt="" />
        ))}
      </div>
    </section>
  )
}
`

const ABOUT_JSX = `import business from '../data/business.json'

export default function About() {
  return (
    <section id="about" className="section" data-getvia-section="about">
      <h2>{business.about?.title || (business.name ? \`About \${business.name}\` : 'About')}</h2>
      <p>{business.about?.body}</p>
    </section>
  )
}
`

const CONTACT_JSX = `import { useState } from 'react'
import business from '../data/business.json'
import { submitGetviaEnquiry } from '../lib/getviaPublic.js'

export default function Contact() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setStatus('')
    const result = await submitGetviaEnquiry({ name, email, phone, message })
    setBusy(false)
    setStatus(result.message)
    if (result.ok) {
      setName('')
      setEmail('')
      setPhone('')
      setMessage('')
    }
  }

  return (
    <section id="contact" className="section" data-getvia-section="contact">
      <h2>Contact</h2>
      <form className="enquiry" onSubmit={onSubmit} data-getvia="enquiry">
        <label>Name<input name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Email<input type="email" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Phone<input type="tel" name="phone" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <label>Message<textarea name="message" required rows={3} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
        {status ? <p role="status">{status}</p> : null}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send enquiry'}</button>
      </form>
      {business.address ? <p>{business.address}</p> : null}
      {business.phone ? <p><a href={\`tel:\${business.phone}\`}>{business.phone}</a></p> : null}
      {business.email ? <p><a href={\`mailto:\${business.email}\`}>{business.email}</a></p> : null}
      {business.whatsapp ? <p><a className="btn primary" href={business.whatsapp}>WhatsApp</a></p> : null}
    </section>
  )
}
`

const LOCATION_JSX = `import business from '../data/business.json'

export default function Location() {
  const map = business.mapLink || business.location?.mapLink
  if (!business.address && !map) return null
  return (
    <section id="location" className="section" data-getvia-section="location">
      <h2>Location</h2>
      {business.address ? <p>{business.address}</p> : null}
      {map ? <p><a className="btn ghost" href={map} target="_blank" rel="noreferrer">Open in Maps</a></p> : null}
    </section>
  )
}
`

const HOURS_JSX = `import business from '../data/business.json'

export default function Hours() {
  const text = business.hours
  if (!text) return null
  return (
    <section id="hours" className="section" data-getvia-section="hours">
      <h2>Hours</h2>
      <pre className="hours">{text}</pre>
    </section>
  )
}
`

const SOCIAL_JSX = `import business from '../data/business.json'

export default function Social() {
  const social = business.social || {}
  const links = Object.entries(social).filter(([, url]) => url)
  if (!links.length && !business.whatsapp) return null
  return (
    <section id="social" className="section" data-getvia-section="social">
      <h2>Connect</h2>
      <div className="actions">
        {business.whatsapp ? <a className="btn primary" href={business.whatsapp}>WhatsApp</a> : null}
        {links.map(([key, url]) => (
          <a key={key} className="btn ghost" href={url} target="_blank" rel="noreferrer">{key}</a>
        ))}
      </div>
    </section>
  )
}
`

const FEED_JSX = `import business from '../data/business.json'

export default function Feed() {
  const items = business.feed || []
  if (!items.length) return null
  return (
    <section id="feed" className="section" data-getvia-section="feed">
      <h2>{business.feedTitle || 'Updates'}</h2>
      <div className="grid">
        {items.map((item, i) => (
          <article key={item.name || i} className="card">
            {item.image ? <img src={item.image} alt="" /> : null}
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            {item.link ? <a className="btn ghost" href={item.link}>Open</a> : null}
          </article>
        ))}
      </div>
    </section>
  )
}
`

const TESTIMONIALS_JSX = `import business from '../data/business.json'

export default function Testimonials() {
  const rows = business.testimonials?.length ? business.testimonials : business.reviews || []
  if (!rows.length) return null
  return (
    <section id="testimonials" className="section" data-getvia-section="testimonials">
      <h2>Testimonials</h2>
      {rows.map((row, i) => (
        <blockquote key={row.name || i} className="card quote">
          <p>{row.quote || row.description || row.comment}</p>
          {row.name ? <cite>{row.name}</cite> : null}
        </blockquote>
      ))}
    </section>
  )
}
`

const REVIEWS_JSX = `import business from '../data/business.json'

export default function Reviews() {
  const rows = business.reviews || []
  if (!rows.length) return null
  return (
    <section id="reviews" className="section" data-getvia-section="reviews">
      <h2>Reviews</h2>
      {rows.map((row, i) => (
        <article key={row.name || i} className="card">
          <h3>{row.name || 'Guest'}</h3>
          <p>{row.quote || row.description || row.comment}</p>
        </article>
      ))}
    </section>
  )
}
`

const CTA_JSX = `import business from '../data/business.json'
import { hrefFor } from './hrefFor.js'

export default function Cta() {
  return (
    <section id="cta" className="section cta" data-getvia-section="cta">
      <h2>{business.cta?.title || 'Ready to visit?'}</h2>
      <a className="btn primary" href={hrefFor(business.cta || business.hero?.primaryCta || {})}>
        {business.cta?.label || business.hero?.primaryCta?.label || 'Contact us'}
      </a>
    </section>
  )
}
`

const FOOTER_JSX = `import business from '../data/business.json'

export default function Footer() {
  return (
    <footer id="footer" className="footer" data-getvia-section="footer">
      © {new Date().getFullYear()} {business.name}
    </footer>
  )
}
`

const APP_JSX = `import business from './data/business.json'
import Nav from './components/Nav.jsx'
import Hero from './components/Hero.jsx'
import About from './components/About.jsx'
import Cards from './components/Cards.jsx'
import Gallery from './components/Gallery.jsx'
import Feed from './components/Feed.jsx'
import Testimonials from './components/Testimonials.jsx'
import Reviews from './components/Reviews.jsx'
import Contact from './components/Contact.jsx'
import Location from './components/Location.jsx'
import Hours from './components/Hours.jsx'
import Social from './components/Social.jsx'
import Cta from './components/Cta.jsx'
import Footer from './components/Footer.jsx'

export default function App() {
  const order = business.sections?.length ? business.sections : ['hero', 'about', 'services', 'contact', 'footer']
  const cssVars = business.colors || {}
  return (
    <div
      id="top"
      className={\`site look-\${business.look || 'original'}\`}
      style={Object.fromEntries(Object.entries(cssVars).map(([k, v]) => [\`--\${k}\`, v]))}
    >
      <Nav />
      {order.map((id) => {
        if (id === 'hero') return <Hero key="hero" />
        if (id === 'about') return <About key="about" />
        if (id === 'services') return <Cards key="services" id="services" title="Services" items={business.services} />
        if (id === 'products') return <Cards key="products" id="products" title="Products" items={business.products} kind="product" />
        if (id === 'offers') return <Cards key="offers" id="offers" title="Offers" items={business.offers} />
        if (id === 'pricing') return <Cards key="pricing" id="pricing" title="Pricing" items={business.pricing || business.offers} />
        if (id === 'feed') return <Feed key="feed" />
        if (id === 'testimonials') return <Testimonials key="testimonials" />
        if (id === 'reviews') return <Reviews key="reviews" />
        if (id === 'gallery') return <Gallery key="gallery" />
        if (id === 'cta') return <Cta key="cta" />
        if (id === 'contact') return <Contact key="contact" />
        if (id === 'location') return <Location key="location" />
        if (id === 'hours') return <Hours key="hours" />
        if (id === 'social') return <Social key="social" />
        if (id === 'footer') return <Footer key="footer" />
        return null
      })}
    </div>
  )
}
`

const INDEX_CSS = `:root {
  --background: #ffffff;
  --surface: #ffffff;
  --heading: #111111;
  --text: #1f1f1f;
  --muted: #5c5c5c;
  --accent: #111111;
  --accentText: #ffffff;
  --border: #e5e5e5;
  --heroBg: #111111;
  --heroFg: #ffffff;
  --buttonBg: #111111;
  --buttonFg: #ffffff;
  --cardBg: #ffffff;
  --font: Georgia, 'Times New Roman', serif;
  --heading-font: Georgia, 'Times New Roman', serif;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: var(--font);
  background: var(--background);
  color: var(--text);
}
.site { min-height: 100vh; }
.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem 6vw;
  position: sticky;
  top: 0;
  z-index: 20;
  background: color-mix(in srgb, var(--background) 88%, transparent);
  backdrop-filter: blur(12px);
}
.nav-desktop { display: flex; gap: 1rem; flex-wrap: wrap; }
.nav-toggle { display: none; }
.nav-toggle summary { cursor: pointer; list-style: none; font-weight: 700; }
.nav-toggle nav { display: flex; flex-direction: column; gap: .5rem; padding: .75rem 0; }
@media (max-width: 768px) {
  .nav-desktop { display: none; }
  .nav-toggle { display: block; }
  .hero-inner, .section { padding-left: 5vw; padding-right: 5vw; overflow-wrap: anywhere; }
  .actions { flex-wrap: wrap; }
}
.nav a { color: inherit; text-decoration: none; margin-left: 1rem; text-transform: capitalize; }
.brand { font-weight: 700; display: flex; align-items: center; gap: .6rem; }
.brand img { width: 36px; height: 36px; object-fit: cover; border-radius: 999px; }
.hero {
  min-height: 78vh;
  display: grid;
  place-items: center;
  padding: 8vh 6vw;
  background: var(--heroBg);
  color: var(--heroFg);
}
.hero-inner { max-width: 720px; }
.eyebrow { letter-spacing: .18em; text-transform: uppercase; font-size: .72rem; opacity: .8; }
h1, h2, h3 { color: var(--heading); margin: 0 0 .6rem; font-family: var(--heading-font, var(--font)); }
.hero h1 { color: var(--heroFg); font-size: clamp(2.4rem, 6vw, 4.8rem); line-height: 1.05; }
.lede { font-size: 1.15rem; max-width: 38rem; }
.actions { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1.5rem; }
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: .85rem 1.25rem;
  border-radius: 999px;
  text-decoration: none;
  font-weight: 700;
  border: 1px solid transparent;
}
.btn.primary { background: var(--buttonBg); color: var(--buttonFg); }
.btn.ghost { border-color: currentColor; color: inherit; }
.section { padding: 5rem 6vw; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; }
.card {
  background: var(--cardBg);
  border: 1px solid var(--border);
  border-radius: 1.25rem;
  padding: 1.25rem;
}
.card img, .gallery img { width: 100%; height: 180px; object-fit: cover; border-radius: .8rem; }
.gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: .75rem; }
.price { font-weight: 700; }
.cta { text-align: center; }
.enquiry { display: grid; gap: .75rem; max-width: 28rem; margin-bottom: 1.25rem; }
.enquiry label { display: grid; gap: .35rem; font-size: .9rem; color: var(--muted); }
.enquiry input, .enquiry textarea {
  font: inherit;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: .75rem;
  padding: .7rem .85rem;
}
.hours { white-space: pre-wrap; font: inherit; margin: 0; color: var(--muted); }
.quote cite { display: block; margin-top: .75rem; font-style: normal; color: var(--muted); }
.footer { padding: 2rem 6vw; background: #111; color: #f5f5f5; }
.look-glassmorphism .hero {
  background:
    radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--accent) 40%, transparent), transparent 40%),
    linear-gradient(160deg, #0b0b12, #1c1630);
}
.look-glassmorphism .card,
.look-glassmorphism .btn.ghost {
  background: color-mix(in srgb, white 14%, transparent);
  backdrop-filter: blur(18px);
  border-color: rgba(255,255,255,.28);
}
.look-luxury { letter-spacing: .02em; }
.look-luxury h1 { font-weight: 500; }
.look-minimal .card { box-shadow: none; border-radius: 0; }
.hero.hero-split {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, .95fr);
  gap: clamp(1.5rem, 4vw, 4rem);
  align-items: center;
  min-height: 86vh;
  padding: 7vh 6vw;
  overflow: hidden;
}
.hero-copy { max-width: 38rem; }
.hero-media { position: relative; min-height: 22rem; }
.hero-media img,
.hero-photo-fallback {
  width: 100%;
  height: min(72vh, 640px);
  object-fit: cover;
  border-radius: 1.6rem;
  box-shadow: 0 30px 80px rgba(0,0,0,.28);
}
.hero-photo-fallback {
  background:
    radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--accent) 40%, transparent), transparent 42%),
    linear-gradient(160deg, var(--heroBg), color-mix(in srgb, var(--accent) 35%, #111));
}
.hero-float-card {
  position: absolute;
  left: 1rem;
  bottom: 1rem;
  max-width: 16.5rem;
  padding: 1rem 1.1rem;
  border-radius: 1.1rem;
  background: color-mix(in srgb, var(--cardBg, #fff) 88%, transparent);
  backdrop-filter: blur(18px);
  box-shadow: 0 18px 40px rgba(0,0,0,.18);
  color: var(--cardText, var(--heading));
}
.hero-float-card h3 { font-size: 1rem; margin-bottom: .35rem; }
.hero-float-card p { margin: 0; font-size: .9rem; color: var(--muted); }
@media (max-width: 768px) {
  .hero.hero-split { grid-template-columns: 1fr; min-height: auto; padding-top: 5rem; }
  .hero-media img, .hero-photo-fallback { height: 52vh; }
  .hero-float-card { max-width: calc(100% - 2rem); }
}
`

function named(item) {
  if (!item) return null
  if (typeof item === 'string') return { name: item, description: '' }
  return {
    name: item.name || item.title || '',
    description: item.description || item.body || '',
    price: item.price || item.amount || item.priceOffer || '',
    image: item.image || item.imageUrl || item.src || '',
    link: item.link || item.links || '',
  }
}

function telHref(phone) {
  const n = String(phone || '').replace(/[^\d+]/g, '')
  return n ? `tel:${n}` : ''
}

function extraButtonsFromPrompt(prompt) {
  const text = String(prompt || '')
  if (/\b(remove|delete|drop|get rid of|take off)\b/i.test(text)) return []
  const buttons = []
  const shop = text.match(/shop [^.,]+/i)
  if (/shop new arrivals/i.test(text) || shop) {
    buttons.push({
      label: (shop?.[0] || 'Shop New Arrivals').replace(/\bbutton\b/i, '').trim(),
      href: '#products',
    })
  }
  if (/book appointment|booking button|book now/i.test(text)) {
    buttons.push({ label: 'Book Appointment', href: '#contact' })
  }
  const quoted = text.match(/add (?:a |an )?"([^"]+)" button/i) || text.match(/add (?:a |an )?'([^']+)' button/i)
  if (quoted?.[1] && !buttons.some((b) => b.label.toLowerCase() === quoted[1].toLowerCase())) {
    buttons.push({ label: quoted[1], href: '#contact' })
  }
  return buttons
}

export function businessJsonFrom({ profile, prompt, plan, websiteState } = {}) {
  const identity = profile?.identity || {}
  const content = profile?.content || {}
  const contact = profile?.contact || {}
  const location = profile?.location || {}
  const social = contact.socialLinks || {}
  const promptLook = inferLookFromPrompt(String(prompt || '').toLowerCase()) || resolveVisualLook(prompt)
  const look = promptLook || websiteState?.theme?.look || plan?.themePreset || 'original'
  const preset = resolveAiThemePreset(look) || resolveAiThemePreset(plan?.themePreset) || resolveAiThemePreset('original')
  const colors =
    promptLook || !websiteState?.theme?.colors
      ? applyAiTheme({}, preset || {})
      : websiteState.theme.colors

  const sections = sectionsFromGetviaProfile({ profile, websiteState, plan, prompt })
  const phone = pickFact(contact.phone, websiteState?.settings?.phone)
  const email = pickFact(contact.email, websiteState?.settings?.email)
  const whatsapp = pickFact(contact.whatsappHref, social.whatsapp, websiteState?.settings?.whatsapp)
  const name = pickFact(identity.name, websiteState?.settings?.businessName)
  const description = pickFact(
    identity.description,
    content.landing?.welcomeDescription,
    content.landing?.bannerDescription,
    websiteState?.content?.description,
  )
  const landing = content.landing || {}
  const primaryLabel = pickFact(landing.bannerCtaLabel, /book appointment/i.test(String(prompt || '')) ? 'Book Appointment' : '')
  const primaryHref = pickFact(landing.bannerCtaLink, phone ? telHref(phone) : '', '#contact')
  const hours = formatHoursText(profile?.openingHours, pickFact(profile?.hoursText, identity.hours))
  const address = pickFact(
    location.formattedAddress,
    location.address,
    websiteState?.settings?.address,
    [location.city, location.state].filter(Boolean).join(', '),
  )
  const mapLink = pickFact(location.mapLink, websiteState?.settings?.mapLink)
  const reviews = [
    ...(content.testimonials || []).map((row) => ({
      name: pickFact(row.name, row.author),
      quote: pickFact(row.quote, row.text, row.description),
    })),
    ...(profile?.reviews?.recent || []).map((row) => ({
      name: '',
      quote: pickFact(row.comment),
      rating: row.rating,
    })),
    ...(content.reviews || []).map((row) => ({
      name: pickFact(row.name, row.author),
      quote: pickFact(row.quote, row.text, row.description, row.comment),
    })),
  ].filter((row) => row.quote)

  return attachPublicApiToBusiness({
    name,
    category: pickFact(identity.category),
    city: pickFact(location.city, websiteState?.settings?.city),
    address,
    mapLink,
    phone,
    email,
    logo: pickFact(identity.logo, websiteState?.settings?.logo),
    hours,
    openingHours: Array.isArray(profile?.openingHours) ? profile.openingHours : websiteState?.settings?.hours || [],
    look,
    colors,
    sections,
    source: 'getvia-profile',
    functionality: functionalityFromProfile(profile),
    hero: {
      eyebrow: pickFact(identity.category, location.city),
      title: pickFact(landing.bannerTitle, name),
      subtitle: pickFact(landing.bannerDescription, description),
      image: pickFact(landing.bannerImageUrl),
      primaryCta: {
        label: primaryLabel || (phone || email || whatsapp ? 'Contact us' : 'Get in touch'),
        href: primaryHref || '#contact',
        phone,
      },
      extraButtons: extraButtonsFromPrompt(prompt),
      shopHref: sections.includes('products') ? '#products' : '#contact',
    },
    about: {
      title: pickFact(landing.welcomeTitle, name ? `About ${name}` : ''),
      body: pickFact(landing.welcomeDescription, description),
      image: pickFact(landing.welcomeImageUrl),
    },
    services: (content.coreServices || []).map(named).filter((row) => row?.name),
    products: (content.catalogue || []).map(named).filter((row) => row?.name),
    offers: (content.offers || []).map(named).filter((row) => row?.name),
    feed: (content.feed || content.profileFeed || []).map(named).filter((row) => row?.name),
    feedTitle: pickFact(content.feedPageTitle, content.feedTitle, 'Updates'),
    gallery: content.gallery || [],
    faq: [],
    testimonials: (content.testimonials || []).map((row) => ({
      name: pickFact(row.name, row.author),
      quote: pickFact(row.quote, row.text, row.description),
    })).filter((row) => row.quote),
    reviews,
    social: {
      website: pickFact(social.website),
      facebook: pickFact(social.facebook),
      instagram: pickFact(social.instagram),
      twitter: pickFact(social.twitter),
      linkedin: pickFact(social.linkedin),
    },
    whatsapp,
    cta: {
      title: name ? `Visit ${name}` : 'Visit us',
      label: primaryLabel || 'Contact us',
      href: primaryHref || '#contact',
    },
  }, { publicId: pickFact(identity.publicId, profile?.publicId) })
}

export async function ensurePreviewEditorInWorkspace(workspaceDir) {
  if (!workspaceDir) return { ok: false, written: [] }
  const written = []
  const editorPath = path.join(workspaceDir, 'src/getvia/previewEditor.js')
  const mainPath = path.join(workspaceDir, 'src/main.jsx')
  try {
    await fs.access(path.join(workspaceDir, 'src/App.jsx'))
  } catch {
    return { ok: false, written }
  }
  await fs.mkdir(path.dirname(editorPath), { recursive: true })
  await fs.writeFile(editorPath, PREVIEW_EDITOR_JS, 'utf8')
  written.push('src/getvia/previewEditor.js')
  try {
    const main = await fs.readFile(mainPath, 'utf8')
    if (!main.includes('getvia/previewEditor')) {
      const next = main.includes("import './index.css'")
        ? main.replace("import './index.css'", "import './index.css'\nimport './getvia/previewEditor.js'")
        : `${main.trimEnd()}\nimport './getvia/previewEditor.js'\n`
      await fs.writeFile(mainPath, next.endsWith('\n') ? next : `${next}\n`, 'utf8')
      written.push('src/main.jsx')
    }
  } catch {
    await fs.writeFile(mainPath, MAIN_JSX, 'utf8')
    written.push('src/main.jsx')
  }
  return { ok: true, written }
}

export async function writeViteScaffold({ workspaceDir, business, overwrite = false }) {
  const files = {
    'package.json': `${JSON.stringify(PACKAGE_JSON, null, 2)}\n`,
    'vite.config.js': VITE_CONFIG,
    'index.html': INDEX_HTML,
    'src/main.jsx': MAIN_JSX,
    'src/App.jsx': APP_JSX,
    'src/index.css': INDEX_CSS,
    'src/getvia/previewEditor.js': PREVIEW_EDITOR_JS,
    'src/components/hrefFor.js': HREF_JS,
    'src/components/Nav.jsx': NAV_JSX,
    'src/components/Hero.jsx': HERO_JSX,
    'src/components/About.jsx': ABOUT_JSX,
    'src/components/Cards.jsx': CARDS_JSX,
    'src/components/Gallery.jsx': GALLERY_JSX,
    'src/components/Feed.jsx': FEED_JSX,
    'src/components/Testimonials.jsx': TESTIMONIALS_JSX,
    'src/components/Reviews.jsx': REVIEWS_JSX,
    'src/components/Contact.jsx': CONTACT_JSX,
    'src/components/Location.jsx': LOCATION_JSX,
    'src/components/Hours.jsx': HOURS_JSX,
    'src/components/Social.jsx': SOCIAL_JSX,
    'src/components/Cta.jsx': CTA_JSX,
    'src/components/Footer.jsx': FOOTER_JSX,
    'src/lib/getviaPublic.js': GETVIA_PUBLIC_CLIENT_JS,
    'src/data/getvia-public-api.json': `${JSON.stringify(publicApiContract({ publicId: business?.publicId, apiOrigin: business?.getvia?.apiOrigin }), null, 2)}\n`,
    'src/data/business.json': `${JSON.stringify(business, null, 2)}\n`,
  }
  const written = []
  const skipped = []
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(workspaceDir, rel)
    await fs.mkdir(path.dirname(full), { recursive: true })
    let exists = false
    try {
      await fs.access(full)
      exists = true
    } catch {
      exists = false
    }
    // Incremental edits: never clobber existing site files. Only fill in missing scaffold pieces.
    if (exists && !overwrite) {
      skipped.push(rel)
      continue
    }
    await fs.writeFile(full, contents, 'utf8')
    written.push(rel)
  }
  if (!overwrite) {
    const appPath = path.join(workspaceDir, 'src/App.jsx')
    try {
      const current = await fs.readFile(appPath, 'utf8')
      if (!current.includes('components/Hero') || !current.includes("id === 'pricing'")) {
        await fs.writeFile(appPath, APP_JSX, 'utf8')
        written.push('src/App.jsx')
      }
    } catch {
      /* first write handled above */
    }
    const mainPath = path.join(workspaceDir, 'src/main.jsx')
    try {
      const main = await fs.readFile(mainPath, 'utf8')
      if (!main.includes('getvia/previewEditor')) {
        await fs.writeFile(mainPath, MAIN_JSX, 'utf8')
        written.push('src/main.jsx')
      }
    } catch {
      /* ignore */
    }
    const editorPath = path.join(workspaceDir, 'src/getvia/previewEditor.js')
    try {
      await fs.access(editorPath)
    } catch {
      await fs.mkdir(path.dirname(editorPath), { recursive: true })
      await fs.writeFile(editorPath, PREVIEW_EDITOR_JS, 'utf8')
      written.push('src/getvia/previewEditor.js')
    }
    const cssPath = path.join(workspaceDir, 'src/index.css')
    try {
      const css = await fs.readFile(cssPath, 'utf8')
      if (!css.includes('nav-toggle') || !css.includes('.enquiry')) {
        await fs.writeFile(cssPath, INDEX_CSS, 'utf8')
        written.push('src/index.css')
      }
    } catch {
      /* first write handled above */
    }
    await ensureGetviaPublicWorkspace(workspaceDir, business, written)
  } else {
    await ensureGetviaPublicWorkspace(workspaceDir, business, written)
  }
  return { ok: true, written, skipped, preserved: skipped.length > 0, business }
}

async function ensureGetviaPublicWorkspace(workspaceDir, business, written) {
  const clientPath = path.join(workspaceDir, 'src/lib/getviaPublic.js')
  try {
    await fs.access(clientPath)
  } catch {
    await fs.mkdir(path.dirname(clientPath), { recursive: true })
    await fs.writeFile(clientPath, GETVIA_PUBLIC_CLIENT_JS, 'utf8')
    written.push('src/lib/getviaPublic.js')
  }
  const contractPath = path.join(workspaceDir, 'src/data/getvia-public-api.json')
  await fs.mkdir(path.dirname(contractPath), { recursive: true })
  await fs.writeFile(
    contractPath,
    `${JSON.stringify(publicApiContract({ publicId: business?.publicId, apiOrigin: business?.getvia?.apiOrigin }), null, 2)}\n`,
    'utf8',
  )
  if (!written.includes('src/data/getvia-public-api.json')) written.push('src/data/getvia-public-api.json')
  const contactPath = path.join(workspaceDir, 'src/components/Contact.jsx')
  try {
    const current = await fs.readFile(contactPath, 'utf8')
    if (current.includes('e.preventDefault()') && !current.includes('submitGetviaEnquiry') && /data-getvia="enquiry"/.test(current) && !/type="email"/.test(current)) {
      await fs.writeFile(contactPath, CONTACT_JSX, 'utf8')
      written.push('src/components/Contact.jsx')
    }
  } catch {
    /* contact may be missing on a broken workspace */
  }
  const vitePath = path.join(workspaceDir, 'vite.config.js')
  try {
    const current = await fs.readFile(vitePath, 'utf8')
    if (!current.includes('getvia-api')) {
      await fs.writeFile(vitePath, viteConfigSource(business?.getvia?.apiOrigin), 'utf8')
      written.push('vite.config.js')
    }
  } catch {
    /* ignore */
  }
  const dataPath = path.join(workspaceDir, 'src/data/business.json')
  try {
    const parsed = JSON.parse(await fs.readFile(dataPath, 'utf8'))
    const next = attachPublicApiToBusiness(parsed, {
      publicId: business?.publicId || parsed.publicId,
      apiOrigin: business?.getvia?.apiOrigin,
    })
    if (next.publicId !== parsed.publicId || next.getvia?.apiBase !== parsed.getvia?.apiBase) {
      await fs.writeFile(dataPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
      written.push('src/data/business.json')
    }
  } catch {
    /* ignore */
  }
}

export async function workspaceHasSite(workspaceDir) {
  try {
    await fs.access(path.join(workspaceDir, 'src/data/business.json'))
    await fs.access(path.join(workspaceDir, 'src/App.jsx'))
    return true
  } catch {
    return false
  }
}
