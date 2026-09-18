/**
 * Controlled GetVia public APIs that isolated websites may call.
 * Owner/admin/auth/payment routes stay server-side and must never be used from generated sites.
 */

export const GETVIA_PUBLIC_API_PREFIX = '/api'

export const GETVIA_FORBIDDEN_API_PREFIXES = Object.freeze([
  '/api/owner',
  '/api/admin',
  '/api/auth',
  '/api/upload',
  '/api/payments',
  '/api/analytics',
  '/owner/',
  '/admin/',
  '/auth/',
])

export const GETVIA_ENQUIRY_FIELDS = Object.freeze({
  name: { required: true, visitorLabel: 'Name' },
  email: { requiredUnless: 'phone', visitorLabel: 'Email' },
  phone: { requiredUnless: 'email', visitorLabel: 'Phone' },
  message: { required: true, visitorLabel: 'Message' },
})

export const GETVIA_PUBLIC_ENDPOINTS = Object.freeze([
  {
    id: 'submitEnquiry',
    method: 'POST',
    path: '/business/{publicId}/enquiries',
    fields: GETVIA_ENQUIRY_FIELDS,
    appearsIn: 'Getvia business admin → Enquiries',
    description: 'Visitor contact/enquiry form. Required: name, message, and email or phone.',
  },
])

export function getPublicApiOrigin() {
  const explicit = String(process.env.PUBLIC_API_ORIGIN || process.env.GETVIA_PUBLIC_API_ORIGIN || '')
    .trim()
    .replace(/\/$/, '')
  if (explicit) return explicit
  const port = String(process.env.PORT || '5001').trim()
  return `http://127.0.0.1:${port}`
}

export function isForbiddenPublicApiPath(value) {
  const text = String(value || '')
  return GETVIA_FORBIDDEN_API_PREFIXES.some((prefix) => text.includes(prefix))
}

export function composeEnquiryMessage(message, extra = {}) {
  const body = String(message || '').trim()
  const extras = Object.entries(extra || {})
    .filter(([, value]) => String(value || '').trim())
    .map(([key, value]) => `${key}: ${String(value).trim()}`)
  if (!extras.length) return body
  return [body, extras.join('\n')].filter(Boolean).join('\n\n')
}

export function publicApiContract({ publicId = '', apiOrigin = getPublicApiOrigin() } = {}) {
  return {
    product: 'getvia',
    publicId: String(publicId || '').trim(),
    apiOrigin,
    previewProxy: '/getvia-api',
    credentials: 'omit',
    enquiry: {
      method: 'POST',
      path: '/business/{publicId}/enquiries',
      required: ['name', 'message'],
      requireEmailOrPhone: true,
      extraFieldsGoIn: 'message',
      adminInbox: 'Getvia business admin → Enquiries',
    },
    allowed: GETVIA_PUBLIC_ENDPOINTS,
    forbidden: GETVIA_FORBIDDEN_API_PREFIXES,
    rules: [
      'Call only listed public endpoints.',
      'Never call owner, admin, auth, upload, payment, or analytics routes.',
      'Never send cookies or bearer tokens from the generated website.',
      'Never modify GetVia server, admin, or marketplace source.',
      'Customize the visitor form; keep name, message, and email or phone.',
      'Put extra questions (service, preferred time) into the message body so they show in Enquiries.',
    ],
  }
}

export const GETVIA_PUBLIC_CLIENT_JS = `import business from '../data/business.json'

const FORBIDDEN = [/\\/owner\\b/i, /\\/admin\\b/i, /\\/auth\\b/i, /\\/upload\\b/i, /\\/payment/i, /\\/analytics\\b/i]

export function getviaPublicId() {
  return String(business.publicId || business.getvia?.publicId || '').trim()
}

export function getviaApiBase() {
  const configured = String(business.getvia?.apiBase || business.publicApiBase || '').trim().replace(/\\/$/, '')
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    const port = Number(window.location.port)
    if ((host === '127.0.0.1' || host === 'localhost') && port >= 4100 && port <= 4199) {
      return '/getvia-api'
    }
  }
  return configured || '/getvia-api'
}

export function composeEnquiryMessage(message, extra) {
  const body = String(message || '').trim()
  const extras = Object.entries(extra || {})
    .filter(([, value]) => String(value || '').trim())
    .map(([key, value]) => \`\${key}: \${String(value).trim()}\`)
  if (!extras.length) return body
  return [body, extras.join('\\n')].filter(Boolean).join('\\n\\n')
}

export async function submitGetviaEnquiry({ name, email, phone, message, extra } = {}) {
  const publicId = getviaPublicId()
  if (!publicId) {
    return { ok: false, message: 'This website is not linked to a Getvia business yet.' }
  }
  const payload = {
    name: String(name || '').trim(),
    email: String(email || '').trim(),
    phone: String(phone || '').trim(),
    message: composeEnquiryMessage(message, extra),
  }
  if (!payload.name) return { ok: false, message: 'Name is required.' }
  if (!payload.message) return { ok: false, message: 'Message is required.' }
  if (!payload.email && !payload.phone) return { ok: false, message: 'Email or phone is required.' }
  const path = \`/business/\${encodeURIComponent(publicId)}/enquiries\`
  const url = \`\${getviaApiBase()}\${path}\`
  if (FORBIDDEN.some((re) => re.test(url))) {
    return { ok: false, message: 'That Getvia route is not available to this website.' }
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'omit',
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, message: data.error || 'Could not send enquiry.' }
    return { ok: true, message: 'Thank you — your enquiry was sent.' }
  } catch {
    return { ok: false, message: 'Could not send enquiry. Please try again.' }
  }
}
`

export function attachPublicApiToBusiness(business = {}, { publicId, apiOrigin } = {}) {
  const next = business && typeof business === 'object' ? { ...business } : {}
  const id = String(publicId || next.publicId || next.getvia?.publicId || '').trim()
  const origin = String(apiOrigin || next.getvia?.apiOrigin || getPublicApiOrigin()).replace(/\/$/, '')
  next.publicId = id
  next.getvia = {
    ...(next.getvia && typeof next.getvia === 'object' ? next.getvia : {}),
    publicId: id,
    apiOrigin: origin,
    apiBase: `${origin}${GETVIA_PUBLIC_API_PREFIX}`,
    enquiryPath: '/business/{publicId}/enquiries',
  }
  return next
}
