import OpenAI from 'openai'
import { HttpError } from '../middleware/errorHandler.js'

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new HttpError(503, 'AI is not configured. Set OPENAI_API_KEY on the server.')
  }
  return new OpenAI({ apiKey })
}

function modelName() {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini'
}

function clamp(s, max) {
  const str = String(s || '').trim()
  return str.length > max ? str.slice(0, max) : str
}

function countWords(text) {
  const t = String(text || '').trim()
  if (!t) return 0
  return t.split(/\s+/).length
}

function clampWords(value, limit) {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return parts.slice(0, limit).join(' ')
}

const LANDING_FIELD_LIMITS = {
  landingBannerTitle: 8,
  landingBannerDescription: 50,
  landingWelcomeTitle: 8,
  landingWelcomeDescription: 50,
}

const LANDING_FIELD_LABELS = {
  landingBannerTitle: 'landing banner title',
  landingBannerDescription: 'landing banner description',
  landingWelcomeTitle: 'welcome title',
  landingWelcomeDescription: 'welcome description',
}

const OFFERS_FIELD_LIMITS = {
  offersPageTitle: 8,
  offersPageDescription: 50,
}

const OFFERS_FIELD_LABELS = {
  offersPageTitle: 'offers section title',
  offersPageDescription: 'offers section description',
}

const CORE_FIELD_LIMITS = {
  corePageTitle: 8,
  corePageDescription: 50,
}

const CORE_FIELD_LABELS = {
  corePageTitle: 'core services section title',
  corePageDescription: 'core services section description',
}

const PRODUCTS_FIELD_LIMITS = {
  productsPageTitle: 8,
  productsPageDescription: 50,
}

const PRODUCTS_FIELD_LABELS = {
  productsPageTitle: 'catalogue section title',
  productsPageDescription: 'catalogue section description',
}

const AI_FIELD_WORD_LIMITS = {
  ...LANDING_FIELD_LIMITS,
  ...OFFERS_FIELD_LIMITS,
  ...CORE_FIELD_LIMITS,
  ...PRODUCTS_FIELD_LIMITS,
}

function buildPrompt(sectionType, inputData) {
  const fieldKey = clamp(inputData.fieldKey || '', 80)
  const businessName = clamp(inputData.businessName || inputData.name, 80)
  const category = clamp(inputData.categoryLabel || inputData.category, 80)
  const subcategory = clamp(inputData.subcategoryTitle || inputData.subcategory, 80)
  const city = clamp(inputData.city, 80)
  const tone = clamp(inputData.tone || 'friendly, professional, simple English', 120)
  const userPrompt = clamp(inputData.prompt, 600)

  const ctx = [
    businessName ? `Business: ${businessName}` : null,
    category ? `Category: ${category}` : null,
    subcategory ? `Subcategory: ${subcategory}` : null,
    city ? `City: ${city}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const base = `Write marketing copy for an Indian business listing.\nTone: ${tone}.\nAvoid emojis.\nAvoid fake claims.\nKeep it clear and specific.\n\nContext:\n${ctx || 'N/A'}\n`
  const extra = userPrompt ? `\nUser request:\n${userPrompt}\n` : ''

  if (sectionType === 'description') {
    return `${base}${extra}\nTask: Write a business description using exactly 50 words — no more, no fewer. Output plain text only: one paragraph, exactly 50 words.`
  }
  if (sectionType === 'landing' && LANDING_FIELD_LIMITS[fieldKey]) {
    const max = LANDING_FIELD_LIMITS[fieldKey]
    const label = LANDING_FIELD_LABELS[fieldKey]
    return `${base}${extra}\nTask: Write a ${label} using at most ${max} words. Output plain text only — copy for this field only, with no labels or headings.`
  }
  if (sectionType === 'landing') {
    return `${base}${extra}\nTask: Write landing page banner + welcome copy.\nOutput format (use these exact labels):\nBANNER_TITLE: (max 8 words)\nBANNER_DESCRIPTION: (max 50 words)\nWELCOME_TITLE: (max 8 words)\nWELCOME_DESCRIPTION: (max 50 words)`
  }
  if (sectionType === 'core' && CORE_FIELD_LIMITS[fieldKey]) {
    const max = CORE_FIELD_LIMITS[fieldKey]
    const label = CORE_FIELD_LABELS[fieldKey]
    return `${base}${extra}\nTask: Write a ${label} using at most ${max} words. Output plain text only — copy for this field only, with no labels or headings.`
  }
  if (sectionType === 'core') {
    return `${base}${extra}\nTask: Write core services copy.\nOutput format (use these exact labels):\nCORE_TITLE: (max 8 words)\nCORE_DESCRIPTION: (max 50 words)\nCARD_TITLE: (max 8 words)\nCARD_DESCRIPTION: (max 50 words)`
  }
  if (sectionType === 'products' && PRODUCTS_FIELD_LIMITS[fieldKey]) {
    const max = PRODUCTS_FIELD_LIMITS[fieldKey]
    const label = PRODUCTS_FIELD_LABELS[fieldKey]
    return `${base}${extra}\nTask: Write a ${label} using at most ${max} words. Output plain text only — copy for this field only, with no labels or headings.`
  }
  if (sectionType === 'products') {
    return `${base}${extra}\nTask: Write catalogue / products copy.\nOutput format (use these exact labels):\nCATALOGUE_TITLE: (max 8 words)\nCATALOGUE_DESCRIPTION: (max 50 words)\nITEM_TITLE: (max 8 words)\nITEM_DESCRIPTION: (max 50 words)`
  }
  if (sectionType === 'offers' && OFFERS_FIELD_LIMITS[fieldKey]) {
    const max = OFFERS_FIELD_LIMITS[fieldKey]
    const label = OFFERS_FIELD_LABELS[fieldKey]
    return `${base}${extra}\nTask: Write an ${label} using at most ${max} words. Output plain text only — copy for this field only, with no labels or headings.`
  }
  if (sectionType === 'offers') {
    return `${base}${extra}\nTask: Write promotional copy for an Offers block.\nOutput format (use these exact labels):\nOFFERS_TITLE: (max 8 words)\nOFFERS_DESCRIPTION: (max 50 words)\nCARD_TITLE: (max 8 words)\nCARD_DESCRIPTION: (max 50 words)`
  }

  return `${base}${extra}\nTask: Generate helpful copy for section \"${clamp(sectionType, 40)}\". Keep it under 120 words.`
}

/**
 * Production OpenAI generator used by POST /api/owner/ai/generate.
 * Returns: { sectionType, text, generatedAt }
 */
async function callModel(client, prompt, systemContent) {
  const resp = await client.chat.completions.create({
    model: modelName(),
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content: systemContent,
      },
      { role: 'user', content: prompt },
    ],
  })

  return String(resp.choices?.[0]?.message?.content || '').trim()
}

async function generateDescriptionExactly50(client, prompt) {
  const systemContent =
    'You are a senior copywriter for a local business marketplace. Output plain text only. When asked for a word count, match it exactly.'

  let text = await callModel(client, prompt, systemContent)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const wordCount = countWords(text)
    if (wordCount === 50) return text
    if (wordCount > 50) return clampWords(text, 50)

    text = await callModel(
      client,
      `${prompt}\n\nYour previous response was ${wordCount} words. Rewrite the business description so it contains exactly 50 words.`,
      systemContent,
    )
  }

  const finalCount = countWords(text)
  if (finalCount > 50) return clampWords(text, 50)
  return text
}

function postProcessAiText(sectionType, inputData, text) {
  const fieldKey = clamp(inputData.fieldKey || '', 80)
  if (AI_FIELD_WORD_LIMITS[fieldKey]) {
    return clampWords(text, AI_FIELD_WORD_LIMITS[fieldKey])
  }
  return text
}

export async function generateContent(sectionType, inputData = {}) {
  const client = getClient()
  const prompt = buildPrompt(sectionType, inputData)
  const systemContent =
    'You are a senior copywriter for a local business marketplace. Output plain text only. When asked for a word limit, stay within it.'

  let text =
    sectionType === 'description'
      ? await generateDescriptionExactly50(client, prompt)
      : await callModel(client, prompt, systemContent)

  text = postProcessAiText(sectionType, inputData, text)

  if (!text) throw new HttpError(502, 'AI returned an empty response')

  return {
    sectionType,
    text,
    generatedAt: new Date().toISOString(),
  }
}

