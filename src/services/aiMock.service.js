/**
 * Placeholder AI content generator — swap for OpenAI / internal model later.
 */
export async function generateContent(sectionType, inputData = {}) {
  const summary = JSON.stringify(inputData).slice(0, 200)
  return {
    sectionType,
    text: `[AI draft] Polished copy for "${sectionType}" based on: ${summary || 'your business'}. Replace with real model output.`,
    generatedAt: new Date().toISOString(),
  }
}
