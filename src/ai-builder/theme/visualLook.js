/** Named visual looks the AI site can actually render. Not listing templates. */

export const VISUAL_LOOKS = ['claymorphism', 'glassmorphism', 'neumorphism', 'premium', 'modern']

export function resolveVisualLook(prompt) {
  const text = String(prompt || '').toLowerCase()
  if (/claymorph|clay morphism|\bclay\b/.test(text) && /design|style|look|card|button|website|site/.test(text)) {
    return 'claymorphism'
  }
  if (/claymorph|tactile appearance|pastel tones|pill-shaped|soft rounded shapes/.test(text)) return 'claymorphism'
  if (/glassmorph|frosted glass|glass morphism/.test(text)) return 'glassmorphism'
  if (/neumorph|soft ui|neomorph/.test(text)) return 'neumorphism'
  return null
}

export function isHardUnsupportedCapability(prompt) {
  const text = String(prompt || '')
  return /3d product configurator|\bwebgl\b|\bar try[- ]on\b|live booking calendar|stripe checkout|product customizer/i.test(
    text,
  )
}

export function lookLayout(look) {
  if (look === 'claymorphism') {
    return {
      nav: 'floating',
      hero: 'split',
      about: 'centered',
      cards: 'puffy',
      gallery: 'mosaic',
      contact: 'card',
      footer: 'soft',
    }
  }
  if (look === 'glassmorphism') {
    return {
      nav: 'bar',
      hero: 'overlay-panel',
      about: 'split',
      cards: 'bento',
      gallery: 'grid',
      contact: 'split',
      footer: 'bar',
    }
  }
  if (look === 'neumorphism') {
    return {
      nav: 'bar',
      hero: 'stacked',
      about: 'split',
      cards: 'soft',
      gallery: 'grid',
      contact: 'card',
      footer: 'soft',
    }
  }
  if (look === 'premium') {
    return {
      nav: 'bar',
      hero: 'overlay',
      about: 'split',
      cards: 'premium',
      gallery: 'grid',
      contact: 'split',
      footer: 'bar',
    }
  }
  if (look === 'modern') {
    return {
      nav: 'bar',
      hero: 'stacked',
      about: 'stacked',
      cards: 'grid',
      gallery: 'grid',
      contact: 'stacked',
      footer: 'bar',
    }
  }
  return {
    nav: 'bar',
    hero: 'stacked',
    about: 'stacked',
    cards: 'grid',
    gallery: 'grid',
    contact: 'stacked',
    footer: 'bar',
  }
}

export function lookStylePatch(look) {
  const layout = lookLayout(look)
  if (look === 'claymorphism') {
    return {
      visualStyle: 'claymorphism',
      cardStyle: 'puffy',
      radius: { card: '2xl' },
      shadows: { card: 'clay' },
      alignment: 'center',
      layout,
    }
  }
  if (look === 'glassmorphism') {
    return {
      visualStyle: 'glassmorphism',
      cardStyle: 'bento',
      radius: { card: 'xl' },
      shadows: { card: 'glass' },
      layout,
    }
  }
  if (look === 'neumorphism') {
    return {
      visualStyle: 'neumorphism',
      cardStyle: 'soft',
      radius: { card: 'xl' },
      shadows: { card: 'neu' },
      layout,
    }
  }
  if (look === 'premium') {
    return { visualStyle: 'premium', cardStyle: 'premium', radius: { card: 'xl' }, shadows: { card: 'strong' }, layout }
  }
  return { visualStyle: look || 'original', cardStyle: 'grid', radius: { card: 'lg' }, shadows: { card: 'soft' }, layout }
}
