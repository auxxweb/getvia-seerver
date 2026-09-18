function hexToRgb(hex) {
  const h = String(hex || '')
    .trim()
    .replace('#', '')
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16)
    const g = parseInt(h[1] + h[1], 16)
    const b = parseInt(h[2] + h[2], 16)
    return { r, g, b }
  }
  if (h.length !== 6) return null
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function channel(c) {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

export function contrastRatio(a, b) {
  const l1 = relativeLuminance(a)
  const l2 = relativeLuminance(b)
  const light = Math.max(l1, l2)
  const dark = Math.min(l1, l2)
  return (light + 0.05) / (dark + 0.05)
}

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function mixToward(hex, towardHex, amount) {
  const a = hexToRgb(hex)
  const b = hexToRgb(towardHex)
  if (!a || !b) return hex
  const t = Math.max(0, Math.min(1, amount))
  const r = clampByte(a.r + (b.r - a.r) * t)
  const g = clampByte(a.g + (b.g - a.g) * t)
  const bch = clampByte(a.b + (b.b - a.b) * t)
  return `#${[r, g, bch].map((x) => x.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

/** Nudge foreground toward black/white until WCAG AA (4.5) or give up. */
export function ensureContrastPair(fg, bg, min = 4.5) {
  let nextFg = fg
  if (contrastRatio(nextFg, bg) >= min) return { fg: nextFg, bg }
  const bgLum = relativeLuminance(bg)
  const toward = bgLum > 0.5 ? '#111111' : '#FAFAFA'
  for (let i = 1; i <= 6; i += 1) {
    nextFg = mixToward(fg, toward, i / 6)
    if (contrastRatio(nextFg, bg) >= min) return { fg: nextFg, bg }
  }
  return { fg: toward, bg }
}
