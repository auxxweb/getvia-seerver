/**
 * Phase 19 E2E scenario (manual + API). Automated unit coverage lives in sibling tests.
 *
 * 1. Owner signs in on business.getvia.in
 * 2. Dashboard → Build my profile with AI
 * 3. POST /api/owner/ai-builder/start with the authenticated business
 * 4. Type a natural-language request (broken English is OK)
 * 5. Job polls GET /api/owner/ai-builder/jobs/:id until PREVIEW_READY/COMPLETED
 * 6. Confirm preview iframe uses /preview/:id?previewToken&aiDraft=1
 * 7. Edit hero text (PATCH draft) and Designer AI a theme change
 * 8. Open version history, restore an older version (creates a new version)
 * 9. Publish (Idempotency-Key). Live /profile/{publicId} shows the template
 * 10. Custom domain: add host, set CNAME, verify — remains PENDING until DNS matches
 */
export const AI_BUILDER_E2E_SCENARIO = [
  'login',
  'open-ai-builder',
  'natural-language-request',
  'profile-context',
  'planner',
  'preview',
  'mobile-preview',
  'manual-edit',
  'designer-ai',
  'version-restore',
  'publish',
  'public-url',
  'custom-domain',
]
