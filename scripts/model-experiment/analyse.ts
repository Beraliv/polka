import type { ExplainCallResult } from './run-explanation.ts';
import type { JudgeVerdict } from './judge.ts';
import type { ModelCandidate, ModelPrice } from './candidates.ts';

export type ExperimentCall = {
  result: ExplainCallResult;
  // Null only when the call failed before the judge could read it.
  verdict: JudgeVerdict | null;
};

export type ModelSummary = {
  label: string;
  model: string;
  setting: string;
  meanScore: number;
  minScore: number;
  maxScore: number;
  meanLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  meanInputTokens: number;
  meanOutputTokens: number;
  meanThinkingTokens: number;
  wrongSpeakerOrScene: number;
  failedCalls: number;
  price: ModelPrice;
  costPerExplanation: number;
  upcomingCostPerExplanation: number | null;
};

export type Recommendation = {
  recommended: ModelSummary | null;
  eligible: ModelSummary[];
  reason: string;
};

// The score on the 0–10 scale; a failed call counts as 0 so it can't be dropped from the mean.
export function isFailedCall(result: ExplainCallResult): boolean {
  return result.stopReason !== 'end_turn' || result.text.trim() === '';
}

export function meanOf(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function costPerExplanation({
  inputTokens,
  outputTokens,
  thinkingTokens,
  price,
  when,
}: {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  price: ModelPrice;
  when: 'current' | 'upcoming';
}): number {
  const rates =
    when === 'upcoming' && price.from
      ? { input: price.from.inputPerMillion, output: price.from.outputPerMillion }
      : { input: price.inputPerMillion, output: price.outputPerMillion };
  // Thinking tokens are billed at the output rate.
  return (inputTokens * rates.input + (outputTokens + thinkingTokens) * rates.output) / 1_000_000;
}

export function summariseModel({
  candidate,
  calls,
}: {
  candidate: ModelCandidate;
  calls: ExperimentCall[];
}): ModelSummary {
  const scores = calls.map((call) => call.verdict?.score ?? 0);
  const latencies = calls.map((call) => call.result.latencyMs);
  const meanInputTokens = meanOf(calls.map((call) => call.result.inputTokens));
  const meanOutputTokens = meanOf(calls.map((call) => call.result.outputTokens));
  const meanThinkingTokens = meanOf(calls.map((call) => call.result.thinkingTokens));
  const tokenUsage = {
    inputTokens: meanInputTokens,
    outputTokens: meanOutputTokens,
    thinkingTokens: meanThinkingTokens,
    price: candidate.price,
  };
  const setting = candidate.effort
    ? `${candidate.effort} effort`
    : `${candidate.thinkingLevel?.toLowerCase()} thinking`;

  return {
    label: candidate.label,
    model: candidate.model,
    setting,
    meanScore: meanOf(scores),
    minScore: Math.min(...scores),
    maxScore: Math.max(...scores),
    meanLatencyMs: meanOf(latencies),
    minLatencyMs: Math.min(...latencies),
    maxLatencyMs: Math.max(...latencies),
    meanInputTokens,
    meanOutputTokens,
    meanThinkingTokens,
    wrongSpeakerOrScene: calls.filter((call) => call.verdict?.wrongSpeakerOrScene).length,
    failedCalls: calls.filter((call) => isFailedCall(call.result)).length,
    price: candidate.price,
    costPerExplanation: costPerExplanation({ ...tokenUsage, when: 'current' }),
    upcomingCostPerExplanation: candidate.price.from
      ? costPerExplanation({ ...tokenUsage, when: 'upcoming' })
      : null,
  };
}

/**
 * The cheapest model that is good enough. Good enough means no failed call,
 * a mean score within 0.5 points of the best, and no more wrong speaker or
 * scene answers than the best model. Prices are today's; the report shows
 * any scheduled change.
 */
export function recommend(summaries: ModelSummary[]): Recommendation {
  if (summaries.length === 0) {
    return { recommended: null, eligible: [], reason: 'No models were tested.' };
  }
  const bestMeanScore = Math.max(...summaries.map((summary) => summary.meanScore));
  const fewestWrongSpeakerOrScene = Math.min(
    ...summaries.map((summary) => summary.wrongSpeakerOrScene),
  );
  const eligible = summaries
    .filter(
      (summary) =>
        summary.failedCalls === 0 &&
        summary.meanScore >= bestMeanScore - 0.5 &&
        summary.wrongSpeakerOrScene <= fewestWrongSpeakerOrScene,
    )
    .sort(
      (first, second) =>
        first.costPerExplanation - second.costPerExplanation ||
        first.meanLatencyMs - second.meanLatencyMs,
    );

  if (eligible.length === 0) {
    return {
      recommended: null,
      eligible,
      reason:
        'No model met all three conditions: no failed call, a mean score within 0.5 points of the best, and no more wrong speaker or scene answers than the best. Check the results before choosing.',
    };
  }
  const [recommended] = eligible;
  return {
    recommended: recommended!,
    eligible,
    reason:
      eligible.length === 1
        ? `${recommended!.label} is the only model that scored within 0.5 points of the best and named the wrong speaker or scene no more often than the best.`
        : `${recommended!.label} is the cheapest of the ${eligible.length} models that scored within 0.5 points of the best and named the wrong speaker or scene no more often than the best.`,
  };
}
