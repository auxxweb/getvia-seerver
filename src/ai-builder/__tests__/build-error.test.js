import assert from 'node:assert/strict'
import test from 'node:test'
import { extractCompilerMessage, isEsbuildIpcCrash } from '../validation/buildError.js'
import { parseBuildError } from '../v2/debugger.js'

const ESBUILD_TAIL = `error during build:
[vite:esbuild] Transform failed with 1 error:
/tmp/site/src/App.jsx:206:0: ERROR: Unexpected "…"
file: /tmp/site/src/App.jsx:206:0

Unexpected "…"
204|          }
205|          if (id === 'hours')
206|  …truncated
    at failureErrorWithLog (/tmp/site/node_modules/esbuild/lib/main.js:1467:15)
    at responseCallbacks.<computed> (/tmp/site/node_modules/esbuild/lib/main.js:603:9)
    at handleIncomingPacket (/tmp/site/node_modules/esbuild/lib/main.js:658:12)
    at Socket.readFromStdout (/tmp/site/node_modules/esbuild/lib/main.js:581:7)
`

test('compiler message keeps the Vite ERROR, not the esbuild stack tail', () => {
  const message = extractCompilerMessage(ESBUILD_TAIL)
  assert.match(message, /Unexpected "…"/)
  assert.match(message, /App\.jsx:206/)
  assert.equal(/responseCallbacks/.test(message), false)
  assert.equal(isEsbuildIpcCrash(ESBUILD_TAIL), false)
  const parsed = parseBuildError({ stderr: ESBUILD_TAIL, message: ESBUILD_TAIL.slice(-80) })
  assert.match(parsed.message, /Unexpected "…"/)
  assert.equal(parsed.file.includes('App.jsx'), true)
})
