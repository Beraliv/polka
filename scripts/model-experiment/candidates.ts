import type { AiProviderCode } from '../../packages/shared/src/index.ts';
import {
  EXPLAIN_CLAUDE_SETUP,
  EXPLAIN_GEMINI_SETUP,
} from '../../apps/server/src/lib/explain-settings.ts';

// Prices are USD per 1M tokens. A price with `from` applies from that date
// (ISO), and the report shows it next to the current price.
export type ModelPrice = {
  inputPerMillion: number;
  outputPerMillion: number;
  from?: { date: string; inputPerMillion: number; outputPerMillion: number };
};

// A model setup the experiment runs. `effort` is Claude's output_config effort;
// `thinkingLevel` is Gemini's thinking configuration. Exactly one is set.
export type ModelCandidate = {
  label: string;
  model: string;
  effort?: 'low' | 'medium' | 'high';
  thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  price: ModelPrice;
};

export type ProviderSetup = {
  provider: AiProviderCode;
  candidates: ModelCandidate[];
  // The setting the Explain route uses today, to compare the recommendation with.
  appSetting: { model: string; effortOrThinkingLevel: string };
  // Hand-written notes carried into the generated doc, kept here so a regeneration keeps them.
  notes: string[];
};

export type JudgeSetup = {
  model: string;
  effort?: 'low' | 'medium' | 'high';
  thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
};

// The judge scores answers from the other provider, so no provider marks its
// own answers. Override with `--judge`.
export const JUDGE_SETUPS: Record<AiProviderCode, JudgeSetup> = {
  claude: { model: 'claude-opus-5-5', effort: 'low' },
  gemini: { model: 'gemini-4-carbon', thinkingLevel: 'LOW' },
};

export const PROVIDER_SETUPS: Record<AiProviderCode, ProviderSetup> = {
  claude: {
    provider: 'claude',
    candidates: [
      {
        label: 'Opus 5.5 (low)',
        model: 'claude-opus-5-5',
        effort: 'low',
        price: { inputPerMillion: 4, outputPerMillion: 20 },
      },
      {
        label: 'Sonnet 5.5 (low)',
        model: 'claude-sonnet-5-5',
        effort: 'low',
        price: { inputPerMillion: 2, outputPerMillion: 10 },
      },
      {
        label: 'Haiku 5.5 (medium)',
        model: 'claude-haiku-5-5',
        effort: 'medium',
        price: { inputPerMillion: 0.1, outputPerMillion: 0.5 },
      },
    ],
    appSetting: {
      model: EXPLAIN_CLAUDE_SETUP.model,
      effortOrThinkingLevel: `${EXPLAIN_CLAUDE_SETUP.effort} effort`,
    },
    notes: [
      'Chat is not covered: it uses `claude-opus-5` at 4,096 tokens without an effort setting (`apps/server/src/routes/chat.ts`).',
      'Each model is tested at one effort level only.',
      'Claude reports thinking inside its output tokens, so the thinking column is 0 for Claude.',
      'Opus caches at $0.20 per 1M input tokens, and batch pricing is half the standard rate. Neither applies to Explain, which sends a new passage each time.',
    ],
  },
  gemini: {
    provider: 'gemini',
    candidates: [
      {
        label: 'Gemini 4 Carbon (low)',
        model: 'gemini-4-carbon',
        thinkingLevel: 'LOW',
        price: {
          inputPerMillion: 2,
          outputPerMillion: 10,
          from: { date: '2026-12-01', inputPerMillion: 4, outputPerMillion: 20 },
        },
      },
      {
        label: 'Gemini 4 Hydrogen (low)',
        model: 'gemini-4-hydrogen',
        thinkingLevel: 'LOW',
        price: { inputPerMillion: 1.5, outputPerMillion: 7.5 },
      },
      {
        label: 'Gemini 3.5 Flash-Lite (medium)',
        model: 'gemini-3.5-flash-lite',
        thinkingLevel: 'MEDIUM',
        price: { inputPerMillion: 0.3, outputPerMillion: 2.5 },
      },
    ],
    appSetting: {
      model: EXPLAIN_GEMINI_SETUP.model,
      effortOrThinkingLevel: `${EXPLAIN_GEMINI_SETUP.thinkingLevel.toLowerCase()} thinking`,
    },
    notes: [
      "Use a paid-tier key for the app. The free tier may use the data to improve Google's products, and reader passages should not be part of that.",
      'Each model is tested at one thinking level only.',
    ],
  },
};
