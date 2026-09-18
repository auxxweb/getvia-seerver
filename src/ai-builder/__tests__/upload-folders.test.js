import assert from 'node:assert/strict'
import test from 'node:test'
import {
  allowedFolderForRole,
  folderFromPublicId,
  isAiBuilderReferenceFolder,
} from '../../../controllers/upload.controller.js'

test('business owners can upload AI builder reference images', () => {
  const folder = 'getvia/ai-builder/6a11f0b0b521623c775cdb52/reference'
  assert.equal(isAiBuilderReferenceFolder(folder), true)
  assert.equal(allowedFolderForRole('BUSINESS_OWNER', folder), true)
  assert.equal(allowedFolderForRole('SUPER_ADMIN', folder), true)
  assert.equal(allowedFolderForRole('USER', folder), false)
  assert.equal(allowedFolderForRole('BUSINESS_OWNER', 'getvia/ai-builder/site/reference'), true)
})

test('nested folders outside the AI builder reference path stay blocked', () => {
  assert.equal(allowedFolderForRole('BUSINESS_OWNER', 'getvia/secret'), false)
  assert.equal(allowedFolderForRole('BUSINESS_OWNER', 'businesses/other'), false)
  assert.equal(allowedFolderForRole('BUSINESS_OWNER', 'gallery'), true)
  assert.equal(allowedFolderForRole('BUSINESS_OWNER', '../etc'), false)
})

test('Cloudinary public ids under the reference folder map back to that folder', () => {
  assert.equal(
    folderFromPublicId('getvia/ai-builder/6a11f0b0b521623c775cdb52/reference/abc123'),
    'getvia/ai-builder/6a11f0b0b521623c775cdb52/reference',
  )
  assert.equal(folderFromPublicId('gallery/photo-1'), 'gallery')
})
