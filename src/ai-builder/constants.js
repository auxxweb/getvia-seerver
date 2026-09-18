/** AI Website Builder enums and configuration. Keep in sync with owner UI labels. */

import { isIsolatedRuntimeEnabled } from './runtimeFlags.js'

export const GETVIA_SECTION_IDS = [
  'top',
  'welcome',
  'offers',
  'core-services',
  'catalogue',
  'gallery',
  'testimonials',
  'map',
  'contact',
  'hours',
  'social',
  'feed',
  'footer',
]

/** Independent one-page sections for the AI website builder (not listing templates). */
export const AI_SECTION_TYPES = [
  'hero',
  'about',
  'services',
  'products',
  'offers',
  'feed',
  'gallery',
  'faq',
  'testimonials',
  'reviews',
  'cta',
  'contact',
  'location',
  'hours',
  'social',
  'footer',
]

export const WEBSITE_STATUS = ['draft', 'published']

export const VERSION_TYPES = ['DRAFT', 'PREVIEW', 'PUBLISHED', 'RESTORED']

export const VERSION_SOURCES = ['manual', 'ai', 'system']

export const AI_JOB_TYPES = [
  'REQUIREMENT_ANALYSIS',
  'WEBSITE_PLANNING',
  'WEBSITE_BUILD',
  'CONTENT_GENERATION',
  'DESIGN_GENERATION',
  'VALIDATION',
  'REPAIR',
  'PUBLISH',
  'DESIGNER_EDIT',
  'MANUAL_EDIT',
  'ISOLATED_WEBSITE',
]

export const AI_JOB_STATUSES = [
  'QUEUED',
  'ANALYZING',
  'PLANNING',
  'PREPARING',
  'EXECUTING',
  'DESIGNING',
  'IMPLEMENTING',
  'BUILDING',
  'DEBUGGING',
  'VALIDATING',
  'REPAIRING',
  'PREVIEW_READY',
  'BROWSER_TESTING',
  'VISUAL_TESTING',
  'REVIEWING',
  'WAITING_APPROVAL',
  'COMMITTING',
  'PUBLISHING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]

export const CHANGE_SET_TYPES = [
  'TEMPLATE_CHANGE',
  'PAGE_PLAN_CHANGE',
  'THEME_CHANGE',
  'CONTENT_CHANGE',
  'SECTION_REORDER',
  'SECTION_VISIBILITY',
  'STYLE_CHANGE',
  'FUNCTIONALITY_CHANGE',
  'SEO_CHANGE',
  'ASSET_CHANGE',
  'UPDATE_TEXT',
  'UPDATE_IMAGE',
  'UPDATE_STYLE',
  'UPDATE_THEME',
  'ADD_COMPONENT',
  'REMOVE_COMPONENT',
  'MOVE_COMPONENT',
  'REORDER_SECTION',
  'ADD_SECTION',
  'REMOVE_SECTION',
  'UPDATE_LINK',
  'UPDATE_BUTTON',
  'UPDATE_VISIBILITY',
  'UPDATE_LAYOUT',
  'UPDATE_RESPONSIVE_STYLE',
]

export const MUTATION_OPERATIONS = [
  'UPDATE_TEXT',
  'UPDATE_IMAGE',
  'UPDATE_STYLE',
  'UPDATE_THEME',
  'ADD_COMPONENT',
  'REMOVE_COMPONENT',
  'MOVE_COMPONENT',
  'REORDER_SECTION',
  'ADD_SECTION',
  'REMOVE_SECTION',
  'UPDATE_LINK',
  'UPDATE_BUTTON',
  'UPDATE_VISIBILITY',
  'UPDATE_LAYOUT',
  'UPDATE_RESPONSIVE_STYLE',
]

export const MUTATION_OUTCOMES = [
  'SUCCESS',
  'PARTIAL_SUCCESS',
  'NEEDS_CLARIFICATION',
  'FAILED',
  'UNSUPPORTED_CAPABILITY',
  'CANCELLED',
  'REVISION_CONFLICT',
]

export const BUTTON_ACTIONS = [
  'SHOP_NEW_ARRIVALS',
  'SCROLL_TO_SECTION',
  'OPEN_PAGE',
  'OPEN_URL',
  'WHATSAPP',
  'CALL',
  'EMAIL',
  'BOOKING',
  'ENQUIRY',
]

export const CHANGE_SET_STATUS = ['proposed', 'validated', 'applied', 'rejected', 'rolled_back']

export const DOMAIN_STATUS = [
  'PENDING',
  'VERIFYING',
  'VERIFIED',
  'ACTIVE',
  'FAILED',
  'DISCONNECTED',
]

export const MODEL_TIERS = ['simple', 'medium', 'complex']
export const SPEED_TIERS = ['fast', 'medium', 'slow']

export const DEFAULT_MODEL_BY_TIER = {
  simple: 'gpt-4o-mini',
  medium: 'gpt-4o',
  complex: 'gpt-5.6-sol',
}

/** Allowlisted OpenAI models shown in the builder. Fastest/cheapest first. */
export const OPENAI_MODELS = [
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', speed: 'fast' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', speed: 'fast' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini', speed: 'fast' },
  { id: 'gpt-4o', label: 'GPT-4o', speed: 'medium' },
  { id: 'gpt-4.1', label: 'GPT-4.1', speed: 'medium' },
  { id: 'gpt-5', label: 'GPT-5', speed: 'medium' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', speed: 'slow' },
]

export const DEFAULT_OPENAI_BY_SPEED = {
  fast: 'gpt-4o-mini',
  medium: 'gpt-4o',
  slow: 'gpt-5.6-sol',
}

export const LLM_PROVIDER_IDS = ['openai', 'anthropic', 'grok', 'openrouter', 'openai-compatible', 'local']

export const LLM_PROVIDER_LABELS = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  grok: 'Grok',
  openrouter: 'OpenRouter',
  'openai-compatible': 'Compatible',
  local: 'Local',
}

export const MAX_REPAIR_ATTEMPTS_DEFAULT = 3
export const MAX_AI_JOBS_PER_DAY_DEFAULT = 80
export const MAX_CONVERSATION_RECENT_MESSAGES = 12
export const MAX_USER_PROMPT_CHARS = 4000
export const STALE_AI_JOB_MS_DEFAULT = 90_000

export const USER_FACING_STEPS = [
  { key: 'understanding', label: 'Reading your brief' },
  { key: 'profile', label: 'Gathering business facts to reuse' },
  { key: 'planning', label: 'Planning a one-page layout' },
  { key: 'design', label: 'Creating an original look' },
  { key: 'content', label: 'Writing page copy' },
  { key: 'assets', label: 'Placing photos and actions' },
  { key: 'validate', label: 'Checking contrast and links' },
  { key: 'preview', label: 'Refreshing the live preview' },
]

export const V2_USER_FACING_STEPS = [
  { key: 'understanding', label: 'Understanding your request' },
  { key: 'planning', label: 'Planning pages and sections' },
  { key: 'design', label: 'Creating the design system' },
  { key: 'implement', label: 'Implementing in the workspace' },
  { key: 'build', label: 'Building the site' },
  { key: 'preview', label: 'Starting live preview' },
  { key: 'qa', label: 'Checking the live preview' },
  { key: 'review', label: 'Final review' },
]

const USER_FACING_STEP_ALIASES = {
  emma: 'implement',
  content: 'implement',
  profile: 'understanding',
  inspecting_project: 'planning',
  assets: 'qa',
  validate: 'qa',
  TASK_STARTED: 'understanding',
  PROJECT_INSPECTED: 'planning',
  PLAN_CREATED: 'planning',
  FILE_READ: 'implement',
  FILE_CHANGED: 'implement',
  COMMAND_STARTED: 'build',
  COMMAND_FINISHED: 'build',
  BUILD_STARTED: 'build',
  BUILD_FAILED: 'build',
  BUILD_PASSED: 'build',
  PREVIEW_STARTED: 'preview',
  BROWSER_STARTED: 'qa',
  BROWSER_TEST_PASSED: 'qa',
  BROWSER_TEST_FAILED: 'qa',
  VISUAL_CHECK_STARTED: 'qa',
  REPAIR_STARTED: 'implement',
  REPAIR_COMPLETED: 'implement',
  TASK_COMPLETED: 'review',
  TASK_FAILED: 'review',
  understanding: 'understanding',
  planning: 'planning',
  design: 'design',
  implement: 'implement',
  build: 'build',
  preview: 'preview',
  qa: 'qa',
  review: 'review',
}

export function resolveUserFacingStep(type, currentStep) {
  const catalog = type === 'ISOLATED_WEBSITE' ? V2_USER_FACING_STEPS : USER_FACING_STEPS
  const keys = catalog.map((s) => s.key)
  const alias = USER_FACING_STEP_ALIASES[String(currentStep || '')] || currentStep
  return keys.includes(alias) ? alias : keys[0]
}

export const PUBLIC_PROFILE_PATH = (publicId) => `/profile/${encodeURIComponent(publicId)}`

export function getMaxRepairAttempts() {
  const n = Number(process.env.MAX_REPAIR_ATTEMPTS)
  return Number.isFinite(n) && n >= 0 ? Math.min(10, Math.floor(n)) : MAX_REPAIR_ATTEMPTS_DEFAULT
}

export function getMaxAiJobsPerDay() {
  const n = Number(process.env.MAX_AI_JOBS_PER_DAY)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : MAX_AI_JOBS_PER_DAY_DEFAULT
}

export function getStaleAiJobMs() {
  const n = Number(process.env.STALE_AI_JOB_MS)
  if (Number.isFinite(n) && n >= 10_000) return Math.floor(n)
  if (isIsolatedRuntimeEnabled()) return 8 * 60 * 1000
  return STALE_AI_JOB_MS_DEFAULT
}

export function getPublicSiteOrigin() {
  const explicit = String(process.env.PUBLIC_SITE_ORIGIN || '')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '')
  if (explicit && !/localhost|127\.0\.0\.1/i.test(explicit)) return explicit

  const listed = String(process.env.CLIENT_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean)
  // Prefer a public HTTPS consumer-site origin (never localhost from a mixed CLIENT_ORIGINS list).
  const httpsPublic = listed.find((o) => /^https:\/\//i.test(o) && !/localhost|127\.0\.0\.1/i.test(o))
  if (httpsPublic) {
    // Prefer getvia.in over admin/business/api hosts when present.
    const consumer = listed.find(
      (o) =>
        /^https:\/\//i.test(o) &&
        !/localhost|127\.0\.0\.1/i.test(o) &&
        !/\b(admin|business|server|api)\./i.test(o),
    )
    return consumer || httpsPublic
  }
  const anyPublic = listed.find((o) => !/localhost|127\.0\.0\.1/i.test(o))
  if (anyPublic) return anyPublic
  return 'https://getvia.in'
}

export { getPublicApiOrigin } from './getvia/publicApi.js'

export function getCustomDomainCnameTarget() {
  return String(process.env.GETVIA_CNAME_TARGET || 'sites.getvia.in').trim().toLowerCase()
}
