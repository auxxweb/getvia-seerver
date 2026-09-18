import assert from 'node:assert/strict'
import test from 'node:test'
import { chatCompletionBody, modelSupportsCustomTemperature } from '../openai/structuredOutput.js'

test('gpt-5.6-sol chat body omits temperature so the API call is accepted', () => {
  assert.equal(modelSupportsCustomTemperature('gpt-5.6-sol'), false)
  const body = chatCompletionBody({
    model: 'gpt-5.6-sol',
    system: 'Return JSON',
    user: '{"prompt":"make the footer pink"}',
  })
  assert.equal(Object.hasOwn(body, 'temperature'), false)
  assert.equal(body.response_format.type, 'json_object')
  assert.equal(body.model, 'gpt-5.6-sol')
})

test('vision chat bodies attach the reference image as multimodal user content', () => {
  const body = chatCompletionBody({
    model: 'gpt-4o',
    system: 'Return JSON',
    user: '{"section":"footer"}',
    images: ['https://res.cloudinary.com/demo/image/upload/x.jpg'],
  })
  assert.equal(Array.isArray(body.messages[1].content), true)
  assert.equal(body.messages[1].content[0].type, 'text')
  assert.equal(body.messages[1].content[1].type, 'image_url')
  assert.equal(body.messages[1].content[1].image_url.url, 'https://res.cloudinary.com/demo/image/upload/x.jpg')
})

test('gpt-4o-mini still sends a conservative temperature', () => {
  assert.equal(modelSupportsCustomTemperature('gpt-4o-mini'), true)
  const body = chatCompletionBody({
    model: 'gpt-4o-mini',
    system: 'Return JSON',
    user: '{}',
    schema: { type: 'object' },
    schemaName: 'designer_mutations',
  })
  assert.equal(body.temperature, 0.3)
  assert.equal(body.response_format.type, 'json_schema')
})
