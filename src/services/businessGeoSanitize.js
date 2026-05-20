/** Drop partial GeoJSON that breaks MongoDB 2dsphere indexes (e.g. type:"Point" without coordinates). */
export function sanitizeBusinessGeoFields(business) {
  if (!business) return

  const loc = business.location
  if (loc && typeof loc === 'object') {
    const c = loc.coordinates
    const valid =
      Array.isArray(c) &&
      c.length === 2 &&
      Number.isFinite(Number(c[0])) &&
      Number.isFinite(Number(c[1]))
    if (!valid) {
      business.set('location', undefined)
      business.markModified('location')
    }
  }

  const ml = business.mapLocation
  if (!ml || typeof ml !== 'object') return

  const lat = Number(ml.coordinates?.lat)
  const lng = Number(ml.coordinates?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    business.set('mapLocation', undefined)
    business.markModified('mapLocation')
    return
  }

  const gpCoords = ml.geoPoint?.coordinates
  const gpValid =
    Array.isArray(gpCoords) &&
    gpCoords.length === 2 &&
    Number.isFinite(Number(gpCoords[0])) &&
    Number.isFinite(Number(gpCoords[1]))
  if (!gpValid) {
    const plain = typeof ml.toObject === 'function' ? ml.toObject() : { ...ml }
    business.set('mapLocation', {
      ...plain,
      coordinates: { lat, lng },
      geoPoint: { type: 'Point', coordinates: [lng, lat] },
    })
    business.markModified('mapLocation')
  }
}
