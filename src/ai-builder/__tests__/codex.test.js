import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { isAllowedGeneratedPath } from '../workspace/projectFiles.js'
import { mapCodexEvent, filesFromCodexItems } from '../codex/events.js'
import { buildCodexDeveloperPrompt } from '../codex/prompt.js'
import { writeCodexWorkspaceContext, readCodexThreadId, writeCodexThreadId } from '../codex/workspaceContext.js'
import { runCodexWebsiteTask } from '../codex/codex.service.js'
import { isCodexSdkEnabled, shouldRunCodexAgent, codexSkipReason } from '../codex/availability.js'
import { resetOpenAiAvailabilityForTests } from '../openai/availability.js'

function withEnv(patch, fn) {
  const previous = {}
  for (const key of Object.keys(patch)) {
    previous[key] = process.env[key]
    const next = patch[key]
    if (next == null) delete process.env[key]
    else process.env[key] = next
  }
  resetOpenAiAvailabilityForTests()
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value == null) delete process.env[key]
        else process.env[key] = value
      }
      resetOpenAiAvailabilityForTests()
    })
}

test('Codex context files are allowlisted workspace writes', () => {
  assert.equal(isAllowedGeneratedPath('AGENTS.md'), true)
  assert.equal(isAllowedGeneratedPath('website.config.json'), true)
  assert.equal(isAllowedGeneratedPath('generation/design-brief.md'), true)
  assert.equal(isAllowedGeneratedPath('src/data/getvia.json'), true)
  assert.equal(isAllowedGeneratedPath('../server/.env'), false)
})

test('Codex events map to builder activity without leaking secrets', () => {
  assert.equal(mapCodexEvent({ type: 'thread.started', thread_id: 't1' }).type, 'THREAD_STARTED')
  assert.equal(mapCodexEvent({ type: 'turn.started' }).type, 'TURN_STARTED')
  const file = mapCodexEvent({
    type: 'item.completed',
    item: { type: 'file_change', changes: [{ path: 'src/components/Hero.jsx' }] },
  })
  assert.equal(file.type, 'FILE_UPDATED')
  assert.match(file.message, /Hero/)
  const cmd = mapCodexEvent({
    type: 'item.completed',
    item: { type: 'command_execution', command: 'npm run build' },
  })
  assert.equal(cmd.type, 'COMMAND_RUN')
  assert.equal(mapCodexEvent({ type: 'turn.failed', error: { message: 'timeout' } }).type, 'TURN_FAILED')
  assert.equal(mapCodexEvent({ type: 'unknown.event' }), null)
  assert.deepEqual(
    filesFromCodexItems([{ type: 'file_change', changes: [{ path: './src/index.css' }, { path: 'src/App.jsx' }] }]),
    ['src/index.css', 'src/App.jsx'],
  )
})

test('Codex developer prompt keeps scoped allowlists and GetVia rules', () => {
  const text = buildCodexDeveloperPrompt({
    prompt: 'Redesign the about section only',
    allowedFiles: ['src/components/About.jsx', 'src/index.css'],
    scoped: true,
    profile: { identity: { name: 'LaFemina' } },
    inspect: { homepage: 'src/App.jsx' },
  })
  assert.match(text, /SCOPED FILE ALLOWLIST/)
  assert.match(text, /About\.jsx/)
  assert.match(text, /LaFemina/)
  assert.match(text, /Never invent/)
})

test('workspace context writes AGENTS.md, Getvia data, and thread id', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-codex-'))
  const written = await writeCodexWorkspaceContext({
    workspaceDir: dir,
    profile: {
      identity: { name: 'LaFemina', category: 'Salon', description: 'Hair and beauty' },
      contact: { phone: '9999999999', email: 'hi@lafemina.test' },
      location: { address: 'Pune' },
    },
    business: { name: 'LaFemina', category: 'Salon', sections: ['hero', 'about', 'contact'] },
    prompt: 'Create a premium modern website for my salon',
  })
  assert.equal(written.ok, true)
  const agents = await fs.readFile(path.join(dir, 'AGENTS.md'), 'utf8')
  assert.match(agents, /Getvia AI Generated Website/)
  assert.match(agents, /Never invent phone numbers/)
  const getvia = JSON.parse(await fs.readFile(path.join(dir, 'src/data/getvia.json'), 'utf8'))
  assert.equal(getvia.name, 'LaFemina')
  assert.equal(getvia.phone, '9999999999')
  const config = JSON.parse(await fs.readFile(path.join(dir, 'website.config.json'), 'utf8'))
  assert.equal(config.framework, 'react-vite')
  await writeCodexThreadId(dir, 'thread_abc', { projectId: 'site1' })
  assert.equal(await readCodexThreadId(dir), 'thread_abc')
})

test('Codex stays off during unit tests unless AI_TEST_CODEX is set', () => {
  assert.equal(isCodexSdkEnabled(), false)
  assert.equal(shouldRunCodexAgent(), false)
  assert.equal(codexSkipReason(), 'CODEX_DISABLED')
})

test('mocked Codex SDK starts a thread, streams events, and persists the thread id', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-codex-run-'))
  await fs.mkdir(path.join(dir, 'src'), { recursive: true })
  await fs.writeFile(path.join(dir, 'src/App.jsx'), 'export default function App(){return null}\n')

  class Codex {
    startThread() {
      return {
        id: 'thread_live',
        async runStreamed() {
          return {
            events: (async function* () {
              yield { type: 'thread.started', thread_id: 'thread_live' }
              yield { type: 'turn.started' }
              yield {
                type: 'item.completed',
                item: { type: 'file_change', changes: [{ path: 'src/components/Hero.jsx' }] },
              }
              yield { type: 'item.completed', item: { type: 'agent_message', text: 'Hero implemented.' } }
              yield { type: 'turn.completed', usage: { input_tokens: 11, output_tokens: 22 } }
            })(),
          }
        },
      }
    }
    resumeThread() {
      return this.startThread()
    }
  }

  await withEnv(
    {
      AI_TEST_CODEX: '1',
      AI_USE_CODEX: '1',
      OPENAI_API_KEY: 'sk-test-codex',
      OPENAI_API_KEY_WEBSITE_BUILDER: 'sk-test-website-builder',
    },
    async () => {
      const events = []
      const result = await runCodexWebsiteTask({
        workspaceDir: dir,
        prompt: 'Create a premium modern website for my salon',
        profile: { identity: { name: 'LaFemina' } },
        sdk: { Codex },
        onEvent: async (event) => events.push(event),
      })
      assert.equal(result.ok, true)
      assert.equal(result.skipped, false)
      assert.equal(result.coder, 'codex-sdk')
      assert.equal(result.threadId, 'thread_live')
      assert.deepEqual(result.written, ['src/components/Hero.jsx'])
      assert.equal(await readCodexThreadId(dir), 'thread_live')
      assert.ok(events.some((row) => row.type === 'THREAD_STARTED'))
      assert.ok(events.some((row) => row.type === 'FILE_UPDATED'))
    },
  )
})
