import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { envFlag } from '../runtimeFlags.js'

let cached = null

export function playwrightOptOut() {
  if (envFlag('AI_SKIP_PLAYWRIGHT')) return true
  const raw = String(process.env.PLAYWRIGHT_VALIDATION || '').trim().toLowerCase()
  return raw === '0' || raw === 'false' || raw === 'no' || raw === 'off'
}

/** Visual QA runs whenever Playwright+Chromium are installed, unless explicitly opted out. */
export function shouldRunPlaywright() {
  return !playwrightOptOut()
}

function defaultBrowsersDir() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library/Caches/ms-playwright')
  if (process.platform === 'win32') return path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
  return path.join(os.homedir(), '.cache', 'ms-playwright')
}

function dirHasChromium(dir) {
  try {
    return fs.readdirSync(dir).some((name) => name.startsWith('chromium'))
  } catch {
    return false
  }
}

export function resolvePlaywrightBrowsersDir() {
  const envDir = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (envDir && envDir !== '0' && dirHasChromium(envDir)) return envDir
  const home = defaultBrowsersDir()
  if (dirHasChromium(home)) return home
  return envDir && envDir !== '0' ? envDir : home
}

function findInTree(root, names) {
  const queue = [root]
  const seen = new Set()
  while (queue.length) {
    const dir = queue.shift()
    if (!dir || seen.has(dir)) continue
    seen.add(dir)
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isFile() && names.includes(entry.name)) return full
      if (entry.isDirectory() && seen.size < 80) queue.push(full)
    }
  }
  return null
}

export function findChromiumExecutable(root = resolvePlaywrightBrowsersDir()) {
  if (!root || !dirHasChromium(root)) return null
  return (
    findInTree(root, ['chrome-headless-shell', 'chrome-headless-shell.exe']) ||
    findInTree(root, ['Google Chrome for Testing', 'chrome', 'chrome.exe'])
  )
}

export async function loadPlaywright() {
  if (cached) return cached
  try {
    const playwright = await import('playwright')
    cached = { ok: true, playwright: playwright.default || playwright }
    return cached
  } catch (err) {
    return {
      ok: false,
      code: 'PLAYWRIGHT_NOT_INSTALLED',
      message: `Playwright is not installed (${String(err?.message || err).slice(0, 160)}). Run npm install in server/ and npx playwright install chromium.`,
    }
  }
}

export async function launchChromium(playwright) {
  const browsersDir = resolvePlaywrightBrowsersDir()
  const exe = findChromiumExecutable(browsersDir)
  const env = {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browsersDir,
    PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL: dirHasChromium(browsersDir) && !findInTree(browsersDir, ['chrome-headless-shell', 'chrome-headless-shell.exe'])
      ? '0'
      : process.env.PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL || '',
  }
  const attempts = [
    { headless: true, args: ['--disable-dev-shm-usage'], env },
    exe ? { headless: true, args: ['--disable-dev-shm-usage'], executablePath: exe, env } : null,
  ].filter(Boolean)

  let lastErr = null
  for (const opts of attempts) {
    try {
      const browser = await playwright.chromium.launch(opts)
      return { ok: true, browser }
    } catch (err) {
      lastErr = err
    }
  }
  return {
    ok: false,
    code: 'CHROMIUM_UNAVAILABLE',
    message: `Chromium could not launch (${String(lastErr?.message || lastErr || 'unknown').slice(0, 180)}). Run npx playwright install chromium.`,
  }
}
