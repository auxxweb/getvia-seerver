import assert from 'node:assert/strict'
import test from 'node:test'
import {
  estimateCostUsd,
  groupUsageByPrompt,
  ratesForModel,
  displayModelName,
  isCodexUsage,
} from '../openai/usagePricing.js'

test('Sol costs more than mini for the same token counts', () => {
  const tokens = { in: 100_000, out: 20_000 }
  const mini = estimateCostUsd('gpt-4o-mini', tokens.in, tokens.out)
  const fourO = estimateCostUsd('gpt-4o', tokens.in, tokens.out)
  const sol = estimateCostUsd('gpt-5.6-sol', tokens.in, tokens.out)
  assert.ok(mini < fourO)
  assert.ok(fourO < sol)
  assert.equal(mini, 0.027)
  assert.equal(ratesForModel('openai-codex').in, ratesForModel('codex').in)
})

test('Codex models use Codex rates and display as Codex', () => {
  assert.equal(isCodexUsage({ model: 'codex/gpt-5.3-codex', operation: 'codex_sdk' }), true)
  assert.equal(displayModelName('codex/gpt-5.3-codex', 'codex_sdk'), 'Codex (gpt-5.3-codex)')
  assert.equal(displayModelName('codex', 'codex_sdk'), 'Codex')
  assert.equal(ratesForModel('codex/gpt-5.3-codex').in, 1.25)
  assert.equal(ratesForModel('codex/gpt-5.6-sol').in, 15)
  const cost = estimateCostUsd('codex/gpt-5.3-codex', 100_000, 20_000, 0, 'codex_sdk')
  assert.equal(cost, 0.325)
})

test('usage lists separate measurements without aggregating dollars or tokens', () => {
  const report = groupUsageByPrompt({
    jobs: [
      { _id: 'job1', input: { prompt: 'Add WhatsApp 9999999999' }, createdAt: '2026-09-18T10:00:00.000Z', status: 'COMPLETED' },
      { _id: 'job2', input: { prompt: 'Redesign the about section' }, createdAt: '2026-09-18T11:00:00.000Z', status: 'COMPLETED' },
    ],
    rows: [
      { _id: 'u1', jobId: 'job1', model: 'gpt-4o-mini', operation: 'coding_loop', inputTokens: 1000, outputTokens: 200, estimatedCostUsd: 0 },
      {
        _id: 'u2',
        jobId: 'job2',
        model: 'codex/gpt-5.3-codex',
        operation: 'codex_sdk',
        inputTokens: 8000,
        outputTokens: 3000,
        estimatedCostUsd: 0,
      },
      { _id: 'u3', jobId: 'job2', model: 'gpt-4o-mini', operation: 'visual_qa', inputTokens: 500, outputTokens: 80, estimatedCostUsd: 0 },
    ],
  })
  assert.equal(report.prompts.length, 2)
  assert.doesNotMatch(report.prompts[0].prompt, /9999999999/)
  assert.equal(report.prompts[1].measurements.length, 2)
  assert.equal(report.prompts[1].primary.codex, true)
  assert.equal(report.prompts[1].primary.inputTokens, 8000)
  assert.equal(report.prompts[1].primary.outputTokens, 3000)
  assert.ok(report.prompts[1].primary.estimatedCostUsd > 0)
  assert.equal(report.totals, undefined)
  assert.match(report.summary.note, /not add/i)
  assert.equal(report.summary.measurementCount, 3)
  assert.ok(report.prompts[1].models.some((name) => /Codex/i.test(name)))
})

test('job.result.usage recovers Codex only when that job has no AIUsage rows', () => {
  const recovered = groupUsageByPrompt({
    jobs: [
      {
        _id: 'job3',
        input: { prompt: 'Create a salon website' },
        createdAt: '2026-09-18T12:00:00.000Z',
        status: 'COMPLETED',
        result: {
          usage: { input_tokens: 5000, output_tokens: 1200 },
          usageModel: 'codex/gpt-5.3-codex',
          coder: { coder: 'codex-sdk', usage: { input_tokens: 5000, output_tokens: 1200 }, model: 'codex/gpt-5.3-codex' },
        },
      },
    ],
    rows: [],
  })
  assert.equal(recovered.prompts[0].measurements.length, 1)
  assert.equal(recovered.prompts[0].primary.codex, true)

  const noDouble = groupUsageByPrompt({
    jobs: [
      {
        _id: 'job3',
        input: { prompt: 'Create a salon website' },
        createdAt: '2026-09-18T12:00:00.000Z',
        status: 'COMPLETED',
        result: {
          usage: { input_tokens: 5000, output_tokens: 1200 },
          usageModel: 'codex/gpt-5.3-codex',
        },
      },
    ],
    rows: [
      {
        _id: 'u9',
        jobId: 'job3',
        model: 'codex/gpt-5.3-codex',
        operation: 'codex_sdk',
        inputTokens: 5000,
        outputTokens: 1200,
        estimatedCostUsd: 0.01,
      },
    ],
  })
  assert.equal(noDouble.prompts[0].measurements.length, 1)
})
