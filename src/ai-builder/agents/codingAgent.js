import fs from 'node:fs/promises'
import path from 'node:path'
import { completeJson } from '../openai/structuredOutput.js'
import { inferLookFromPrompt } from '../mutations/promptAnalysis.js'
import { applyWorkspaceFiles, isAllowedGeneratedPath, listWorkspaceFiles } from '../workspace/projectFiles.js'
import { isHeroLayoutPrompt } from '../workspace/heroLayout.js'
import { envFlag } from '../runtimeFlags.js'

const CODING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    files: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string' },
          contents: { type: 'string' },
        },
        required: ['path', 'contents'],
      },
    },
  },
  required: ['summary', 'files'],
}

export async function readBusinessJson(workspaceDir) {
  const file = path.join(workspaceDir, 'src/data/business.json')
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

export function isRebuildPrompt(prompt) {
  return /\b(start over|from scratch|rebuild (the )?(site|website|page)|reset (the )?(site|website)|wipe (the )?(site|website)|delete (all )?(ai )?memory)\b/i.test(
    String(prompt || ''),
  )
}

export function heuristicSufficient(prompt) {
  const text = userPromptOnly(prompt)
  if (isRebuildPrompt(text)) return false
  if (isHeroLayoutPrompt(text)) return true
  if (/\b(create|build|generate)\b/i.test(text) && /\b(website|site|landing)\b/i.test(text)) return false
  return (
    /shop new arrivals|book appointment|whatsapp|pricing|price list|glassmorph|claymorph|neumorph|move services above about|remove |undo the last|\bh1\b|homepage h1|heading to|failed to resolve import|missing\.js|mobile (menu|nav)/i.test(
      text,
    ) && text.length < 280
  )
}

/** User-facing prompt only — ignore appended Design DNA / resource briefs. */
export function userPromptOnly(prompt) {
  return String(prompt || '')
    .split(
      /\n\n(?:PRODUCT CONTRACT:|DESIGN RESOURCES:|DESIGN DNA:|DESIGN RESEARCH:|GETVIA WEBSITE INTELLIGENCE:|SELF-LEARNING|SHARED BRAIN:|PRECISE EDIT TARGET:|EXECUTION SCOPE:|IMAGE REQUEST:)/,
    )[0]
    .trim()
}

export function isRemoveIntent(prompt) {
  return /\b(remove|delete|drop|get rid of|take off|don't (want|show)|do not (want|show))\b/i.test(userPromptOnly(prompt))
}

function unionButtons(a = [], b = []) {
  const out = []
  for (const row of [...(a || []), ...(b || [])]) {
    if (!row?.label) continue
    if (out.some((x) => String(x.label).toLowerCase() === String(row.label).toLowerCase())) continue
    out.push(row)
  }
  return out
}

function unionSections(a = [], b = []) {
  const out = []
  for (const id of [...(a || []), ...(b || [])]) {
    if (!id || out.includes(id)) continue
    out.push(id)
  }
  return out
}

function unionNamed(a = [], b = []) {
  const out = []
  for (const row of [...(a || []), ...(b || [])]) {
    if (!row) continue
    const key = String(row.name || row.title || row.src || row.url || JSON.stringify(row)).toLowerCase()
    if (out.some((x) => String(x.name || x.title || x.src || x.url || JSON.stringify(x)).toLowerCase() === key)) continue
    out.push(row)
  }
  return out
}

export function persistMerge(existing, incoming, prompt) {
  if (!existing || typeof existing !== 'object') return incoming
  if (isRebuildPrompt(prompt)) return incoming || existing
  if (isRemoveIntent(prompt)) {
    return {
      ...existing,
      hero: { ...(existing.hero || {}), extraButtons: [...(existing.hero?.extraButtons || [])] },
      sections: [...(existing.sections || [])],
      look: existing.look,
      colors: existing.colors,
    }
  }
  const next = { ...existing, ...(incoming && typeof incoming === 'object' ? incoming : {}) }
  next.hero = { ...(existing.hero || {}), ...(incoming?.hero || {}) }
  next.hero.extraButtons = unionButtons(existing.hero?.extraButtons, incoming?.hero?.extraButtons)
  next.sections = unionSections(existing.sections, incoming?.sections)
  const look = inferLookFromPrompt(String(prompt || '').toLowerCase())
  if (!look && existing.look) next.look = existing.look
  if (existing.colors && !look) next.colors = existing.colors
  else if (incoming?.colors) next.colors = incoming.colors
  if (!/\b(heading|title|hero text|h1|change (the )?heading|rename|rewrite|luxury|modern|create|build|generate|tagline|subtitle|look|theme|style|design)\b/i.test(
    String(prompt || ''),
  ) && existing.hero?.title) {
    next.hero.title = existing.hero.title
    if (existing.hero.subtitle && !/\b(subtitle|tagline|description)\b/i.test(String(prompt || ''))) {
      next.hero.subtitle = existing.hero.subtitle
    }
  }
  if (existing.hero?.primaryCta && !/\b(book appointment|contact us|primary (button|cta))\b/i.test(String(prompt || ''))) {
    next.hero.primaryCta = incoming?.hero?.primaryCta
      ? { ...existing.hero.primaryCta, ...incoming.hero.primaryCta }
      : existing.hero.primaryCta
  }
  for (const key of ['services', 'products', 'offers', 'pricing', 'reviews', 'gallery', 'faq']) {
    if (Array.isArray(existing[key]) || Array.isArray(incoming?.[key])) {
      next[key] = unionNamed(existing[key], incoming?.[key])
    }
  }
  if (existing.whatsapp && !/\bwhatsapp\b/i.test(String(prompt || ''))) next.whatsapp = existing.whatsapp
  return next
}

export function applyHeuristicBusinessEdits(business, prompt) {
  const next = business && typeof business === 'object' ? structuredClone(business) : {}
  const text = userPromptOnly(prompt)
  if (isRebuildPrompt(text)) return next
  const look = inferLookFromPrompt(text.toLowerCase())
  if (look) next.look = look
  next.hero = next.hero || {}
  next.hero.extraButtons = Array.isArray(next.hero.extraButtons) ? [...next.hero.extraButtons] : []
  next.sections = Array.isArray(next.sections) ? [...next.sections] : []

  const addButton = (label, href) => {
    if (!label) return
    if (next.hero.extraButtons.some((b) => String(b.label).toLowerCase() === label.toLowerCase())) return
    next.hero.extraButtons.push({ label, href })
  }
  const removeMatching = (re) => {
    next.hero.extraButtons = next.hero.extraButtons.filter((b) => !re.test(String(b.label || '')))
  }

  if (isRemoveIntent(text)) {
    if (/shop new arrivals/i.test(text)) removeMatching(/shop new arrivals/i)
    if (/book appointment/i.test(text)) removeMatching(/book appointment/i)
    const quoted = text.match(/["']([^"']+)["']/)
    if (quoted?.[1]) {
      const label = quoted[1].replace(/\s+button$/i, '').trim()
      next.hero.extraButtons = next.hero.extraButtons.filter(
        (b) => String(b.label).toLowerCase() !== label.toLowerCase(),
      )
    }
    return next
  }

  const heading =
    text.match(/(?:homepage\s+|home\s+|hero\s+)?(?:h1|heading|title)\s+to:\s*["']([^"']+)["']/i) ||
    text.match(/\bh1\s+to[:\s]+["']([^"']+)["']/i)
  if (heading?.[1]) {
    next.hero.title = heading[1].trim()
  }

  if (/shop new arrivals/i.test(text)) addButton('Shop New Arrivals', '#products')
  if (/book appointment|booking button/i.test(text)) {
    addButton('Book Appointment', '#contact')
    if (next.hero.primaryCta) next.hero.primaryCta.label = 'Book Appointment'
  }
  const quoted = text.match(/add (?:a |an )?"([^"]+)" button/i) || text.match(/add (?:a |an )?'([^']+)' button/i)
  if (quoted?.[1]) addButton(quoted[1], '#contact')

  if (/move services above about/i.test(text) && next.sections.includes('services')) {
    next.sections = next.sections.filter((id) => id !== 'services')
    const aboutAt = next.sections.indexOf('about')
    next.sections.splice(aboutAt >= 0 ? aboutAt : 1, 0, 'services')
  }
  if (/products?|shop new arrivals/i.test(text) && !next.sections.includes('products')) {
    const aboutAt = next.sections.indexOf('about')
    next.sections.splice(aboutAt >= 0 ? aboutAt + 1 : 2, 0, 'products')
  }
  if (/\b(pricing|price list|packages)\b/i.test(text) && !next.sections.includes('pricing')) {
    const contactAt = next.sections.indexOf('contact')
    next.sections.splice(contactAt >= 0 ? contactAt : next.sections.length, 0, 'pricing')
    if (!Array.isArray(next.pricing) || !next.pricing.length) {
      const priced = (next.services || []).map((s) => ({
        name: s.name,
        description: s.description,
        price: s.price || 'On request',
      }))
      next.pricing = priced.length ? priced : next.offers || []
    }
  }
  if (/whatsapp/i.test(text)) {
    const digits = String(next.phone || '').replace(/\D/g, '')
    if (digits) next.whatsapp = `https://wa.me/${digits}`
    addButton('WhatsApp', next.whatsapp || '#contact')
  }
  if (/\b(testimonial|reviews)\b/i.test(text) && !next.sections.includes('reviews')) {
    const contactAt = next.sections.indexOf('contact')
    next.sections.splice(contactAt >= 0 ? contactAt : next.sections.length, 0, 'reviews')
  }
  return next
}

async function currentSourceBundle(workspaceDir) {
  const names = await listWorkspaceFiles(workspaceDir)
  const allow = names.filter((n) => isAllowedGeneratedPath(n) && !n.startsWith('node_modules'))
  const parts = []
  for (const rel of allow) {
    if (rel === 'package.json') continue
    const contents = await fs.readFile(path.join(workspaceDir, rel), 'utf8')
    if (contents.length > 80_000) continue
    parts.push(`FILE ${rel}\n${contents}`)
  }
  return parts.join('\n\n').slice(0, 60_000)
}

export async function codingAgent({ workspaceDir, prompt, profile, signal, usageCtx } = {}) {
  const current = await readBusinessJson(workspaceDir)
  const heuristic = applyHeuristicBusinessEdits(current || {}, prompt)
  const heuristicWrite = await applyWorkspaceFiles({
    workspaceDir,
    files: [{ path: 'src/data/business.json', contents: `${JSON.stringify(heuristic, null, 2)}\n` }],
  })

  const llm = envFlag('AI_SKIP_CODING_LLM') || heuristicSufficient(prompt)
    ? { ok: false, skipped: true, data: null, code: envFlag('AI_SKIP_CODING_LLM') ? 'OPENAI_SKIPPED' : 'HEURISTIC' }
    : await completeJson({
    tier: 'medium',
    schemaName: 'isolated_files',
    schema: CODING_SCHEMA,
    system:
      'You incrementally edit an isolated React+Vite one-page website. Return JSON {summary, files:[{path,contents}]}. Only edit src/** or index.html. Never package.json, never secrets. Preserve every existing section, button, color, and copy unless the user explicitly asked to remove or replace it. Do not regenerate the whole site. Do not drop extraButtons or sections that were already there. The automatic JSX runtime does not define a React global: if you use hooks, write `import { useState } from "react"` (or `import React from "react"` before React.useState). Never reference React, useState, or useEffect without importing them.',
    user: JSON.stringify({
      prompt,
      persist: true,
      businessName: profile?.identity?.name,
      currentBusiness: heuristic,
      source: await currentSourceBundle(workspaceDir),
    }).slice(0, 50_000),
    signal,
    usageCtx,
    soft: true,
  })

  let llmWrite = { written: [], rejected: [] }
  if (llm.ok && Array.isArray(llm.data?.files) && llm.data.files.length) {
    const files = llm.data.files.filter((row) => row?.path !== 'package.json' && row?.path !== 'vite.config.js')
    llmWrite = await applyWorkspaceFiles({ workspaceDir, files })
    const after = await readBusinessJson(workspaceDir)
    if (after && current && !isRemoveIntent(prompt) && !isRebuildPrompt(prompt)) {
      after.hero = { ...(current.hero || {}), ...(after.hero || {}) }
      after.hero.extraButtons = unionButtons(current.hero?.extraButtons, after.hero?.extraButtons)
      after.sections = unionSections(current.sections, after.sections)
      await applyWorkspaceFiles({
        workspaceDir,
        files: [{ path: 'src/data/business.json', contents: `${JSON.stringify(after, null, 2)}\n` }],
      })
    }
  }

  return {
    ok: heuristicWrite.ok || llmWrite.written.length > 0,
    coder: llm.ok && llmWrite.written.length ? 'openai' : 'heuristic',
    skippedLlm: Boolean(llm.skipped),
    summary: llm.data?.summary || 'Updated isolated website files.',
    written: [...new Set([...(heuristicWrite.written || []), ...(llmWrite.written || [])])],
    rejected: llmWrite.rejected || [],
  }
}
