import { sanitizeAiText } from '../lib/sanitize.js'
import { completeJson } from '../openai/structuredOutput.js'

function clampWords(text, max) {
  const parts = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return parts.slice(0, max).join(' ')
}

function looksLikeInstruction(text) {
  const t = String(text || '')
  return (
    t.length > 70 ||
    /user request:|domains:|constraint:|you are |create a homepage|use this as|expert website|requirements:/i.test(t)
  )
}

function safeTitle(text, fallback) {
  const cleaned = clampWords(sanitizeAiText(text || ''), 8)
  if (!cleaned || looksLikeInstruction(cleaned) || looksLikeInstruction(text)) return fallback
  return cleaned
}

export function contentOpsFromProfile(profile, requirements) {
  return rewriteFromExisting(profile, requirements)
}

function rewriteFromExisting(profile, requirements) {
  const identity = profile?.identity || {}
  const services = profile?.content?.coreServices || []
  const products = profile?.content?.catalogue || []
  const offers = profile?.content?.offers || []
  const city = profile?.location?.city || ''
  const category = identity.category || ''

  const operations = []
  const bannerDesc = clampWords(
    [identity.description, category && city ? `${category} in ${city}` : category].filter(Boolean).join(' '),
    50,
  )

  operations.push({
    type: 'CONTENT_CHANGE',
    target: { sectionId: 'top' },
    changes: {
      landing: {
        bannerTitle: clampWords(identity.name || '', 8),
        bannerDescription: clampWords(bannerDesc, 50),
        welcomeTitle: clampWords(identity.name ? `About ${identity.name}` : '', 8),
        welcomeDescription: clampWords(identity.description || bannerDesc, 50),
      },
      description: identity.description,
    },
  })

  if (services.length) {
    operations.push({
      type: 'CONTENT_CHANGE',
      target: { sectionId: 'core-services' },
      changes: {
        coreServices: {
          title: profile.content.corePageTitle || 'Our services',
          description: profile.content.corePageDescription || '',
          items: services,
        },
      },
    })
  }
  if (products.length) {
    operations.push({
      type: 'CONTENT_CHANGE',
      target: { sectionId: 'catalogue' },
      changes: {
        catalogue: {
          title: profile.content.productsPageTitle || 'Catalogue',
          description: profile.content.productsPageDescription || '',
          items: products.map((p) => ({ ...p, name: p.name })),
        },
      },
    })
  }
  if (offers.length) {
    operations.push({
      type: 'CONTENT_CHANGE',
      target: { sectionId: 'offers' },
      changes: {
        offers: {
          title: profile.content.offersTitle || 'Offers',
          description: profile.content.offersDescription || '',
          items: offers,
        },
      },
    })
  }

  const reorder = (requirements?.changes || []).find((c) => c.property === 'ordering')
  if (reorder?.value) {
    operations.push({
      type: 'CONTENT_CHANGE',
      target: { sectionId: 'core-services' },
      changes: { reorderServices: String(reorder.value) },
    })
  }
  return operations
}

export async function contentAgent({ profile, requirements, usageCtx, signal }) {
  const operations = rewriteFromExisting(profile, requirements)
  const llm = await completeJson({
    tier: 'medium',
    schemaName: 'content_ops',
    usageCtx,
    signal,
    soft: true,
    system: `Write original one-page website copy from the business facts and the user's design request.
Do not copy listing-template headlines, CTAs, or section intros.
Use provided services, products, and offers when they exist; do not invent extra inventory.
Keep titles <= 8 words and descriptions <= 50 words.
Return JSON { landing, description }.`,
    user: JSON.stringify({
      name: profile?.identity?.name,
      category: profile?.identity?.category,
      city: profile?.location?.city,
      description: profile?.identity?.description,
      services: profile?.content?.coreServices,
      products: profile?.content?.catalogue,
      offers: profile?.content?.offers,
      request: requirements,
      userPrompt: requirements?.brief || requirements?.userPrompt,
    }),
  })
  if (llm.ok && llm.data?.landing) {
    operations.unshift({
      type: 'CONTENT_CHANGE',
      target: { sectionId: 'top' },
      changes: {
        landing: {
          bannerTitle: safeTitle(llm.data.landing.bannerTitle, clampWords(profile?.identity?.name || '', 8)),
          bannerDescription: clampWords(sanitizeAiText(llm.data.landing.bannerDescription || ''), 50),
          welcomeTitle: safeTitle(llm.data.landing.welcomeTitle, clampWords(profile?.identity?.name ? `About ${profile.identity.name}` : '', 8)),
          welcomeDescription: clampWords(sanitizeAiText(llm.data.landing.welcomeDescription || ''), 50),
        },
        description: sanitizeAiText(llm.data.description || profile?.identity?.description || '', { max: 2000 }),
      },
    })
  }
  return { operations }
}
