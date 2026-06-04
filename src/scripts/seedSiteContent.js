import { HelpArticle } from '../models/HelpArticle.js'
import { LegalDocument, LEGAL_DOC_TYPES } from '../models/LegalDocument.js'

const LEGAL_LABELS = {
  'privacy-policy': 'Privacy Policy',
  'terms-of-service': 'Terms of Service',
  'cookie-policy': 'Cookie Policy',
}

const HELP_SAMPLES = [
  {
    audience: 'consumer',
    title: 'How to find businesses near you',
    description: 'Use the home page search and location picker to discover verified listings in your area.',
    link: '',
    sortOrder: 0,
  },
  {
    audience: 'consumer',
    title: 'Saving and revisiting businesses',
    description: 'Sign in to save profiles and open them later from Saved or Recent in the navigation.',
    link: '',
    sortOrder: 1,
  },
  {
    audience: 'business',
    title: 'Complete your listing',
    description: 'Fill each section in the listing editor, then publish so your profile appears on Getvia.',
    link: '',
    sortOrder: 0,
  },
  {
    audience: 'business',
    title: 'Plans and payments',
    description: 'Choose a plan under My plan. Paid plans use Razorpay; free plans activate immediately.',
    link: '',
    sortOrder: 1,
  },
]

/** Idempotent seed for help articles and legal documents (consumer + business). */
export async function seedSiteContent() {
  let legalCreated = 0
  let helpCreated = 0

  for (const audience of ['consumer', 'business']) {
    for (const docType of LEGAL_DOC_TYPES) {
      const exists = await LegalDocument.findOne({ audience, docType })
      if (exists) continue
      const label = LEGAL_LABELS[docType]
      const who = audience === 'business' ? 'business owners' : 'end users'
      await LegalDocument.create({
        audience,
        docType,
        title: label,
        body: `${label} for ${who} on Getvia.\n\nEdit this text in Super Admin → Legal documents.`,
        isPublished: true,
      })
      legalCreated += 1
    }
  }

  for (const sample of HELP_SAMPLES) {
    const exists = await HelpArticle.findOne({ audience: sample.audience, title: sample.title })
    if (exists) continue
    await HelpArticle.create({ ...sample, isPublished: true })
    helpCreated += 1
  }

  if (legalCreated || helpCreated) {
    console.log(`Site content seed: ${legalCreated} legal doc(s), ${helpCreated} help article(s).`)
  }
}
