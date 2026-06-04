import { SupportMessage } from '../models/SupportMessage.js'
import { HelpArticle } from '../models/HelpArticle.js'
import { LegalDocument, LEGAL_DOC_TYPES } from '../models/LegalDocument.js'
import { HttpError } from '../middleware/errorHandler.js'

function normalizeAudience(raw) {
  const a = String(raw || 'consumer').trim().toLowerCase()
  if (a === 'business' || a === 'business_owner') return 'business'
  return 'consumer'
}

function normalizeDocType(raw) {
  const t = String(raw || '').trim().toLowerCase()
  if (LEGAL_DOC_TYPES.includes(t)) return t
  throw new HttpError(400, 'Invalid document type')
}

export async function listPublicHelpArticles(req, res, next) {
  try {
    const audience = normalizeAudience(req.query.audience)
    const items = await HelpArticle.find({ audience, isPublished: true })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean()
    res.json({ ok: true, items })
  } catch (e) {
    next(e)
  }
}

export async function getPublicLegalDocument(req, res, next) {
  try {
    const audience = normalizeAudience(req.query.audience)
    const docType = normalizeDocType(req.params.docType)
    const doc = await LegalDocument.findOne({ audience, docType, isPublished: true }).lean()
    if (!doc) throw new HttpError(404, 'Document not found')
    res.json({ ok: true, document: doc })
  } catch (e) {
    next(e)
  }
}

export async function submitSupportMessage(req, res, next) {
  try {
    const audience = normalizeAudience(req.body.audience)
    const issue = String(req.body.issue || '').trim()
    if (!issue) throw new HttpError(400, 'Please describe your issue.')

    const user = req.user || null
    let name = String(req.body.name || '').trim()
    let phone = String(req.body.phone || '').trim()

    if (user) {
      name = name || user.name || user.email || 'User'
      phone = phone || user.phone || ''
      if (audience === 'business' && user.role !== 'BUSINESS_OWNER') {
        throw new HttpError(403, 'Business support is for business accounts only.')
      }
      if (audience === 'consumer' && user.role === 'BUSINESS_OWNER') {
        throw new HttpError(400, 'Use business support from your business admin panel.')
      }
    } else {
      if (!name) throw new HttpError(400, 'Name is required.')
      if (!phone) throw new HttpError(400, 'Phone number is required.')
    }

    const row = await SupportMessage.create({
      audience,
      userId: user?._id,
      name,
      phone,
      issue,
    })
    res.status(201).json({ ok: true, message: row })
  } catch (e) {
    next(e)
  }
}

export async function listSupportMessagesAdmin(req, res, next) {
  try {
    const audience = normalizeAudience(req.query.audience)
    const items = await SupportMessage.find({ audience })
      .sort({ createdAt: -1 })
      .populate('userId', 'name email role')
      .lean()
    res.json({ ok: true, items })
  } catch (e) {
    next(e)
  }
}

export async function patchSupportMessageAdmin(req, res, next) {
  try {
    const { status } = req.body
    if (status && !['open', 'resolved'].includes(status)) {
      throw new HttpError(400, 'Invalid status')
    }
    const row = await SupportMessage.findByIdAndUpdate(
      req.params.id,
      status ? { status } : {},
      { new: true },
    ).lean()
    if (!row) throw new HttpError(404, 'Message not found')
    res.json({ ok: true, message: row })
  } catch (e) {
    next(e)
  }
}

export async function listHelpArticlesAdmin(req, res, next) {
  try {
    const filter = {}
    if (req.query.audience) filter.audience = normalizeAudience(req.query.audience)
    const items = await HelpArticle.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean()
    res.json({ ok: true, items })
  } catch (e) {
    next(e)
  }
}

export async function createHelpArticleAdmin(req, res, next) {
  try {
    const audience = normalizeAudience(req.body.audience)
    const title = String(req.body.title || '').trim()
    if (!title) throw new HttpError(400, 'Title is required.')
    const row = await HelpArticle.create({
      audience,
      title,
      description: String(req.body.description || '').trim(),
      link: String(req.body.link || '').trim(),
      isPublished: req.body.isPublished !== false,
      sortOrder: Number(req.body.sortOrder) || 0,
    })
    res.status(201).json({ ok: true, article: row })
  } catch (e) {
    next(e)
  }
}

export async function updateHelpArticleAdmin(req, res, next) {
  try {
    const patch = {}
    if (req.body.audience != null) patch.audience = normalizeAudience(req.body.audience)
    if (req.body.title != null) patch.title = String(req.body.title).trim()
    if (req.body.description != null) patch.description = String(req.body.description).trim()
    if (req.body.link != null) patch.link = String(req.body.link).trim()
    if (req.body.isPublished != null) patch.isPublished = Boolean(req.body.isPublished)
    if (req.body.sortOrder != null) patch.sortOrder = Number(req.body.sortOrder) || 0
    const row = await HelpArticle.findByIdAndUpdate(req.params.id, patch, { new: true }).lean()
    if (!row) throw new HttpError(404, 'Article not found')
    res.json({ ok: true, article: row })
  } catch (e) {
    next(e)
  }
}

export async function deleteHelpArticleAdmin(req, res, next) {
  try {
    const row = await HelpArticle.findByIdAndDelete(req.params.id)
    if (!row) throw new HttpError(404, 'Article not found')
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
}

export async function listLegalDocumentsAdmin(req, res, next) {
  try {
    const filter = {}
    if (req.query.audience) filter.audience = normalizeAudience(req.query.audience)
    const items = await LegalDocument.find(filter).sort({ audience: 1, docType: 1 }).lean()
    res.json({ ok: true, items })
  } catch (e) {
    next(e)
  }
}

export async function upsertLegalDocumentAdmin(req, res, next) {
  try {
    const audience = normalizeAudience(req.body.audience)
    const docType = normalizeDocType(req.body.docType)
    const title = String(req.body.title || '').trim()
    if (!title) throw new HttpError(400, 'Title is required.')
    const body = String(req.body.body || '')
    const isPublished = req.body.isPublished !== false
    const row = await LegalDocument.findOneAndUpdate(
      { audience, docType },
      { audience, docType, title, body, isPublished },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean()
    res.json({ ok: true, document: row })
  } catch (e) {
    next(e)
  }
}

export async function listOwnerSupportMessages(req, res, next) {
  try {
    const items = await SupportMessage.find({
      audience: 'business',
      userId: req.user._id,
    })
      .sort({ createdAt: -1 })
      .lean()
    res.json({ ok: true, items })
  } catch (e) {
    next(e)
  }
}

export async function submitOwnerSupportMessage(req, res, next) {
  try {
    const issue = String(req.body.issue || '').trim()
    if (!issue) throw new HttpError(400, 'Please describe your issue.')
    const row = await SupportMessage.create({
      audience: 'business',
      userId: req.user._id,
      name: req.user.name || req.user.email || '',
      phone: req.user.phone || '',
      issue,
    })
    res.status(201).json({ ok: true, message: row })
  } catch (e) {
    next(e)
  }
}
