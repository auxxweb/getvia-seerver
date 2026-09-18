import assert from 'node:assert/strict'
import test from 'node:test'
import { runOpenAiCodingLoop, toolCallToExecutorInput, clipToolOutput } from '../openai/codingLoop.js'
import { resetOpenAiAvailabilityForTests } from '../openai/availability.js'

test('tool calls map onto the workspace executor', () => {
  assert.deepEqual(toolCallToExecutorInput('read_file', { path: 'src/App.jsx' }), {
    tool: 'read_file',
    relativePath: 'src/App.jsx',
    contents: undefined,
    query: undefined,
    command: undefined,
    category: undefined,
    style: undefined,
    framework: undefined,
    requirements: undefined,
    id: undefined,
    name: undefined,
    url: undefined,
    resourceId: undefined,
    package: undefined,
  })
  assert.equal(toolCallToExecutorInput('write_file', { path: 'src/index.css', contents: 'body{}' }).contents, 'body{}')
  assert.equal(toolCallToExecutorInput('search_code', { query: 'Footer' }).query, 'Footer')
})

test('tool output never injects …truncated into file contents', () => {
  const huge = `${'const x = 1\n'.repeat(20)}complete file\n`
  const small = JSON.parse(clipToolOutput({ success: true, output: huge }))
  assert.equal(small.contents, huge)
  assert.equal(small.truncated, undefined)
  const over = 'a'.repeat(120_001)
  const clipped = JSON.parse(clipToolOutput({ success: true, output: over }))
  assert.equal(clipped.truncated, true)
  assert.equal(clipped.contents.includes('…truncated'), false)
  assert.equal(clipped.contents.endsWith('…truncated'), false)
})

test('coding loop skips when AI_SKIP_CODING_LLM is set', async () => {
  const previousSkip = process.env.AI_SKIP_CODING_LLM
  process.env.AI_SKIP_CODING_LLM = '1'
  resetOpenAiAvailabilityForTests()
  try {
    const result = await runOpenAiCodingLoop({
      workspaceDir: '/tmp',
      prompt: 'Make the footer match this image',
    })
    assert.equal(result.skipped, true)
    assert.equal(result.written.length, 0)
    assert.equal(result.code, 'OPENAI_SKIPPED')
  } finally {
    resetOpenAiAvailabilityForTests()
    if (previousSkip == null) delete process.env.AI_SKIP_CODING_LLM
    else process.env.AI_SKIP_CODING_LLM = previousSkip
  }
})
