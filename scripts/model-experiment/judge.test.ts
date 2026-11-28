import { describe, expect, it } from 'vitest';
import { letterLabels, parseJudgeVerdicts, shuffleWithSeed } from './judge.ts';

describe('shuffleWithSeed', () => {
  it('returns a permutation of the input', () => {
    const shuffled = shuffleWithSeed(['a', 'b', 'c', 'd'], 3);
    expect([...shuffled].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('gives the same order for the same seed', () => {
    expect(shuffleWithSeed([1, 2, 3, 4, 5], 7)).toEqual(shuffleWithSeed([1, 2, 3, 4, 5], 7));
  });

  it('can give a different order for a different seed', () => {
    const orders = new Set(
      [1, 2, 3, 4, 5].map((seed) => shuffleWithSeed([1, 2, 3, 4, 5, 6], seed).join(',')),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe('letterLabels', () => {
  it('labels answers A, B, C', () => {
    expect(letterLabels(3)).toEqual(['A', 'B', 'C']);
  });
});

describe('parseJudgeVerdicts', () => {
  const labels = ['A', 'B'];

  it('reads the JSON object even with text around it', () => {
    const raw =
      'Here you go:\n{"verdicts":[{"label":"A","score":7,"wrongSpeakerOrScene":false},{"label":"B","score":3,"wrongSpeakerOrScene":true}]}\nDone.';
    const verdicts = parseJudgeVerdicts({ raw, labels });
    expect(verdicts.get('B')).toEqual({ score: 3, wrongSpeakerOrScene: true });
  });

  it('fails when a label has no verdict', () => {
    const raw = '{"verdicts":[{"label":"A","score":7,"wrongSpeakerOrScene":false}]}';
    expect(() => parseJudgeVerdicts({ raw, labels })).toThrow('no verdict for answer B');
  });

  it('fails on a reply without JSON', () => {
    expect(() => parseJudgeVerdicts({ raw: 'I cannot score these.', labels })).toThrow(
      'no JSON object',
    );
  });

  it('clamps scores to the 0–10 range', () => {
    const raw =
      '{"verdicts":[{"label":"A","score":12,"wrongSpeakerOrScene":false},{"label":"B","score":-1,"wrongSpeakerOrScene":false}]}';
    const verdicts = parseJudgeVerdicts({ raw, labels });
    expect(verdicts.get('A')?.score).toBe(10);
    expect(verdicts.get('B')?.score).toBe(0);
  });
});
