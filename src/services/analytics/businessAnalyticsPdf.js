import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const PDFDocument = require('pdfkit')

/** Getvia business admin panel theme */
const THEME = {
  sidebar: '#0f172a',
  accent: '#a3e635',
  brand: '#006e12',
  ink: '#003314',
  muted: '#64748b',
  border: '#cbd5e1',
  surface: '#f8fafc',
  white: '#ffffff',
  rowAlt: '#f1f5f9',
}

const KPI_LABELS = {
  profileViews: 'Profile views',
  pageVisits: 'Page visits',
  profileCardClicks: 'Profile card clicks',
  whatsappClicks: 'WhatsApp clicks',
  callClicks: 'Call clicks',
  websiteClicks: 'Website clicks',
  saveBusiness: 'Business saves',
  shareClicks: 'Share clicks',
  directionClicks: 'Direction clicks',
  bookingClicks: 'Booking clicks',
  qrScans: 'QR scans',
  nfcTaps: 'NFC taps',
  sectionViews: 'Section views',
  uniqueVisitors: 'Unique visitors',
  returningVisitors: 'Returning visitors',
  ctr: 'CTR (%)',
  conversionRate: 'Conversion rate (%)',
}

function kpiLabel(key) {
  return KPI_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

function formatPresetLabel(preset) {
  const map = {
    today: 'Today',
    yesterday: 'Yesterday',
    last_7d: 'Last 7 days',
    last_14d: 'Last 14 days',
    last_30d: 'Last 30 days',
    last_90d: 'Last 90 days',
  }
  return map[preset] || preset
}

function pageMetrics(doc) {
  const { left, right, top, bottom } = doc.page.margins
  return {
    left,
    right,
    top,
    bottom,
    width: doc.page.width - left - right,
    height: doc.page.height - top - bottom,
  }
}

function ensureSpace(doc, needed = 80) {
  const m = pageMetrics(doc)
  if (doc.y + needed > m.top + m.height) {
    doc.addPage()
    drawPageHeader(doc, { continued: true })
  }
}

function drawPageHeader(doc, { continued = false } = {}) {
  const m = pageMetrics(doc)
  const barH = 52
  doc.save()
  doc.rect(m.left, m.top, m.width, barH).fill(THEME.sidebar)
  doc.fillColor(THEME.accent).font('Helvetica-Bold').fontSize(14)
  doc.text('Getvia', m.left + 16, m.top + 14, { continued: false })
  doc.fillColor('#94a3b8').font('Helvetica').fontSize(9)
  doc.text('Business Console', m.left + 16, m.top + 32)
  doc.fillColor(THEME.white).font('Helvetica-Bold').fontSize(11)
  doc.text('Analytics report', m.left + m.width - 16, m.top + 20, { align: 'right', width: 160 })
  doc.restore()
  doc.y = m.top + barH + (continued ? 12 : 20)
}

function drawSectionTitle(doc, title) {
  ensureSpace(doc, 48)
  const m = pageMetrics(doc)
  doc.save()
  doc.fillColor(THEME.ink).font('Helvetica-Bold').fontSize(13)
  doc.text(title, m.left, doc.y, { width: m.width })
  const y = doc.y + 4
  doc.moveTo(m.left, y).lineTo(m.left + m.width, y).strokeColor(THEME.brand).lineWidth(2).stroke()
  doc.restore()
  doc.moveDown(0.8)
}

function drawMetaBlock(doc, lines) {
  ensureSpace(doc, 40 + lines.length * 14)
  const m = pageMetrics(doc)
  const boxTop = doc.y
  const boxH = 12 + lines.length * 16
  doc.save()
  doc.roundedRect(m.left, boxTop, m.width, boxH, 6).fill(THEME.surface)
  doc.strokeColor(THEME.border).lineWidth(1).roundedRect(m.left, boxTop, m.width, boxH, 6).stroke()
  let y = boxTop + 10
  for (const line of lines) {
    doc.fillColor(THEME.muted).font('Helvetica').fontSize(9)
    doc.text(line.label, m.left + 12, y, { width: 110 })
    doc.fillColor(THEME.ink).font('Helvetica-Bold').fontSize(9)
    doc.text(String(line.value ?? '—'), m.left + 120, y, { width: m.width - 132 })
    y += 16
  }
  doc.restore()
  doc.y = boxTop + boxH + 14
}

/**
 * @param {import('pdfkit').PDFDocument} doc
 * @param {{ headers: string[], rows: (string|number)[][], colWidths?: number[] }} table
 */
function drawTable(doc, { title, headers, rows, colWidths }) {
  if (!rows.length && title) {
    drawSectionTitle(doc, title)
    const m = pageMetrics(doc)
    doc.fillColor(THEME.muted).font('Helvetica').fontSize(9)
    doc.text('No data for this period.', m.left, doc.y)
    doc.moveDown(1.2)
    return
  }

  drawSectionTitle(doc, title)
  const m = pageMetrics(doc)
  const cols = headers.length
  const widths =
    colWidths ||
    (cols === 2
      ? [m.width * 0.62, m.width * 0.38]
      : cols === 3
        ? [m.width * 0.34, m.width * 0.33, m.width * 0.33]
        : Array(cols).fill(m.width / cols))
  const rowH = 22
  const headerH = 26

  const drawHeaderRow = () => {
    ensureSpace(doc, headerH + 8)
    const y = doc.y
    doc.save()
    doc.rect(m.left, y, m.width, headerH).fill(THEME.brand)
    let x = m.left
    headers.forEach((h, i) => {
      doc.fillColor(THEME.white).font('Helvetica-Bold').fontSize(9)
      doc.text(h, x + 8, y + 8, { width: widths[i] - 12, align: i === 0 ? 'left' : 'right' })
      x += widths[i]
    })
    doc.restore()
    doc.y = y + headerH
  }

  drawHeaderRow()

  rows.forEach((row, ri) => {
    if (doc.y + rowH > m.top + m.height) {
      doc.addPage()
      drawPageHeader(doc, { continued: true })
      drawSectionTitle(doc, `${title} (continued)`)
      drawHeaderRow()
    }
    const y = doc.y
    const fill = ri % 2 === 0 ? THEME.white : THEME.rowAlt
    doc.save()
    doc.rect(m.left, y, m.width, rowH).fill(fill)
    doc.strokeColor(THEME.border).lineWidth(0.5).moveTo(m.left, y + rowH).lineTo(m.left + m.width, y + rowH).stroke()
    let x = m.left
    row.forEach((cell, i) => {
      doc.fillColor(THEME.ink).font(i === 0 ? 'Helvetica' : 'Helvetica-Bold').fontSize(9)
      doc.text(String(cell ?? ''), x + 8, y + 7, {
        width: widths[i] - 12,
        align: i === 0 ? 'left' : 'right',
      })
      x += widths[i]
    })
    doc.restore()
    doc.y = y + rowH
  })

  doc.moveDown(0.8)
}

function mapEntriesToRows(obj, labelFn = (k) => k) {
  return Object.entries(obj || {})
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [labelFn(k), typeof v === 'number' ? v : String(v)])
}

/**
 * Build a branded PDF buffer for business analytics export.
 */
export function buildBusinessAnalyticsPdf({ business, dashboard, preset }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const { from, to } = dashboard.range || {}
    const generatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ')

    drawPageHeader(doc)

    doc.fillColor(THEME.ink).font('Helvetica-Bold').fontSize(20)
    const m = pageMetrics(doc)
    doc.text('Listing analytics', m.left, doc.y, { width: m.width })
    doc.moveDown(0.3)
    doc.fillColor(THEME.muted).font('Helvetica').fontSize(10)
    doc.text('Performance summary for your public Getvia profile', m.left, doc.y)
    doc.moveDown(1)

    drawMetaBlock(doc, [
      { label: 'Business', value: business?.name || business?.publicId || '—' },
      { label: 'Public ID', value: business?.publicId || '—' },
      { label: 'Date range', value: `${from} → ${to}` },
      { label: 'Period', value: formatPresetLabel(preset) },
      { label: 'Generated', value: `${generatedAt} UTC` },
    ])

    const kpiRows = mapEntriesToRows(dashboard.kpis, kpiLabel).map(([label, value]) => [
      label,
      value,
    ])
    drawTable(doc, {
      title: 'Key metrics',
      headers: ['Metric', 'Value'],
      rows: kpiRows,
    })

    const review = dashboard.reviewSummary || {}
    if (review.count != null) {
      drawTable(doc, {
        title: 'Reviews',
        headers: ['Metric', 'Value'],
        rows: [
          ['Total reviews', review.count ?? 0],
          ['Average rating', review.avg ?? '—'],
        ],
      })
    }

    const trendRows = [...(dashboard.trend || [])]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((t) => [t.date, t.views ?? 0, t.clicks ?? 0])
    drawTable(doc, {
      title: 'Daily traffic trend',
      headers: ['Date', 'Views', 'Clicks'],
      rows: trendRows,
      colWidths: [m.width * 0.4, m.width * 0.3, m.width * 0.3],
    })

    const sectionRows = (dashboard.topSections || []).map((s) => [s.key || s.section || '—', s.score ?? 0])
    drawTable(doc, {
      title: 'Top profile sections',
      headers: ['Section', 'Engagement score'],
      rows: sectionRows,
    })

    const deviceRows = mapEntriesToRows(dashboard.device, (k) => k)
    drawTable(doc, {
      title: 'Devices',
      headers: ['Device', 'Sessions'],
      rows: deviceRows,
    })

    const sourceRows = mapEntriesToRows(dashboard.trafficSources, (k) => k)
    drawTable(doc, {
      title: 'Traffic sources',
      headers: ['Source', 'Visits'],
      rows: sourceRows,
    })

    const countryRows = mapEntriesToRows(dashboard.geography?.countries, (k) => k)
    if (countryRows.length) {
      drawTable(doc, {
        title: 'Countries',
        headers: ['Country', 'Visits'],
        rows: countryRows.slice(0, 25),
      })
    }

    const range = doc.bufferedPageRange()
    const pageCount = range.count
    for (let i = range.start; i < range.start + pageCount; i += 1) {
      doc.switchToPage(i)
      const pm = pageMetrics(doc)
      const pageNum = i - range.start + 1
      doc.save()
      doc.fillColor(THEME.muted).font('Helvetica').fontSize(8)
      doc.text(
        `Getvia Business Console · Page ${pageNum} of ${pageCount}`,
        pm.left,
        doc.page.height - pm.bottom + 12,
        { width: pm.width, align: 'center' },
      )
      doc.restore()
    }

    doc.end()
  })
}
