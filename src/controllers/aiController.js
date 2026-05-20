import { generateContent } from '../services/ai.service.js'

export async function aiGenerate(req, res, next) {
  try {
    const { sectionType, inputData } = req.body
    const result = await generateContent(sectionType || 'generic', inputData || {})
    res.json({ ok: true, ...result })
  } catch (e) {
    next(e)
  }
}
