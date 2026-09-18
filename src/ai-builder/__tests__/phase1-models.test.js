import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AI_JOB_STATUSES,
  AI_JOB_TYPES,
  CHANGE_SET_TYPES,
  DOMAIN_STATUS,
  GETVIA_SECTION_IDS,
  VERSION_TYPES,
  WEBSITE_STATUS,
} from '../constants.js'
import {
  AIChangeSet,
  AIConversation,
  AIJob,
  AIMessage,
  AIUsage,
  AiRecipe,
  AiSiteMemory,
  AiOwnerMemory,
  Website,
  WebsiteDomain,
  WebsiteDraft,
  WebsiteValidation,
  WebsiteVersion,
} from '../../models/aiBuilderModels.js'
import { AI_WEBSITE_PROJECT, projectMetaFrom, stampProjectOnState } from '../state/projectMeta.js'
import { emptyWebsiteState } from '../state/websiteState.schema.js'

function indexKeys(model) {
  return model.schema.indexes().map((entry) => JSON.stringify(entry[0]))
}

function hasIndex(model, keys) {
  return indexKeys(model).includes(JSON.stringify(keys))
}

test('Phase 1 enums are frozen contract values', () => {
  assert.deepEqual(WEBSITE_STATUS, ['draft', 'published'])
  assert.ok(VERSION_TYPES.includes('PUBLISHED'))
  assert.ok(VERSION_TYPES.includes('RESTORED'))
  assert.ok(AI_JOB_TYPES.includes('WEBSITE_BUILD'))
  assert.ok(AI_JOB_TYPES.includes('ISOLATED_WEBSITE'))
  assert.ok(AI_JOB_STATUSES.includes('PREVIEW_READY'))
  assert.ok(AI_JOB_STATUSES.includes('CANCELLED'))
  assert.ok(CHANGE_SET_TYPES.includes('THEME_CHANGE'))
  assert.ok(DOMAIN_STATUS.includes('VERIFIED'))
  assert.ok(GETVIA_SECTION_IDS.includes('core-services'))
})

test('Website unique businessId and owner indexes', () => {
  assert.equal(Website.schema.path('businessId').options.unique, true)
  assert.ok(Website.schema.path('ownerId'))
  assert.ok(hasIndex(Website, { ownerId: 1, status: 1 }))
  assert.equal(Website.schema.path('framework').defaultValue, 'react')
  assert.equal(Website.schema.path('bundler').defaultValue, 'vite')
  assert.equal(Website.schema.path('renderer').defaultValue, 'AiGeneratedOnePage')
})

test('WebsiteDraft revisionNumber defaults to 1', () => {
  const def = WebsiteDraft.schema.path('revisionNumber').defaultValue
  const value = typeof def === 'function' ? def() : def
  assert.equal(value, 1)
  assert.equal(WebsiteDraft.schema.path('siteId').options.unique, true)
})

test('WebsiteVersion unique (siteId, versionNumber)', () => {
  assert.ok(hasIndex(WebsiteVersion, { siteId: 1, versionNumber: 1 }))
  assert.ok(hasIndex(WebsiteVersion, { siteId: 1, createdAt: -1 }))
  assert.deepEqual(WebsiteVersion.schema.path('versionType').enumValues, VERSION_TYPES)
})

test('AIJob indexes for tenant queries', () => {
  assert.ok(hasIndex(AIJob, { siteId: 1, status: 1 }))
  assert.ok(hasIndex(AIJob, { userId: 1, createdAt: -1 }))
  assert.ok(AIJob.schema.path('correlationId'))
})

test('AIConversation is one per site', () => {
  assert.equal(AIConversation.schema.path('siteId').options.unique, true)
  assert.ok(AIMessage.schema.path('conversationId'))
})

test('WebsiteDomain unique hostname', () => {
  assert.equal(WebsiteDomain.schema.path('hostname').options.unique, true)
  assert.deepEqual(WebsiteDomain.schema.path('status').enumValues, DOMAIN_STATUS)
})

test('remaining AI-builder collections are registered', () => {
  assert.ok(AIChangeSet.schema.path('operations'))
  assert.ok(WebsiteValidation.schema.path('passed'))
  assert.ok(AIUsage.schema.path('inputTokens'))
  assert.ok(AiRecipe.schema.path('promptClass'))
  assert.ok(AiSiteMemory.schema.path('requirements'))
  assert.ok(AiOwnerMemory.schema.path('preferredDirection'))
})

test('website project metadata is React + Vite', () => {
  const meta = projectMetaFrom({ engine: 'ai', status: 'draft' }, { revisionNumber: 4, websiteState: emptyWebsiteState() })
  assert.equal(meta.framework, 'react')
  assert.equal(meta.bundler, 'vite')
  assert.equal(meta.renderer, AI_WEBSITE_PROJECT.renderer)
  assert.equal(meta.currentRevision, 4)
  const stamped = stampProjectOnState(emptyWebsiteState())
  assert.equal(stamped.settings.framework, 'react')
  assert.equal(stamped.settings.bundler, 'vite')
  assert.equal(stamped.engine, 'ai')
})
