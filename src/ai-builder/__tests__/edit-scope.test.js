import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzeEditScope,
  buildScopedExecutionBrief,
  isExplicitSiteWidePrompt,
  sectionsMentionedInPrompt,
} from '../mutations/editScope.js'
import { isSiteWideChangePrompt } from '../mutations/interpretDesignerRequest.js'
import { resourceMode } from '../design-resources/selector.js'
import { classifyDesignMode } from '../../../agent/core/designMode.js'

test('sectionsMentionedInPrompt finds named sections', () => {
  assert.deepEqual(sectionsMentionedInPrompt('Make the hero darker'), ['hero'])
  assert.deepEqual(sectionsMentionedInPrompt('Update footer and contact'), ['contact', 'footer'])
})

test('single-section prompts are not site-wide', () => {
  assert.equal(isExplicitSiteWidePrompt('Make the hero darker'), false)
  assert.equal(isSiteWideChangePrompt('Make the hero darker'), false)
  assert.equal(isSiteWideChangePrompt('Only restyle the footer'), false)
  assert.equal(isSiteWideChangePrompt('Change the about section layout'), false)
})

test('explicit whole-site prompts stay site-wide', () => {
  assert.equal(isExplicitSiteWidePrompt('Redesign the entire website'), true)
  assert.equal(
    isSiteWideChangePrompt(
      'Change the layout structure, component design and card design of the whole website. Make the hero split and the service cards more premium.',
    ),
    true,
  )
})

test('analyzeEditScope prefers prompt section over site selection', () => {
  const scope = analyzeEditScope({
    prompt: 'Make the footer more compact',
    selectedElement: { site: true },
    hasSite: true,
  })
  assert.equal(scope.scope, 'section')
  assert.equal(scope.primarySection, 'footer')
  assert.deepEqual(scope.selectedElement, { sectionId: 'footer' })
  assert.ok(scope.files.includes('src/components/Footer.jsx'))
  assert.ok(scope.preserveDesign)
})

test('analyzeEditScope keeps UI section selection for vague prompts', () => {
  const scope = analyzeEditScope({
    prompt: 'Make it a bit darker',
    selectedElement: { sectionId: 'about' },
    hasSite: true,
  })
  assert.equal(scope.scope, 'section')
  assert.equal(scope.primarySection, 'about')
})

test('analyzeEditScope marks redesign-entire-site as site', () => {
  const scope = analyzeEditScope({
    prompt: 'Redesign the entire website to look luxury',
    selectedElement: { sectionId: 'hero' },
    hasSite: true,
  })
  assert.equal(scope.scope, 'site')
  assert.deepEqual(scope.selectedElement, { site: true })
})

test('scoped execution brief forbids unrelated rewrites', () => {
  const scope = analyzeEditScope({ prompt: 'Bigger heading in the hero', selectedElement: { site: true } })
  const brief = buildScopedExecutionBrief(scope)
  assert.match(brief, /SINGLE SECTION/)
  assert.match(brief, /hero/i)
  assert.match(brief, /Do NOT rewrite/i)
})

test('redesign about section stays scoped (not site-wide)', () => {
  const prompt = 'redesign about section , also include image'
  const scope = analyzeEditScope({ prompt, selectedElement: { site: true }, hasSite: true })
  assert.equal(scope.scope, 'section')
  assert.equal(scope.primarySection, 'about')
  assert.deepEqual(scope.files, ['src/components/About.jsx', 'src/index.css'])
  assert.equal(isExplicitSiteWidePrompt(prompt), false)
  assert.equal(isSiteWideChangePrompt(prompt), false)
  assert.equal(classifyDesignMode(prompt, 'DESIGN', { scoped: true }), 'PRESERVE')
  assert.equal(resourceMode({ intent: 'DESIGN', hasSite: true, prompt, scoped: true }), 'PRESERVE')
})

test('scoped design mode preserves resources for section edits', () => {
  assert.equal(classifyDesignMode('Make the hero darker', 'DESIGN', { scoped: true }), 'PRESERVE')
  assert.equal(resourceMode({ intent: 'DESIGN', hasSite: true, prompt: 'Make the hero darker', scoped: true }), 'PRESERVE')
  assert.equal(resourceMode({ intent: 'DESIGN', hasSite: true, prompt: 'Make the hero darker', scoped: false }), 'REDESIGN')
})
