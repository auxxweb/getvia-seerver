import { createRequire } from 'node:module'
import { HttpError } from '../middleware/errorHandler.js'
import { Business } from '../models/Business.js'
import {
  getBusinessDashboard,
  getPlatformDashboard,
  toCsvRowsBusiness,
  toCsvRowsPlatform,
  resolveDateRange,
} from '../services/analytics/analyticsQuery.service.js'
import { buildBusinessAnalyticsPdf } from '../services/analytics/businessAnalyticsPdf.js'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')
const PDFDocument = require('pdfkit')

function sendCsv(res, filename, rows) {
  const lines = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(lines)
}

export async function businessAnalyticsDashboard(req, res, next) {
  try {
    const { id } = req.params
    const b = await Business.findById(id)
    if (!b) throw new HttpError(404, 'Business not found')
    if (b.ownerId.toString() !== req.user._id.toString()) throw new HttpError(403, 'Not your business')
    const data = await getBusinessDashboard(id, req.query)
    res.json({ ok: true, data })
  } catch (e) {
    next(e)
  }
}

export async function exportBusinessAnalytics(req, res, next) {
  try {
    const { id } = req.params
    const b = await Business.findById(id)
    if (!b) throw new HttpError(404, 'Business not found')
    if (b.ownerId.toString() !== req.user._id.toString()) throw new HttpError(403, 'Not your business')
    const data = await getBusinessDashboard(id, req.query)
    const format = String(req.query.format || 'csv').toLowerCase()
    const { from, to } = resolveDateRange(req.query)
    const base = `business-${b.publicId || id}-analytics-${from}_${to}`

    if (format === 'csv') {
      return sendCsv(res, `${base}.csv`, toCsvRowsBusiness(data))
    }
    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(toCsvRowsBusiness(data))
      XLSX.utils.book_append_sheet(wb, ws, 'Analytics')
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`)
      return res.send(buf)
    }
    if (format === 'pdf') {
      const preset = String(req.query.preset || 'last_30d')
      const pdfBuffer = await buildBusinessAnalyticsPdf({
        business: b,
        dashboard: data,
        preset,
      })
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${base}.pdf"`)
      return res.send(pdfBuffer)
    }
    throw new HttpError(400, 'Unsupported format')
  } catch (e) {
    next(e)
  }
}

export async function platformAnalyticsDashboard(req, res, next) {
  try {
    const data = await getPlatformDashboard(req.query)
    res.json({ ok: true, data })
  } catch (e) {
    next(e)
  }
}

export async function exportPlatformAnalytics(req, res, next) {
  try {
    const data = await getPlatformDashboard(req.query)
    const format = String(req.query.format || 'csv').toLowerCase()
    const { from, to } = resolveDateRange(req.query)
    const base = `platform-analytics-${from}_${to}`

    if (format === 'csv') {
      return sendCsv(res, `${base}.csv`, toCsvRowsPlatform(data))
    }
    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(toCsvRowsPlatform(data))
      XLSX.utils.book_append_sheet(wb, ws, 'Analytics')
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`)
      return res.send(buf)
    }
    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 40 })
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${base}.pdf"`)
      doc.pipe(res)
      doc.fontSize(16).text('Platform analytics export', { underline: true })
      doc.moveDown()
      doc.fontSize(10).text(`Range: ${from} → ${to}`)
      doc.moveDown()
      for (const [k, v] of Object.entries(data.kpis || {})) {
        doc.text(`${k}: ${v}`)
      }
      doc.end()
      return
    }
    throw new HttpError(400, 'Unsupported format')
  } catch (e) {
    next(e)
  }
}
