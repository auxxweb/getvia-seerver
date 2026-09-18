/**
 * Convert Website State overlays into Business / BusinessContent patches.
 * Canonical write-back on publish. Does not invent new inventory items.
 */

function str(v) {
  return v == null ? undefined : String(v)
}

function clampWords(text, max) {
  const parts = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return parts.slice(0, max).join(' ')
}

export function websiteStateToBusinessPatch(state) {
  if (!state || typeof state !== 'object') return {}
  if (state.engine === 'ai' || !state.templateId) return {}
  const patch = {}
  if (state.content?.description != null) patch.description = clampWords(state.content.description, 50)
  if (state.templateId || state.theme?.colors) {
    const colors = state.theme?.colors || {}
    patch.themeSettings = {
      ...(state.templateId ? { template: state.templateId } : {}),
      ...(colors.brandPrimary ? { primaryColor: colors.brandPrimary } : {}),
      ...(colors.brandSecondary ? { secondaryColor: colors.brandSecondary } : {}),
    }
    if (state.templateId && Object.keys(colors).length) {
      patch.themeSettings.themeColorPresets = {
        [state.templateId]: colors,
      }
    }
  }
  return patch
}

export function websiteStateToContentPatch(state) {
  if (!state || typeof state !== 'object') return {}
  const landing = state.content?.landing || {}
  const offers = state.content?.offers || {}
  const core = state.content?.coreServices || {}
  const catalogue = state.content?.catalogue || {}
  const feed = state.content?.feed || {}

  const patch = {
    landingSection: {
      bannerTitle: clampWords(str(landing.bannerTitle) ?? '', 8),
      bannerDescription: clampWords(str(landing.bannerDescription) ?? '', 50),
      bannerImageUrl: str(landing.bannerImageUrl) ?? '',
      bannerImagePublicId: str(landing.bannerImagePublicId) ?? '',
      bannerCtaLabel: str(landing.bannerCtaLabel) ?? '',
      bannerCtaLink: str(landing.bannerCtaLink) ?? '',
      welcomeTitle: clampWords(str(landing.welcomeTitle) ?? '', 8),
      welcomeDescription: clampWords(str(landing.welcomeDescription) ?? '', 50),
      welcomeImageUrl: str(landing.welcomeImageUrl) ?? '',
      welcomeImagePublicId: str(landing.welcomeImagePublicId) ?? '',
      welcomeCtaLabel: str(landing.welcomeCtaLabel) ?? '',
      welcomeCtaLink: str(landing.welcomeCtaLink) ?? '',
    },
    offersPageTitle: clampWords(str(offers.title) ?? '', 8),
    offersPageDescription: clampWords(str(offers.description) ?? '', 50),
    offers: Array.isArray(offers.items)
      ? offers.items.map((row) => ({
          ...(row.id && !String(row.id).startsWith('offer-') ? { _id: row.id } : {}),
          title: row.title || '',
          description: row.description || '',
          image: row.image || '',
          imagePublicId: row.imagePublicId || '',
          link: row.link || '',
          linkLabel: row.linkLabel || '',
          priceActual: row.priceActual || '',
          priceOffer: row.priceOffer || '',
        }))
      : undefined,
    corePageTitle: clampWords(str(core.title) ?? '', 8),
    corePageDescription: clampWords(str(core.description) ?? '', 50),
    coreServices: Array.isArray(core.items)
      ? core.items.map((row) => ({
          ...(row.id && !String(row.id).startsWith('svc-') ? { _id: row.id } : {}),
          title: row.title || '',
          description: row.description || '',
          imageUrl: row.imageUrl || '',
          imagePublicId: row.imagePublicId || '',
          links: row.links || '',
          linkLabel: row.linkLabel || '',
        }))
      : undefined,
    productsPageTitle: clampWords(str(catalogue.title) ?? '', 8),
    productsPageDescription: clampWords(str(catalogue.description) ?? '', 50),
    catalogue: Array.isArray(catalogue.items)
      ? catalogue.items.map((row) => ({
          ...(row.id && !String(row.id).startsWith('cat-') ? { _id: row.id } : {}),
          name: row.name || row.title || '',
          description: row.description || '',
          image: row.image || '',
          imagePublicId: row.imagePublicId || '',
          price: row.price || '',
          link: row.link || '',
          linkLabel: row.linkLabel || '',
        }))
      : undefined,
    feedPageTitle: str(feed.title) ?? '',
    feedPageDescription: str(feed.description) ?? '',
    profileFeed: Array.isArray(feed.items)
      ? feed.items.map((row) => ({
          ...(row.id && !String(row.id).startsWith('feed-') ? { _id: row.id } : {}),
          title: row.title || '',
          description: row.description || '',
          image: row.image || '',
          imagePublicId: row.imagePublicId || '',
          link: row.link || '',
        }))
      : undefined,
  }

  if (Array.isArray(state.content?.gallery)) {
    patch.gallery = state.content.gallery.filter(Boolean)
  }

  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) delete patch[key]
  }
  return patch
}
