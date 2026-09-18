import { AIConversation, AIMessage } from '../../models/aiBuilderModels.js'
import { MAX_CONVERSATION_RECENT_MESSAGES } from '../constants.js'
import { sanitizeAiText } from '../lib/sanitize.js'

export async function appendMessage({ conversation, site, userId, role, content, jobId, metadata }) {
  const msg = await AIMessage.create({
    conversationId: conversation._id,
    siteId: site._id,
    businessId: site.businessId,
    userId: role === 'user' ? userId : null,
    role,
    content: sanitizeAiText(content, { max: 8000 }),
    jobId: jobId || null,
    metadata: metadata || {},
  })
  conversation.lastMessageAt = new Date()
  await conversation.save()
  return msg
}

export async function recentMessages(conversationId, limit = MAX_CONVERSATION_RECENT_MESSAGES) {
  const rows = await AIMessage.find({ conversationId }).sort({ createdAt: -1 }).limit(limit).lean()
  return rows.reverse()
}

export async function maybeSummarize(conversation) {
  const count = await AIMessage.countDocuments({ conversationId: conversation._id })
  if (count < 20) return
  const older = await AIMessage.find({ conversationId: conversation._id })
    .sort({ createdAt: 1 })
    .limit(Math.max(0, count - MAX_CONVERSATION_RECENT_MESSAGES))
    .select('role content')
    .lean()
  const summary = older
    .map((m) => `${m.role}: ${String(m.content || '').slice(0, 120)}`)
    .join('\n')
    .slice(0, 2000)
  conversation.summarizedContext = summary
  await conversation.save()
}

export function serializeMessage(m) {
  const o = typeof m.toObject === 'function' ? m.toObject() : m
  return {
    id: String(o._id),
    role: o.role,
    content: o.content,
    jobId: o.jobId ? String(o.jobId) : null,
    createdAt: o.createdAt,
    metadata: o.metadata || {},
  }
}

export function assistantJobSummary(job) {
  if (job.result?.outcome === 'NEEDS_CLARIFICATION' || job.result?.outcome === 'UNSUPPORTED_CAPABILITY') {
    return job.result.message || 'I need more detail before changing the website. Nothing was saved.'
  }
  const failCode = String(job.result?.code || job.error?.code || '')
  if (
    failCode === 'OPENAI_QUOTA' ||
    failCode === 'AI_TOKENS_EMPTY' ||
    /credits are exhausted|tokens are empty|no ai credits/i.test(String(job.result?.message || job.error?.message || ''))
  ) {
    return (
      job.result?.message ||
      job.error?.message ||
      'Website builder OpenAI credits are exhausted. Your change was not applied.'
    )
  }
  if (job.result?.outcome === 'FAILED' || job.status === 'FAILED') {
    return job.result?.message || job.error?.message || 'I could not change the website. Nothing was saved.'
  }
  if (job.result?.saved && job.result?.message) return `${job.result.message} Changes were auto-saved.`
  if (job.result?.message) return job.result.message
  if (job.result?.needsAttention) {
    return job.result.message || 'Preview is ready. You can keep editing from chat.'
  }
  if (job.result?.questions?.length) {
    return job.result.questions.map((q) => q.prompt || q).join('\n')
  }
  const applied = job.result?.applied || []
  if (applied.length) {
    return `Done — ${applied.map((a) => a.summary).filter(Boolean).slice(0, 6).join('; ')}.`
  }
  if (job.type === 'DESIGNER_EDIT') {
    return 'I could not change the website. Nothing was saved.'
  }
  return 'Your original one-page website is ready. Review the preview, then publish when you are happy.'
}
