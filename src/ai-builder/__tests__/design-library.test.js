import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COMPONENT_VARIANT_COUNT,
  DESIGN_PRINCIPLES,
  INDUSTRY_IDS,
  designLibraryCatalogSummary,
  formatDesignLibraryBrief,
  resolveIndustry,
  selectDesignComposition,
} from '../design-library/index.js'
import { DIRECTION_IDS } from '../../../agent/visual/design-explorer/catalog.js'
import { planV2 } from '../v2/planner.js'
import { designDirectionForCategory } from '../getvia/profileContract.js'

test('design library has 100+ component variants and expanded directions', () => {
  const summary = designLibraryCatalogSummary()
  assert.ok(summary.componentVariants >= 100, `expected >=100 variants, got ${summary.componentVariants}`)
  assert.ok(DIRECTION_IDS.length >= 20, `expected >=20 directions, got ${DIRECTION_IDS.length}`)
  assert.ok(DESIGN_PRINCIPLES.length >= 25)
  assert.ok(INDUSTRY_IDS.length >= 20)
  assert.equal(COMPONENT_VARIANT_COUNT, summary.componentVariants)
})

test('different industries and seeds yield varied directions', () => {
  const salonA = selectDesignComposition({ category: 'Salon', businessName: 'LaFemina', prompt: 'create website', seed: 'a' })
  const salonB = selectDesignComposition({ category: 'Salon', businessName: 'Glow Spa', prompt: 'create website', seed: 'b' })
  const tech = selectDesignComposition({ category: 'SaaS', businessName: 'NovaApp', prompt: 'create website', seed: 'c' })
  const clinic = selectDesignComposition({ category: 'Dental Clinic', businessName: 'SmileCare', prompt: 'create website', seed: 'd' })

  assert.equal(salonA.industry.id, 'salon_beauty')
  assert.equal(tech.industry.id, 'technology_saas')
  assert.equal(clinic.industry.id, 'clinic_health')
  assert.ok(DIRECTION_IDS.includes(salonA.directionId))
  assert.ok(DIRECTION_IDS.includes(tech.directionId))
  assert.ok(salonA.components.hero)
  assert.ok(formatDesignLibraryBrief(salonA).includes('UNIVERSAL DESIGN LIBRARY'))
  // Same category can still diverge by seed/name into different pattern ids
  assert.ok(salonA.patternId)
  assert.ok(salonB.patternId)
  const dirs = new Set([salonA.directionId, tech.directionId, clinic.directionId])
  assert.ok(dirs.size >= 2, `expected industry variety, got ${[...dirs].join(',')}`)
})

test('category direction comes from industry pool, not a single fixed mapping', () => {
  const pool = new Set()
  for (let i = 0; i < 12; i += 1) {
    pool.add(designDirectionForCategory('Salon', '', 'create website', `seed-${i}`))
  }
  assert.ok(pool.size >= 2, `expected salon pool variety, got ${[...pool].join(',')}`)
  assert.equal(resolveIndustry('Restaurant').id, 'restaurant_food')
})

test('planner attaches design library composition on create', () => {
  const plan = planV2({
    prompt: 'Create a modern restaurant website',
    profile: { identity: { name: 'Coast Kitchen', category: 'Restaurant' } },
    hasSite: false,
  })
  assert.ok(plan.composition?.patternId)
  assert.equal(plan.composition.industry.id, 'restaurant_food')
  assert.ok(plan.tasks.some((t) => t.id === 'task-library'))
})
