import { Website } from './Website.js'
import { WebsiteDraft } from './WebsiteDraft.js'
import { WebsiteVersion } from './WebsiteVersion.js'
import { AIConversation } from './AIConversation.js'
import { AIMessage } from './AIMessage.js'
import { AIJob } from './AIJob.js'
import { AIChangeSet } from './AIChangeSet.js'
import { WebsiteValidation } from './WebsiteValidation.js'
import { WebsiteDomain } from './WebsiteDomain.js'
import { AIUsage } from './AIUsage.js'
import { AiRecipe } from './AiRecipe.js'
import { AiSiteMemory } from './AiSiteMemory.js'
import { AiOwnerMemory } from './AiOwnerMemory.js'

/** Import this module so Mongoose registers AI-builder indexes without public-route side effects. */
export const AI_BUILDER_MODELS = {
  Website,
  WebsiteDraft,
  WebsiteVersion,
  AIConversation,
  AIMessage,
  AIJob,
  AIChangeSet,
  WebsiteValidation,
  WebsiteDomain,
  AIUsage,
  AiRecipe,
  AiSiteMemory,
  AiOwnerMemory,
}

export {
  Website,
  WebsiteDraft,
  WebsiteVersion,
  AIConversation,
  AIMessage,
  AIJob,
  AIChangeSet,
  WebsiteValidation,
  WebsiteDomain,
  AIUsage,
  AiRecipe,
  AiSiteMemory,
  AiOwnerMemory,
}
