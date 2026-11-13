import Anthropic from '@anthropic-ai/sdk';

// Constructed once at startup — the SDK reads ANTHROPIC_API_KEY from the
// environment itself, so a missing key is only detectable by trying.
export const anthropicClient = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
