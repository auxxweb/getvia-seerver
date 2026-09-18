import fs from 'node:fs/promises'
import path from 'node:path'

export function isHeroLayoutPrompt(prompt) {
  const t = String(prompt || '').toLowerCase()
  if (/\b(start over|from scratch|rebuild)\b/.test(t)) return false
  return (
    /\bchange only the hero\b/.test(t) ||
    (/\bhero\b/.test(t) &&
      /\b(two[- ]column|split|floating service|visually impressive|more premium)\b/.test(t))
  )
}

export const PREMIUM_SPLIT_HERO_FN = `export default function Hero() {
  const hero = business.hero || {}
  const gallery = business.gallery || []
  const firstGallery = typeof gallery[0] === 'string' ? gallery[0] : gallery[0]?.url || gallery[0]?.src || gallery[0]?.image
  const image = hero.image || firstGallery || business.services?.[0]?.image || business.logo || ''
  const featured = (business.services || [])[0]
  const secondary = (hero.extraButtons || [])[0]
  const moreButtons = (hero.extraButtons || []).slice(1)
  return (
    <section id="hero" className="hero hero-split">
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

export const PREMIUM_SPLIT_HERO_MODULE = `import business from '../data/business.json'
import { hrefFor } from './hrefFor.js'

${PREMIUM_SPLIT_HERO_FN}`

export const PREMIUM_SPLIT_HERO_CSS = `
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

export async function patchPremiumSplitHero(workspaceDir) {
  const heroPath = path.join(workspaceDir, 'src/components/Hero.jsx')
  const appPath = path.join(workspaceDir, 'src/App.jsx')
  const cssPath = path.join(workspaceDir, 'src/index.css')
  const written = []

  let heroExists = false
  try {
    await fs.access(heroPath)
    heroExists = true
  } catch {
    heroExists = false
  }

  if (heroExists) {
    let hero = await fs.readFile(heroPath, 'utf8')
    if (!hero.includes('hero-split')) {
      await fs.writeFile(heroPath, PREMIUM_SPLIT_HERO_MODULE, 'utf8')
      written.push('src/components/Hero.jsx')
    }
  } else {
    let app = await fs.readFile(appPath, 'utf8')
    if (!app.includes('hero-split')) {
      const next = app.includes('function Cards')
        ? app.replace(/function Hero\(\) \{[\s\S]*?\nfunction Cards/, `${PREMIUM_SPLIT_HERO_FN}\n\nfunction Cards`)
        : app.replace(/function Hero\(\) \{[\s\S]*?\n\}/, PREMIUM_SPLIT_HERO_FN)
      if (next === app) {
        return { ok: false, written, message: 'Hero function was not found in src/App.jsx.' }
      }
      await fs.writeFile(appPath, next, 'utf8')
      written.push('src/App.jsx')
    }
  }

  let css = await fs.readFile(cssPath, 'utf8')
  if (!css.includes('.hero.hero-split')) {
    css = `${css.trimEnd()}\n${PREMIUM_SPLIT_HERO_CSS}`
    await fs.writeFile(cssPath, css, 'utf8')
    written.push('src/index.css')
  }
  return { ok: true, written }
}
