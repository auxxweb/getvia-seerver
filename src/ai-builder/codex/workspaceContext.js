import fs from 'node:fs/promises'
import path from 'node:path'
import { applyWorkspaceFiles } from '../workspace/projectFiles.js'
import { formatDesignLibraryBrief, selectDesignComposition } from '../design-library/index.js'
import { publicApiContract } from '../getvia/publicApi.js'

export const AGENTS_MD = `# PROJECT
Getvia AI Generated Website

# FRAMEWORK
React + Vite one-page site. Do not replace this with a standalone HTML/CSS/JS website.

# ROLE
You are an autonomous senior frontend engineer, UI/UX developer, accessibility engineer, responsive-design engineer, and website implementation specialist.

# RULES
- Use existing components in src/components before creating duplicates.
- Keep code production-ready.
- Mobile-first. Responsive from 320px upward.
- Avoid unnecessary dependencies. Prefer native CSS and Lucide-style inline SVG.
- Never hardcode business information when Getvia data is available.
- Never invent phone numbers, addresses, prices, services, reviews, awards, or business claims.
- If a field is empty in src/data/business.json or src/data/getvia.json, design around the absence.
- Maintain accessibility, semantic HTML, keyboard access, and working forms.
- Keep enquiry, tel, mailto, WhatsApp, maps, and data bindings working.
- Contact/enquiry forms must POST to the Getvia public enquiry API through src/lib/getviaPublic.js so submissions appear in the business admin Enquiries page.
- Customize visitor-facing fields, but keep name, message, and email or phone. Extra questions belong in the message body.
- Call only public Getvia APIs listed in src/data/getvia-public-api.json. Never send cookies, JWTs, or owner/admin/auth requests.
- Never modify Getvia core: server/, admin-business/, admin-super/, frontend marketplace, Mongo schemas, or secured routes. You only edit this isolated website workspace.
- Optimize images. Use existing Getvia image URLs. Do not invent stock photos.
- npm run build must pass. No broken imports, missing assets, or obvious mobile overflow.

# DESIGN
- Do not blindly reproduce templates.
- Follow the design direction in website.config.json and src/design-system when present.
- Maintain consistent spacing, typography, and visual hierarchy.
- Vary section compositions. Do not stack identical 3-card grids.
- A request to redesign one named section is a scoped edit: change only that section.

# VALIDATION
- npm run build must pass.
- No broken imports.
- No console errors caused by implementation.
- No missing assets.
- No obvious mobile overflow.
- No broken links.
- Preview must remain a React + Vite app.
`

function compactGetvia(profile = {}, business = {}) {
  const identity = profile.identity || {}
  const contact = profile.contact || {}
  const location = profile.location || {}
  return {
    publicId: profile.publicId || business.publicId || '',
    name: identity.name || business.name || '',
    category: identity.category || business.category || '',
    description: identity.description || business.about || '',
    logo: identity.logo || business.logo || '',
    phone: contact.phone || '',
    email: contact.email || '',
    whatsapp: contact.whatsapp || contact.whatsappHref || '',
    address: location.address || '',
    city: location.city || '',
    hours: profile.hoursText || business.hours || '',
    sections: business.sections || [],
    source: 'getvia-profile',
  }
}

export async function writeCodexWorkspaceContext({
  workspaceDir,
  profile,
  business,
  prompt,
  composition,
  preserveConfig = false,
} = {}) {
  if (!workspaceDir) return { ok: false, written: [] }
  const selected =
    composition ||
    selectDesignComposition({
      category: profile?.identity?.category || business?.category,
      prompt,
      businessName: profile?.identity?.name || business?.name,
      seed: `${profile?.identity?.name || ''}:${business?.category || ''}`,
      sections: business?.sections,
    })
  const config = {
    framework: 'react-vite',
    product: 'getvia-ai-website',
    designDirection: selected.directionId,
    patternId: selected.patternId,
    industry: selected.industry,
    components: selected.components,
    updatedAt: new Date().toISOString(),
  }
  const files = [
    { path: 'AGENTS.md', contents: AGENTS_MD },
    { path: 'src/data/getvia.json', contents: `${JSON.stringify(compactGetvia(profile, business), null, 2)}\n` },
    {
      path: 'src/data/getvia-public-api.json',
      contents: `${JSON.stringify(publicApiContract({ publicId: profile?.publicId || business?.publicId }), null, 2)}\n`,
    },
  ]
  if (!preserveConfig) {
    files.push({ path: 'website.config.json', contents: `${JSON.stringify(config, null, 2)}\n` })
    files.push({
      path: 'generation/design-brief.md',
      contents: `${formatDesignLibraryBrief(selected)}\n`,
    })
  }
  const applied = await applyWorkspaceFiles({ workspaceDir, files })
  return { ok: applied.ok, written: applied.written || [], composition: selected }
}

export async function readCodexThreadId(workspaceDir) {
  try {
    const raw = await fs.readFile(path.join(workspaceDir, '.getvia', 'codex.json'), 'utf8')
    const parsed = JSON.parse(raw)
    return String(parsed.threadId || '').trim() || null
  } catch {
    return null
  }
}

export async function writeCodexThreadId(workspaceDir, threadId, extra = {}) {
  if (!workspaceDir || !threadId) return { ok: false }
  const dir = path.join(workspaceDir, '.getvia')
  await fs.mkdir(dir, { recursive: true })
  const current = {}
  try {
    Object.assign(current, JSON.parse(await fs.readFile(path.join(dir, 'codex.json'), 'utf8')))
  } catch {
    /* first write */
  }
  const next = {
    ...current,
    threadId: String(threadId),
    updatedAt: new Date().toISOString(),
    ...extra,
  }
  await fs.writeFile(path.join(dir, 'codex.json'), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return { ok: true, threadId: next.threadId }
}
