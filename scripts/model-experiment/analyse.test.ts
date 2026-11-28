import { describe, expect, it } from 'vitest';
import { costPerExplanation, recommend, summariseModel, type ModelSummary } from './analyse.ts';
import type { ExplainCallResult } from './run-explanation.ts';
import type { ModelCandidate } from './candidates.ts';

function call({
  text = 'An explanation.',
  stopReason = 'end_turn',
  latencyMs = 1000,
  outputTokens = 100,
  thinkingTokens = 0,
  score = 8,
  wrongSpeakerOrScene = false,
}: Partial<ExplainCallResult> & { score?: number; wrongSpeakerOrScene?: boolean } = {}) {
  return {
    result: {
      text,
      stopReason,
      errorMessage: null,
      latencyMs,
      timeToFirstTextMs: 100,
      inputTokens: 200,
      outputTokens,
      thinkingTokens,
    } as ExplainCallResult,
    verdict: { score, wrongSpeakerOrScene },
  };
}

const candidate: ModelCandidate = {
  label: 'Test model',
  model: 'test-model',
  effort: 'low',
  price: { inputPerMillion: 2, outputPerMillion: 10 },
};

function summary(overrides: Partial<ModelSummary>): ModelSummary {
  return {
    label: 'model',
    model: 'model',
    setting: 'low effort',
    meanScore: 8,
    minScore: 8,
    maxScore: 8,
    meanLatencyMs: 1000,
    minLatencyMs: 1000,
    maxLatencyMs: 1000,
    meanInputTokens: 200,
    meanOutputTokens: 100,
    meanThinkingTokens: 0,
    wrongSpeakerOrScene: 0,
    failedCalls: 0,
    price: { inputPerMillion: 2, outputPerMillion: 10 },
    costPerExplanation: 0.0012,
    upcomingCostPerExplanation: null,
    ...overrides,
  };
}

describe('costPerExplanation', () => {
  it('bills thinking tokens at the output rate', () => {
    const cost = costPerExplanation({
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      thinkingTokens: 400_000,
      price: { inputPerMillion: 1, outputPerMillion: 10 },
      when: 'current',
    });
    expect(cost).toBeCloseTo(1 + 5);
  });

  it('uses the scheduled price when asked for the upcoming cost', () => {
    const price = {
      inputPerMillion: 2,
      outputPerMillion: 10,
      from: { date: '2026-12-01', inputPerMillion: 4, outputPerMillion: 20 },
    };
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, thinkingTokens: 0, price };
    expect(costPerExplanation({ ...usage, when: 'current' })).toBeCloseTo(12);
    expect(costPerExplanation({ ...usage, when: 'upcoming' })).toBeCloseTo(24);
  });
});

describe('summariseModel', () => {
  it('counts a failed call as a zero score and as a failure', () => {
    const result = summariseModel({
      candidate,
      calls: [call({ score: 8 }), call({ text: '', stopReason: 'max_tokens', score: 0 })],
    });
    expect(result.meanScore).toBe(4);
    expect(result.failedCalls).toBe(1);
  });

  it('counts wrong speaker or scene answers', () => {
    const result = summariseModel({
      candidate,
      calls: [call({ wrongSpeakerOrScene: true }), call()],
    });
    expect(result.wrongSpeakerOrScene).toBe(1);
  });
});

describe('recommend', () => {
  it('recommends the only model with no wrong speaker, as in the Claude test', () => {
    const recommendation = recommend([
      summary({ label: 'Opus', meanScore: 9, costPerExplanation: 0.013 }),
      summary({
        label: 'Sonnet',
        meanScore: 6.5,
        wrongSpeakerOrScene: 2,
        costPerExplanation: 0.004,
      }),
    ]);
    expect(recommendation.recommended?.label).toBe('Opus');
  });

  it('picks the cheapest model within 0.5 points of the best', () => {
    const recommendation = recommend([
      summary({ label: 'Expensive', meanScore: 8.7, costPerExplanation: 0.0052 }),
      summary({ label: 'Close and cheap', meanScore: 8.3, costPerExplanation: 0.0026 }),
      summary({ label: 'Cheapest but weaker', meanScore: 7.9, costPerExplanation: 0.001 }),
    ]);
    expect(recommendation.recommended?.label).toBe('Close and cheap');
    expect(recommendation.eligible.map((model) => model.label)).toEqual([
      'Close and cheap',
      'Expensive',
    ]);
  });

  it('breaks a cost tie by lower latency', () => {
    const recommendation = recommend([
      summary({ label: 'Slow', costPerExplanation: 0.002, meanLatencyMs: 5000 }),
      summary({ label: 'Fast', costPerExplanation: 0.002, meanLatencyMs: 2000 }),
    ]);
    expect(recommendation.recommended?.label).toBe('Fast');
  });

  it('never recommends a model with a failed call', () => {
    const recommendation = recommend([
      summary({
        label: 'Cheap but failed',
        costPerExplanation: 0.001,
        failedCalls: 1,
        meanScore: 8,
      }),
      summary({ label: 'Reliable', costPerExplanation: 0.003, meanScore: 8 }),
    ]);
    expect(recommendation.recommended?.label).toBe('Reliable');
  });

  it('recommends nothing when no model meets every condition', () => {
    const recommendation = recommend([summary({ label: 'Only one', failedCalls: 2 })]);
    expect(recommendation.recommended).toBeNull();
    expect(recommendation.reason).toContain('No model met all three conditions');
  });
});
