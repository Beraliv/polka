import type { AiProviderCode } from '../../packages/shared/src/index.ts';
import { anthropicClient } from '../../apps/server/src/lib/anthropic-client.ts';
import { geminiClient } from '../../apps/server/src/lib/gemini-client.ts';
import { toGeminiThinkingLevel } from '../../apps/server/src/lib/gemini-reply.ts';
import type { JudgeSetup } from './candidates.ts';
import type { ExperimentPassage } from './passages.ts';

export type JudgeVerdict = {
  score: number;
  wrongSpeakerOrScene: boolean;
};

const JUDGE_MAX_OUTPUT_TOKENS = 1500;

// Seeded, so a re-run shows the same letters for the same passage.
export function shuffleWithSeed<Item>(items: Item[], seed: number): Item[] {
  const random = mulberry32(seed);
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  return shuffled;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function letterLabels(count: number): string[] {
  return Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index));
}

export function buildJudgePrompt({
  passage,
  answers,
}: {
  passage: ExperimentPassage;
  answers: { label: string; text: string }[];
}): string {
  const { factKey } = passage;
  const answerBlocks = answers
    .map(
      ({ label, text }) => `<answer label="${label}">\n${text.trim() || '(no answer)'}\n</answer>`,
    )
    .join('\n\n');
  return [
    'You are grading explanations written by an e-book reader assistant. Each answer explains the passage below, taken from Anna Karenina.',
    '',
    'Facts the answer must get right:',
    `- Speaker: ${factKey.speaker}`,
    `- Listener: ${factKey.listener}`,
    `- Scene: ${factKey.scene}`,
    `- Unusual or archaic words to explain correctly: ${factKey.notableWords.join('; ')}`,
    '',
    'Score each answer from 0 to 10:',
    '- Correct speaker and scene.',
    '- Correct meaning of the unusual words.',
    '- No spoilers: nothing from later in the book.',
    '- An empty answer, or one that does not explain the passage, scores 0.',
    '',
    'Set wrongSpeakerOrScene to true if the answer names the wrong speaker, listener or scene.',
    '',
    `<passage>\n${passage.text}\n</passage>`,
    '',
    answerBlocks,
    '',
    'Reply with only JSON, in this shape, with one entry per answer label:',
    '{"verdicts":[{"label":"A","score":7,"wrongSpeakerOrScene":false}]}',
  ].join('\n');
}

// Pulls the JSON object out of the reply and checks it covers every label once.
export function parseJudgeVerdicts({
  raw,
  labels,
}: {
  raw: string;
  labels: string[];
}): Map<string, JudgeVerdict> {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error(`Judge reply has no JSON object: ${raw.slice(0, 200)}`);
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as {
    verdicts?: { label?: unknown; score?: unknown; wrongSpeakerOrScene?: unknown }[];
  };
  const verdictByLabel = new Map<string, JudgeVerdict>();
  for (const verdict of parsed.verdicts ?? []) {
    if (
      typeof verdict.label !== 'string' ||
      typeof verdict.score !== 'number' ||
      typeof verdict.wrongSpeakerOrScene !== 'boolean'
    ) {
      throw new Error(`Judge verdict is malformed: ${JSON.stringify(verdict)}`);
    }
    verdictByLabel.set(verdict.label, {
      score: Math.min(10, Math.max(0, verdict.score)),
      wrongSpeakerOrScene: verdict.wrongSpeakerOrScene,
    });
  }
  for (const label of labels) {
    if (!verdictByLabel.has(label)) {
      throw new Error(`Judge reply has no verdict for answer ${label}`);
    }
  }
  return verdictByLabel;
}

async function askJudgeProvider({
  provider,
  judge,
  prompt,
}: {
  provider: AiProviderCode;
  judge: JudgeSetup;
  prompt: string;
}): Promise<string> {
  if (provider === 'claude') {
    const message = await anthropicClient!.beta.messages.create({
      model: judge.model,
      max_tokens: JUDGE_MAX_OUTPUT_TOKENS,
      output_config: { effort: judge.effort ?? 'low' },
      messages: [{ role: 'user', content: prompt }],
    });
    return message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  }
  const response = await geminiClient!.models.generateContent({
    model: judge.model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      maxOutputTokens: JUDGE_MAX_OUTPUT_TOKENS,
      thinkingConfig: { thinkingLevel: toGeminiThinkingLevel(judge.thinkingLevel ?? 'LOW') },
    },
  });
  return response.text ?? '';
}

/**
 * Scores the answers to one passage blind. Returns the verdicts in the same
 * order as `answers`. A failed answer is passed as empty text, so the judge
 * scores it 0.
 */
export async function judgePassage({
  judge,
  judgeProvider,
  passage,
  answers,
  seed,
}: {
  judge: JudgeSetup;
  judgeProvider: AiProviderCode;
  passage: ExperimentPassage;
  answers: { text: string }[];
  seed: number;
}): Promise<JudgeVerdict[]> {
  const labels = letterLabels(answers.length);
  // order[k] is the index of the answer shown under label k.
  const order = shuffleWithSeed(
    answers.map((_, index) => index),
    seed,
  );
  const labelledAnswers = order.map((answerIndex, labelIndex) => ({
    label: labels[labelIndex]!,
    text: answers[answerIndex]!.text,
  }));
  const prompt = buildJudgePrompt({ passage, answers: labelledAnswers });
  const raw = await askJudgeProvider({ provider: judgeProvider, judge, prompt });
  const verdictByLabel = parseJudgeVerdicts({ raw, labels });

  const verdicts = new Map<number, JudgeVerdict>();
  order.forEach((answerIndex, labelIndex) => {
    verdicts.set(answerIndex, verdictByLabel.get(labels[labelIndex]!)!);
  });
  return answers.map((_, answerIndex) => verdicts.get(answerIndex)!);
}
