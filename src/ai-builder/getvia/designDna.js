import { dnaFromSpec } from '../../../agent/visual/design-explorer/catalog.js'

/**
 * Canonical Design DNA for a generated GetVia site.
 * All components must follow this — do not style sections independently.
 */
export function buildDesignDna({ explore, spec, mode = 'REDESIGN', novelty = 3, category = '' } = {}) {
  const chosen = explore?.chosen || {}
  const fromExplore = dnaFromSpec(chosen, { novelty })
  const colors = spec?.colors || chosen.colorStrategy || fromExplore.colors || {}
  const typography = {
    heading: spec?.fontHeading || chosen.typographyHierarchy?.heading || fromExplore.typography?.heading,
    body: spec?.fontBody || chosen.typographyHierarchy?.body || fromExplore.typography?.body,
    scale: chosen.typographyHierarchy?.scale || fromExplore.typography?.scale || 'display',
  }
  return {
    visualDirection: chosen.label || chosen.direction || spec?.style || 'Custom',
    direction: chosen.direction || chosen.id || spec?.style || null,
    categoryInfluence: category || '',
    colorSystem: colors,
    typography,
    spacing: {
      rhythm: chosen.spacing || fromExplore.spacing || 'generous-vertical',
      radius: spec?.radius || fromExplore.radius || '1rem',
    },
    borderStyle: chosen.cardStrategy?.includes('ruled') ? 'hairline' : 'soft',
    radius: spec?.radius || '1rem',
    shadows: spec?.shadows || '0 18px 50px rgba(0,0,0,.08)',
    navigation: {
      style: chosen.navigationStrategy || fromExplore.navigationStyle || 'top-bar',
      mobile: chosen.mobileStrategy || fromExplore.footer || 'collapse',
    },
    heroComposition: chosen.heroComposition || fromExplore.heroStyle || 'stacked',
    cardLanguage: chosen.cardStrategy || fromExplore.cards || 'grid',
    imageTreatment: chosen.imageTreatment || fromExplore.imageTreatment || 'cover',
    animation: {
      style: chosen.animation || spec?.animation || fromExplore.animation || 'fade',
      interaction: chosen.interactionStyle || fromExplore.interactions || 'subtle',
    },
    sectionComposition: {
      grid: chosen.gridStrategy || 'responsive',
      cta: chosen.ctaPlacement || 'hero-and-contact',
      footer: chosen.footerStrategy || fromExplore.footer || 'bar',
      layout: chosen.layoutStyle || fromExplore.layoutStyle || spec?.layout || 'stacked',
    },
    mode,
    novelty,
  }
}

export function designDnaBrief(dna) {
  if (!dna) return ''
  return [
    'DESIGN DNA (follow everywhere — do not invent per-section styles):',
    JSON.stringify(
      {
        visualDirection: dna.visualDirection,
        colorSystem: dna.colorSystem,
        typography: dna.typography,
        spacing: dna.spacing,
        navigation: dna.navigation,
        heroComposition: dna.heroComposition,
        cardLanguage: dna.cardLanguage,
        imageTreatment: dna.imageTreatment,
        animation: dna.animation,
        sectionComposition: dna.sectionComposition,
        novelty: dna.novelty,
        mode: dna.mode,
      },
      null,
      2,
    ),
  ].join('\n')
}
