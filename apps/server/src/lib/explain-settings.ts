import { ThinkingLevel } from '@google/genai';
import type Anthropic from '@anthropic-ai/sdk';
import { EXPLANATION_LANGUAGES, type ExplainRequest } from '@polka/shared';

// Shared by the Explain route and the model experiment script
// (scripts/model-experiment), so the experiment sends exactly what the app sends.

// Kept short, and asking for a short answer, because the reader is waiting:
// replies stream token by token, so output length decides how long it takes.
export const EXPLAIN_SYSTEM_PROMPT =
  'You are built into Polka, an e-book reader. Explain the passage the reader selected: what it means and the ' +
  'context it needs from the book (who is speaking, what is happening, references, unusual or archaic words). ' +
  'If you do not know the book, say so in one sentence and explain the passage from its own text. Do not reveal ' +
  'anything that happens later in the book. Answer in the language the reader asks for, in at most two short ' +
  'paragraphs of plain text, without markdown.';

// Caps the cost of one explanation; see specs/explanation.md.
export const EXPLAIN_MAX_OUTPUT_TOKENS = 4000;

// Opus 5.5 at low effort: the recommendation in docs/claude-models.md, from
// the model experiment (specs/model-experiment.md).
export const EXPLAIN_CLAUDE_SETUP = {
  model: 'claude-opus-5-5',
  effort: 'low',
} as const;

// Gemini 4 Hydrogen at low thinking: the recommendation in
// docs/gemini-models.md, from the model experiment (specs/model-experiment.md).
export const EXPLAIN_GEMINI_SETUP = {
  model: 'gemini-4-hydrogen',
  thinkingLevel: ThinkingLevel.LOW,
} as const;

export function buildExplainPrompt({
  passage,
  bookName,
  author,
  language,
}: ExplainRequest): string {
  const languageName =
    EXPLANATION_LANGUAGES.find((candidate) => candidate.code === language)?.englishName ??
    'English'; // aligned with DEFAULT_EXPLANATION_LANGUAGE
  const bookLines = [
    `Book: ${bookName.trim() || 'unknown'}`,
    `Author: ${author?.trim() || 'unknown'}`,
  ];
  return [
    ...bookLines,
    `Explain in: ${languageName}`,
    '',
    `<passage>\n${passage.trim()}\n</passage>`,
  ].join('\n');
}

// The parameter type of the beta streaming call the route makes.
type ClaudeExplainParams = Parameters<Anthropic['beta']['messages']['stream']>[0];

export function buildClaudeExplainParams({
  prompt,
  setup,
}: {
  prompt: string;
  setup: { model: string; effort: 'low' | 'medium' | 'high' };
}): ClaudeExplainParams {
  return {
    model: setup.model,
    // A passage from a novel can touch on violence or medicine; if a
    // safety classifier declines it, the API retries on a fallback
    // model instead of leaving the reader with nothing.
    max_tokens: EXPLAIN_MAX_OUTPUT_TOKENS,
    output_config: { effort: setup.effort },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: EXPLAIN_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  };
}
