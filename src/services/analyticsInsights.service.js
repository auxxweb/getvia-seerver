import OpenAI from 'openai'
import { HttpError } from '../middleware/errorHandler.js'
import { getBusinessDashboard } from '../services/analytics/analyticsQuery.service.js'

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new HttpError(503, 'AI insights are not configured. Set OPENAI_API_KEY on the server.')
  }
  return new OpenAI({ apiKey })
}

function modelName() {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini'
}

/**
 * Build actionable suggestions from analytics KPIs (requires aiInsightsEnabled on plan).
 */
export async function generateAnalyticsInsights(businessId, preset = 'last_30d') {
  const dashboard = await getBusinessDashboard(businessId, { preset })
  const kpis = dashboard?.kpis || {}
  const topSections = dashboard?.topSections || []
  const trend = dashboard?.trend || []

  const summary = {
    preset,
    profileViews: kpis.profileViews ?? 0,
    uniqueVisitors: kpis.uniqueVisitors ?? 0,
    whatsappClicks: kpis.whatsappClicks ?? 0,
    callClicks: kpis.callClicks ?? 0,
    saveClicks: kpis.saveClicks ?? 0,
    ctr: kpis.ctr ?? 0,
    topSections: topSections.slice(0, 5),
    trendPoints: trend.length,
  }

  const client = getClient()
  const completion = await client.chat.completions.create({
    model: modelName(),
    temperature: 0.4,
    messages: [
      {
        role: 'system',
        content:
          'You are a local business growth advisor. Given analytics JSON, return 4-6 short bullet suggestions to improve the business profile. Focus on concrete actions (offers, gallery, CTAs, sections with low engagement). Plain text bullets only, one per line, no markdown.',
      },
      {
        role: 'user',
        content: `Analytics data:\n${JSON.stringify(summary, null, 2)}`,
      },
    ],
  })

  const text = String(completion.choices?.[0]?.message?.content || '').trim()
  const suggestions = text
    .split('\n')
    .map((line) => line.replace(/^[-*•\d.)]+\s*/, '').trim())
    .filter(Boolean)

  return { suggestions, summary }
}
