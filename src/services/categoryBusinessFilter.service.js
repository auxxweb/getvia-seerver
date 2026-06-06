import { Category } from '../models/Category.js'

export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function isLikelyMongoObjectId(id) {
  return typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id)
}

/** Case-insensitive exact match on a single string field (not substring). */
export function exactFieldRegex(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return null
  return new RegExp(`^${escapeRegex(trimmed)}$`, 'i')
}

function normalizeLabel(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function subcategoryTitle(raw) {
  if (typeof raw === 'string') return raw.trim()
  if (raw && typeof raw === 'object') return String(raw.title || raw.name || '').trim()
  return ''
}

/**
 * Resolve category document from id or exact name.
 * @param {{ categoryId?: string, category?: string }} params
 */
export async function resolveCategoryDoc({ categoryId, category }) {
  if (categoryId && isLikelyMongoObjectId(String(categoryId))) {
    return Category.findById(String(categoryId)).lean()
  }
  const name = String(category || '').trim()
  if (!name) return null
  const re = exactFieldRegex(name)
  if (!re) return null
  return Category.findOne({ name: re }).lean()
}

/**
 * Strict category/subcategory match for business listings.
 * - Prefer categoryId when known (no loose substring on category text).
 * - Legacy rows without categoryId: exact category name only.
 * - Subcategory: exact title match only.
 *
 * @returns {Promise<object[]>} Mongo filter fragments to AND into a query
 */
export async function buildStrictCategoryClauses({ categoryId, category, subcategory }) {
  const clauses = []
  const catDoc = await resolveCategoryDoc({ categoryId, category })

  if (catDoc?._id) {
    const exactNameRe = exactFieldRegex(catDoc.name)
    const legacyOr = [{ categoryId: catDoc._id }]
    if (exactNameRe) {
      legacyOr.push({
        $and: [
          { $or: [{ categoryId: null }, { categoryId: { $exists: false } }] },
          { category: exactNameRe },
        ],
      })
    }
    clauses.push({ $or: legacyOr })
  } else if (category) {
    const re = exactFieldRegex(category)
    if (re) clauses.push({ category: re })
  }

  const subRaw = String(subcategory || '').trim()
  if (subRaw) {
    if (catDoc?.subcategories?.length) {
      const allowed = new Set(
        catDoc.subcategories.map((s) => normalizeLabel(subcategoryTitle(s))).filter(Boolean),
      )
      const normalizedSub = normalizeLabel(subRaw)
      if (allowed.has(normalizedSub)) {
        clauses.push({ subcategory: exactFieldRegex(subRaw) })
      } else {
        // Unknown sub slug — return nothing rather than loose partial matches.
        clauses.push({ $expr: { $eq: [1, 0] } })
      }
    } else {
      clauses.push({ subcategory: exactFieldRegex(subRaw) })
    }
  }

  return clauses
}

/**
 * Parent category match for listing counts (categoryId + exact legacy name).
 * @param {import('mongoose').Types.ObjectId} categoryObjectId
 * @param {string} categoryName
 */
export function buildParentCategoryMatch(categoryObjectId, categoryName) {
  const exactNameRe = exactFieldRegex(categoryName)
  const or = [{ categoryId: categoryObjectId }]
  if (exactNameRe) {
    or.push({
      $and: [
        { $or: [{ categoryId: null }, { categoryId: { $exists: false } }] },
        { category: exactNameRe },
      ],
    })
  }
  return { $or: or }
}

/**
 * Subcategory listing count match under a parent category.
 */
export function buildSubcategoryCountMatch(parentMatch, subcategoryTitleValue) {
  const subRe = exactFieldRegex(subcategoryTitleValue)
  if (!subRe) return parentMatch
  return { $and: [parentMatch, { subcategory: subRe }] }
}
