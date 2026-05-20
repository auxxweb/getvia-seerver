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

function buildPrompt(sectionType, inputData) {
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
    return `${base}${extra}\nTask: Write a short business description (80-140 words).`
  }
  if (sectionType === 'landing') {
    return `${base}${extra}\nTask: Write landing page banner + welcome copy.\nOutput: 2 short paragraphs. First paragraph = banner description (<= 50 words). Second paragraph = welcome description (<= 50 words).`
  }
  if (sectionType === 'core') {
    return `${base}${extra}\nTask: Write a \"Core Services\" section title (max 8 words), a section intro (<= 50 words), and one service card description (<= 50 words).`
  }
  if (sectionType === 'products') {
    return `${base}${extra}\nTask: Write a short section description for \"Catalogue\" (<= 50 words) plus 1 product/service card description (<= 35 words).`
  }
  if (sectionType === 'offers') {
    return `${base}${extra}\nTask: Write promotional copy for an \"Offers\" block: a short section title (max 8 words) and an intro paragraph (<= 50 words) above offer cards.`
  }

  return `${base}${extra}\nTask: Generate helpful copy for section \"${clamp(sectionType, 40)}\". Keep it under 120 words.`
}

/**
 * Production OpenAI generator used by POST /api/owner/ai/generate.
 * Returns: { sectionType, text, generatedAt }
 */
export async function generateContent(sectionType, inputData = {}) {
  const client = getClient()
  const prompt = buildPrompt(sectionType, inputData)

  const resp = await client.chat.completions.create({
    model: modelName(),
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content:
          'You are a senior copywriter for a local business marketplace. Output plain text only.',
      },
      { role: 'user', content: prompt },
    ],
  })

  const text = String(resp.choices?.[0]?.message?.content || '').trim()
  if (!text) throw new HttpError(502, 'AI returned an empty response')

  return {
    sectionType,
    text,
    generatedAt: new Date().toISOString(),
  }
}

