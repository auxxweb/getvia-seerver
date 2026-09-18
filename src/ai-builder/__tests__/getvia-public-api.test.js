import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import {
  attachPublicApiToBusiness,
  composeEnquiryMessage,
  GETVIA_PUBLIC_CLIENT_JS,
  GETVIA_PUBLIC_ENDPOINTS,
  isForbiddenPublicApiPath,
  publicApiContract,
} from '../getvia/publicApi.js'
import { isIsolatedPreviewOrigin, corsAllowsCredentials, isAllowedCorsOrigin, getClientOrigins } from '../../lib/corsOrigins.js'
import { businessJsonFrom, writeViteScaffold } from '../workspace/viteScaffold.js'
import { analyzeEditScope } from '../mutations/editScope.js'
import { isAllowedGeneratedPath } from '../workspace/projectFiles.js'
import { AGENTS_MD } from '../codex/workspaceContext.js'
import { buildCodexDeveloperPrompt } from '../codex/prompt.js'
import { buildCodingSystemPrompt } from '../getvia/masterAgentPrompt.js'

test('enquiry extra fields are appended to the message, not a new schema', () => {
  assert.equal(composeEnquiryMessage('Book a cut', { Service: 'Balayage', Time: 'Saturday' }), 'Book a cut\n\nService: Balayage\nTime: Saturday')
  assert.equal(composeEnquiryMessage('Hello', {}), 'Hello')
})

test('generated sites may only use listed public GetVia endpoints', () => {
  assert.ok(GETVIA_PUBLIC_ENDPOINTS.some((row) => row.id === 'submitEnquiry'))
  assert.equal(isForbiddenPublicApiPath('/api/owner/business/1/enquiries'), true)
  assert.equal(isForbiddenPublicApiPath('/api/admin/users'), true)
  assert.equal(isForbiddenPublicApiPath('/api/auth/login'), true)
  assert.equal(isForbiddenPublicApiPath('/api/business/lafemina/enquiries'), false)
  const contract = publicApiContract({ publicId: 'lafemina' })
  assert.equal(contract.credentials, 'omit')
  assert.match(contract.enquiry.adminInbox, /Enquiries/)
  assert.ok(contract.forbidden.some((row) => row.includes('/owner')))
})

test('isolated preview CORS is public-only and never credentialed', () => {
  assert.equal(isIsolatedPreviewOrigin('http://127.0.0.1:4123'), true)
  assert.equal(isIsolatedPreviewOrigin('http://localhost:5175'), false)
  assert.equal(isIsolatedPreviewOrigin('https://evil.example'), false)
  assert.equal(corsAllowsCredentials('http://127.0.0.1:4123'), false)
  assert.equal(isAllowedCorsOrigin('http://127.0.0.1:4123'), true)
})

test('production always allows live GetVia admin origins for credentialed CORS', () => {
  const prevEnv = process.env.NODE_ENV
  const prevOrigins = process.env.CLIENT_ORIGINS
  process.env.NODE_ENV = 'production'
  process.env.CLIENT_ORIGINS = 'http://localhost:5175'
  try {
    assert.equal(getClientOrigins().includes('https://business.getvia.in'), true)
    assert.equal(corsAllowsCredentials('https://business.getvia.in'), true)
    assert.equal(isAllowedCorsOrigin('https://admin.getvia.in'), true)
  } finally {
    process.env.NODE_ENV = prevEnv
    if (prevOrigins == null) delete process.env.CLIENT_ORIGINS
    else process.env.CLIENT_ORIGINS = prevOrigins
  }
})

test('scaffold contact form posts enquiries through the public client', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-enq-'))
  const business = businessJsonFrom({
    profile: {
      publicId: 'lafemina',
      identity: { name: 'LaFemina', category: 'Salon' },
      contact: { phone: '9999999999' },
      content: {},
    },
    prompt: 'Create a premium website',
  })
  assert.equal(business.publicId, 'lafemina')
  assert.match(business.getvia.apiBase, /\/api$/)
  const result = await writeViteScaffold({ workspaceDir: dir, business, overwrite: true })
  assert.ok(result.written.includes('src/lib/getviaPublic.js'))
  assert.ok(result.written.includes('src/components/Contact.jsx'))
  const contact = await fs.readFile(path.join(dir, 'src/components/Contact.jsx'), 'utf8')
  assert.match(contact, /submitGetviaEnquiry/)
  assert.match(contact, /type="email"/)
  assert.match(contact, /type="tel"/)
  assert.doesNotMatch(contact, /onSubmit=\{\(e\) => e\.preventDefault\(\)\}/)
  const client = await fs.readFile(path.join(dir, 'src/lib/getviaPublic.js'), 'utf8')
  assert.match(client, /credentials: 'omit'/)
  assert.match(client, /\/enquiries/)
  assert.match(client, /FORBIDDEN/)
  assert.doesNotMatch(client, /\/api\/owner/)
  const vite = await fs.readFile(path.join(dir, 'vite.config.js'), 'utf8')
  assert.match(vite, /getvia-api/)
  const contract = JSON.parse(await fs.readFile(path.join(dir, 'src/data/getvia-public-api.json'), 'utf8'))
  assert.equal(contract.publicId, 'lafemina')
  assert.equal(isAllowedGeneratedPath('src/lib/getviaPublic.js'), true)
  assert.equal(GETVIA_PUBLIC_CLIENT_JS.includes('credentials: \'omit\''), true)
})

test('preview proxy rewrites assets and disables Vite HMR websockets', async () => {
  const {
    rewriteHtmlForPreviewBase,
    disableViteHmrClient,
    stripPreviewPrefix,
    normalizeLivePathsForPreview,
  } = await import('../preview/previewProxy.js')
  const id = '6aad68fbf20d26ab1da6c441'
  const html = rewriteHtmlForPreviewBase(
    '<!doctype html><html><head></head><body><script type="module" src="/@vite/client"></script></body></html>',
    id,
  )
  assert.match(html, /data-getvia-hmr-guard/)
  assert.match(html, /src="\/ai-preview\/6aad68fbf20d26ab1da6c441\/@vite\/client"/)
  assert.doesNotMatch(html, /\/ai-preview\/.*\/ai-preview\//)
  const js = disableViteHmrClient('const ws = new WebSocket(socketUrl); // hmrClient')
  assert.doesNotMatch(js, /new WebSocket\(/)
  assert.equal(stripPreviewPrefix(`/ai-preview/${id}/@vite/client`, id), '/@vite/client')
  const poisoned = rewriteHtmlForPreviewBase(
    `<!doctype html><html><head><link rel="stylesheet" href="/ai-live/${id}/assets/index.css"></head><body></body></html>`,
    id,
  )
  assert.match(poisoned, /href="\/ai-preview\/6aad68fbf20d26ab1da6c441\/assets\/index\.css"/)
  assert.doesNotMatch(poisoned, /\/ai-preview\/.*\/ai-live\//)
  assert.equal(
    stripPreviewPrefix(`/ai-preview/${id}/ai-live/${id}/assets/index.css`, id),
    '/assets/index.css',
  )
  assert.equal(
    normalizeLivePathsForPreview(`/ai-live/${id}/assets/foo.js`, id),
    `/ai-preview/${id}/assets/foo.js`,
  )
})

test('enquiry prompts stay on the contact form and public client', () => {
  const scope = analyzeEditScope({
    prompt:
      'contact form data submission should be posted to getvia enquiries. customize form based on the fields required for customer enquiry. i should be able to see the enquiries inside getvia business admin panel.',
    hasSite: true,
  })
  assert.equal(scope.scope, 'section')
  assert.ok(scope.sections.includes('contact'))
  assert.ok(scope.files.includes('src/components/Contact.jsx'))
  assert.ok(scope.files.includes('src/lib/getviaPublic.js'))
  assert.equal(scope.files.includes('src/components/Hero.jsx'), false)
})

test('agents are forbidden from changing GetVia core and secured routes', () => {
  assert.match(AGENTS_MD, /Never modify Getvia core/)
  assert.match(AGENTS_MD, /Never send cookies/)
  assert.match(buildCodingSystemPrompt(), /Never change GetVia core/)
  assert.match(buildCodexDeveloperPrompt({ prompt: 'Add an enquiry form' }), /Do not call \/api\/owner/)
})
