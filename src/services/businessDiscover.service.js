import { Business } from '../models/Business.js'
import { User } from '../models/User.js'
import { buildStrictCategoryClauses } from './categoryBusinessFilter.service.js'

/** Circular search: local first, then widen (nearest → farthest). */
const RADIUS_STEPS_M = [2_000, 5_000, 10_000, 25_000, 50_000, 100_000, 200_000]
const MAX_RESULTS = 2000
const PER_RADIUS_FETCH_CAP = 2000

function parseFiniteNumber(value) {
  const n = typeof value === 'number' ? value : Number(String(value))
  return Number.isFinite(n) ? n : null
}

function clampNumber(n, min, max) {
  return Math.min(Math.max(n, min), max)
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** "stays" → also match "stay"; multi-word queries match any word. */
function searchTermsForQuery(qStr) {
  const q = String(qStr || '').trim()
  if (!q) return []

  const terms = new Set()
  const add = (t) => {
    const w = String(t || '').trim().toLowerCase()
    if (w.length < 2) return
    terms.add(w)
    if (w.length > 3 && /s$/i.test(w)) terms.add(w.slice(0, -1))
    if (w.length > 2 && !/s$/i.test(w)) terms.add(`${w}s`)
  }

  add(q)
  for (const part of q.split(/\s+/)) add(part)

  return [...terms]
}

async function publicMatch() {
  const blockedOwnerIds = await User.find({ isBlocked: true, role: 'BUSINESS_OWNER' }).distinct('_id')
  return {
    approvalStatus: 'APPROVED',
    ownerId: { $nin: blockedOwnerIds },
  }
}

/** Match name, description, city, address (any search term). */
function buildTextFilter(qStr, { excludeCategoryFields = false } = {}) {
  const terms = searchTermsForQuery(qStr)
  if (!terms.length) return null

  const fieldExprs = []
  for (const term of terms) {
    const esc = escapeRegex(term)
    const re = new RegExp(esc, 'i')
    fieldExprs.push({ name: re })
    if (!excludeCategoryFields) {
      fieldExprs.push({ category: re }, { subcategory: re })
    }
    fieldExprs.push(
      { description: re },
      { city: re },
      { formattedAddress: re },
      { address: re },
    )
  }
  return { $or: fieldExprs }
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function businessLatLng(b) {
  const gp = b.mapLocation?.geoPoint?.coordinates
  if (Array.isArray(gp) && gp.length >= 2) {
    const lng = Number(gp[0])
    const lat = Number(gp[1])
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }
  const ml = b.mapLocation?.coordinates
  if (ml?.lat != null && ml?.lng != null) {
    const lat = Number(ml.lat)
    const lng = Number(ml.lng)
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }
  const loc = b.location
  if (loc?.type === 'Point' && Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
    const lng = Number(loc.coordinates[0])
    const lat = Number(loc.coordinates[1])
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }
  return null
}

function withDistanceFromCenter(rows, lat, lng) {
  if (lat == null || lng == null) return rows
  return rows.map((b) => {
    if (Number.isFinite(Number(b.distanceMeters))) return b
    const coords = businessLatLng(b)
    if (!coords) return { ...b, distanceMeters: null }
    return {
      ...b,
      distanceMeters: haversineMeters(lat, lng, coords.lat, coords.lng),
    }
  })
}

async function geoNearOnKey({ lat, lng, radiusM, match, geoKey, textFilter, limit }) {
  const geoQuery = {
    ...match,
    [`${geoKey}.type`]: 'Point',
    [`${geoKey}.coordinates.0`]: { $type: 'number' },
    [`${geoKey}.coordinates.1`]: { $type: 'number' },
  }
  if (textFilter) {
    geoQuery.$and = [...(geoQuery.$and || []), textFilter]
  }

  const pipeline = [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        key: geoKey,
        distanceField: 'distanceMeters',
        spherical: true,
        maxDistance: radiusM,
        query: geoQuery,
      },
    },
    { $limit: Math.min(limit, PER_RADIUS_FETCH_CAP) },
  ]

  return Business.aggregate(pipeline)
}

async function collectGeoResults({ lat, lng, radiusM, match, textFilter, fetchCap }) {
  const seen = new Map()
  const keys = ['location', 'mapLocation.geoPoint']

  for (const geoKey of keys) {
    let batch = []
    try {
      batch = await geoNearOnKey({
        lat,
        lng,
        radiusM,
        match,
        geoKey,
        textFilter,
        limit: fetchCap,
      })
    } catch {
      /* skip invalid geo rows */
    }

    for (const row of batch) {
      const id = String(row._id)
      const prev = seen.get(id)
      const m = Number(row.distanceMeters)
      if (!prev || (Number.isFinite(m) && m < prev.distanceMeters)) {
        seen.set(id, row)
      }
    }
  }

  return [...seen.values()]
}

function sortByDistanceAsc(rows) {
  return [...rows].sort((a, b) => {
    const da = Number(a.distanceMeters)
    const db = Number(b.distanceMeters)
    if (Number.isFinite(da) && Number.isFinite(db)) return da - db
    if (Number.isFinite(da)) return -1
    if (Number.isFinite(db)) return 1
    return String(a.name || '').localeCompare(String(b.name || ''))
  })
}

function mergeBusinessRows(geoRows, textRows, lat, lng) {
  const seen = new Map()

  for (const row of geoRows) {
    seen.set(String(row._id), row)
  }

  const textWithDist = withDistanceFromCenter(textRows, lat, lng)
  for (const row of textWithDist) {
    const id = String(row._id)
    const prev = seen.get(id)
    if (!prev) {
      seen.set(id, row)
      continue
    }
    const m = Number(row.distanceMeters)
    const pm = Number(prev.distanceMeters)
    if (Number.isFinite(m) && (!Number.isFinite(pm) || m < pm)) {
      seen.set(id, { ...prev, ...row, distanceMeters: m })
    }
  }

  return sortByDistanceAsc([...seen.values()])
}

async function fetchAllTextMatches({ match, textFilter }) {
  const filter = { ...match }
  if (textFilter) {
    if (filter.$and) filter.$and.push(textFilter)
    else filter.$and = [textFilter]
  }

  return Business.find(filter)
    .sort({ isFeatured: -1, isTrending: -1, ratingAvg: -1, createdAt: -1 })
    .limit(MAX_RESULTS)
    .lean()
}

function serializeDiscoverRow(b) {
  const m = Number(b.distanceMeters)
  const km = Number.isFinite(m) ? m / 1000 : null
  return {
    profileId: b.publicId,
    id: b._id.toString(),
    name: b.name,
    category: b.category,
    subcategory: b.subcategory,
    logo: b.logo,
    address: b.address,
    formattedAddress: b.formattedAddress,
    city: b.city,
    state: b.state,
    isVerified: b.isVerified,
    isFeatured: b.isFeatured,
    plan: b.plan,
    ratingAvg: b.ratingAvg,
    reviewCount: b.reviewCount,
    location: b.location,
    mapLocation: b.mapLocation || null,
    phone: b.phone,
    whatsappHref: b.whatsappHref,
    template:
      b.themeSettings && typeof b.themeSettings === 'object' && b.themeSettings.template
        ? String(b.themeSettings.template).trim()
        : 'template-one',
    distanceMeters: Number.isFinite(m) ? Math.round(m) : null,
    distanceKm: km !== null ? Math.round(km * 10) / 10 : null,
  }
}

/**
 * Smart discover: all text-related profiles, geo-ranked nearest → farthest, expanding radius.
 */
export async function discoverBusinesses(query) {
  const qStr = String(query.q || '').trim()
  const lat = parseFiniteNumber(query.lat)
  const lng = parseFiniteNumber(query.lng)
  const hasGeo =
    lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180

  const wantAll = query.all === '1' || query.all === 'true'
  const limit = wantAll
    ? MAX_RESULTS
    : Math.trunc(clampNumber(Number(query.limit) || MAX_RESULTS, 1, MAX_RESULTS))
  const skip = Math.max(Number(query.skip) || 0, 0)
  const expandRadius = query.expand !== '0' && query.expand !== 'false'

  const match = await publicMatch()
  const categoryClauses = await buildStrictCategoryClauses({
    categoryId: query.categoryId,
    category: query.category,
    subcategory: query.subcategory,
  })

  const hasCategoryScope = Boolean(query.categoryId || query.category || query.subcategory)
  const textFilter = buildTextFilter(qStr, { excludeCategoryFields: hasCategoryScope })
  const combinedMatch = { ...match }
  if (categoryClauses.length === 1) {
    Object.assign(combinedMatch, categoryClauses[0])
  } else if (categoryClauses.length > 1) {
    combinedMatch.$and = [...(combinedMatch.$and || []), ...categoryClauses]
  }

  let rows = []
  let radiusUsed = null
  const radiusStepsUsed = []

  if (hasGeo) {
    const steps = expandRadius ? RADIUS_STEPS_M : [RADIUS_STEPS_M.at(-1)]
    const geoSeen = new Map()

    for (const radiusM of steps) {
      const batch = await collectGeoResults({
        lat,
        lng,
        radiusM,
        match: combinedMatch,
        textFilter: textFilter || null,
        fetchCap: PER_RADIUS_FETCH_CAP,
      })

      for (const row of batch) {
        const id = String(row._id)
        const prev = geoSeen.get(id)
        const m = Number(row.distanceMeters)
        if (!prev || (Number.isFinite(m) && m < prev.distanceMeters)) {
          geoSeen.set(id, row)
        }
      }

      radiusStepsUsed.push(radiusM)
      radiusUsed = radiusM
    }

    const geoRows = [...geoSeen.values()]

    if (qStr || categoryClauses.length) {
      const textRows = await fetchAllTextMatches({
        match: combinedMatch,
        textFilter,
      })
      rows = mergeBusinessRows(geoRows, textRows, lat, lng)
    } else {
      rows = sortByDistanceAsc(geoRows)
    }
  } else if (qStr || categoryClauses.length) {
    rows = await fetchAllTextMatches({
      match: combinedMatch,
      textFilter,
    })
    rows = rows.map((b) => ({ ...b, distanceMeters: null }))
  } else {
    rows = await Business.find(combinedMatch)
      .sort({ isFeatured: -1, isTrending: -1, ratingAvg: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
    rows = rows.map((b) => ({ ...b, distanceMeters: null }))
  }

  const totalMatched = rows.length
  const page = rows.slice(skip, skip + limit)

  return {
    ok: true,
    q: qStr,
    center: hasGeo ? { lat, lng } : null,
    radiusMeters: radiusUsed,
    radiusMaxMeters: expandRadius ? RADIUS_STEPS_M.at(-1) : radiusUsed,
    radiusStepsMeters: radiusStepsUsed,
    expandRadius,
    total: totalMatched,
    totalReturned: page.length,
    items: page.map(serializeDiscoverRow),
  }
}
