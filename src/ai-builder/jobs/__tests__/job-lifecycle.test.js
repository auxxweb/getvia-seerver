import assert from 'node:assert/strict'
import test from 'node:test'
import { isMutatingStatus, jobHasSavedChanges, markJobStarted, markJobStopped, orphanAction, sanitizeProgressPatch } from '../jobLifecycle.js'

test('cancelled jobs drop the understanding step so the UI cannot stay stuck there', () => {
  const job = {
    status: 'QUEUED',
    currentStep: 'understanding',
    userFacingSteps: [
      { key: 'understanding', label: 'Understanding your request', status: 'active' },
      { key: 'planning', label: 'Planning', status: 'pending' },
    ],
  }
  markJobStopped(job)
  assert.equal(job.status, 'CANCELLED')
  assert.equal(job.currentStep, '')
  assert.equal(job.cancelRequested, true)
  assert.ok(job.userFacingSteps.every((step) => step.status === 'done'))
  assert.equal(job.error.message, 'This AI update was stopped.')
})

test('starting a queued job moves it to ANALYZING immediately', () => {
  const job = { status: 'QUEUED', currentStep: 'understanding', startedAt: null }
  markJobStarted(job, {
    steps: [
      { key: 'understanding', label: 'Understanding your request' },
      { key: 'planning', label: 'Planning' },
    ],
  })
  assert.equal(job.status, 'ANALYZING')
  assert.equal(job.userFacingSteps[0].status, 'active')
  assert.ok(job.startedAt)
})

test('orphaned QUEUED jobs resume; lost in-flight jobs cancel; live runners are left alone', () => {
  assert.equal(orphanAction({ status: 'QUEUED' }, { hasRunner: false }), 'resume')
  assert.equal(orphanAction({ status: 'ANALYZING' }, { hasRunner: false }), 'cancel')
  assert.equal(orphanAction({ status: 'IMPLEMENTING' }, { hasRunner: false }), 'cancel')
  assert.equal(orphanAction({ status: 'QUEUED' }, { hasRunner: true }), 'running')
  assert.equal(orphanAction({ status: 'CANCELLED' }, { hasRunner: false }), 'ignore')
  assert.equal(isMutatingStatus('QUEUED'), true)
  assert.equal(isMutatingStatus('CANCELLED'), false)
})

test('progress patches cannot mark a job COMPLETED before saved files are written', () => {
  const patch = sanitizeProgressPatch(
    { status: 'COMPLETED', currentStep: 'review', progress: 100, stepsDone: true },
    'ISOLATED_WEBSITE',
  )
  assert.equal(patch.status, undefined)
  assert.equal(patch.currentStep, 'review')
  assert.equal(patch.stepsDone, true)
})

test('a v2 isolated result with preview or written files counts as saved changes', () => {
  assert.equal(jobHasSavedChanges({ v2: true, isolatedPreviewUrl: 'http://127.0.0.1:4100' }), true)
  assert.equal(jobHasSavedChanges({ written: ['src/App.jsx'] }), true)
  assert.equal(jobHasSavedChanges({ saved: true }), true)
  assert.equal(jobHasSavedChanges({}), false)
})
