// Runs the Explain model experiment for one provider and rewrites that
// provider's decision record. See specs/model-experiment.md.
//
//   pnpm model-experiment claude|gemini [--dry-run] [--passages <n>] [--judge claude|gemini]

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AiProviderCode } from '../../packages/shared/src/index.ts';
import { providerUnavailableError } from '../../apps/server/src/lib/ai-provider.ts';
import { JUDGE_SETUPS, PROVIDER_SETUPS, type ModelCandidate } from './candidates.ts';
import { EXPERIMENT_PASSAGES } from './passages.ts';
import { runExplainCall, type ExplainCallResult } from './run-explanation.ts';
import { judgePassage, type JudgeVerdict } from './judge.ts';
import { isFailedCall, recommend, summariseModel, type ExperimentCall } from './analyse.ts';
import { renderReport } from './report.ts';

const BOOK_NAME = 'Анна Каренина';
const AUTHOR = 'Лев Толстой';
const ANSWER_LANGUAGE = 'en';

type Options = {
  provider: AiProviderCode;
  dryRun: boolean;
  passageCount: number;
  judgeProvider: AiProviderCode;
};

const PROVIDER_CODES: AiProviderCode[] = ['claude', 'gemini'];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseOptions(argv: string[]): Options {
  const [providerArgument, ...flags] = argv;
  if (!PROVIDER_CODES.includes(providerArgument as AiProviderCode)) {
    fail(
      'Usage: pnpm model-experiment claude|gemini [--dry-run] [--passages <n>] [--judge claude|gemini]',
    );
  }
  const provider = providerArgument as AiProviderCode;
  let dryRun = false;
  let passageCount = EXPERIMENT_PASSAGES.length;
  let judgeProvider: AiProviderCode = provider === 'claude' ? 'gemini' : 'claude';

  for (let index = 0; index < flags.length; index++) {
    const flag = flags[index];
    if (flag === '--dry-run') {
      dryRun = true;
    } else if (flag === '--passages') {
      passageCount = Number(flags[++index]);
      if (
        !Number.isInteger(passageCount) ||
        passageCount < 1 ||
        passageCount > EXPERIMENT_PASSAGES.length
      ) {
        fail(`--passages must be a whole number from 1 to ${EXPERIMENT_PASSAGES.length}`);
      }
    } else if (flag === '--judge') {
      const requested = flags[++index];
      if (!PROVIDER_CODES.includes(requested as AiProviderCode)) {
        fail('--judge must be claude or gemini');
      }
      judgeProvider = requested as AiProviderCode;
    } else {
      fail(`Unknown option: ${flag}`);
    }
  }

  // A partial run is only useful as a check; writing it would replace the
  // full results with fewer passages.
  if (!dryRun && passageCount !== EXPERIMENT_PASSAGES.length) {
    fail(
      'A run with --passages can only be used with --dry-run, because the document needs all passages.',
    );
  }
  return { provider, dryRun, passageCount, judgeProvider };
}

function requireKeys(providers: AiProviderCode[]) {
  for (const provider of new Set(providers)) {
    const unavailableError = providerUnavailableError(provider);
    if (unavailableError) {
      fail(unavailableError);
    }
  }
}

function describeJudge(judgeProvider: AiProviderCode): string {
  const judge = JUDGE_SETUPS[judgeProvider];
  const setting = judge.effort
    ? `${judge.effort} effort`
    : `${judge.thinkingLevel?.toLowerCase()} thinking`;
  return `\`${judge.model}\`, ${setting}`;
}

function progress(message: string) {
  console.error(message);
}

async function runPassageCalls({
  options,
  candidates,
  passageId,
  passageText,
}: {
  options: Options;
  candidates: ModelCandidate[];
  passageId: number;
  passageText: string;
}): Promise<ExplainCallResult[]> {
  const results: ExplainCallResult[] = [];
  for (const candidate of candidates) {
    const result = await runExplainCall({
      provider: options.provider,
      candidate,
      request: {
        passage: passageText,
        bookName: BOOK_NAME,
        author: AUTHOR,
        language: ANSWER_LANGUAGE,
      },
    });
    progress(
      `  passage ${passageId} · ${candidate.label} · ${(result.latencyMs / 1000).toFixed(1)} s${result.errorMessage ? ` · error: ${result.errorMessage}` : ''}`,
    );
    results.push(result);
  }
  return results;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const setup = PROVIDER_SETUPS[options.provider];
  requireKeys([options.provider, options.judgeProvider]);

  const passages = EXPERIMENT_PASSAGES.slice(0, options.passageCount);
  const callsByCandidate = new Map<string, ExperimentCall[]>(
    setup.candidates.map((candidate) => [candidate.label, []]),
  );

  progress(
    `Running ${setup.candidates.length} models on ${passages.length} passages; judge: ${describeJudge(options.judgeProvider)}`,
  );
  for (const passage of passages) {
    const results = await runPassageCalls({
      options,
      candidates: setup.candidates,
      passageId: passage.id,
      passageText: passage.text,
    });
    const verdicts: JudgeVerdict[] = await judgePassage({
      judge: JUDGE_SETUPS[options.judgeProvider],
      judgeProvider: options.judgeProvider,
      passage,
      answers: results.map((result) => ({ text: isFailedCall(result) ? '' : result.text })),
      seed: passage.id,
    });
    setup.candidates.forEach((candidate, index) => {
      callsByCandidate.get(candidate.label)!.push({
        result: results[index]!,
        verdict: verdicts[index]!,
      });
    });
    progress(`  passage ${passage.id} judged`);
  }

  const summaries = setup.candidates.map((candidate) =>
    summariseModel({ candidate, calls: callsByCandidate.get(candidate.label)! }),
  );
  const recommendation = recommend(summaries);
  const document = renderReport({
    provider: options.provider,
    experimentDate: new Date().toISOString().slice(0, 10),
    passageCount: passages.length,
    judgeLabel: describeJudge(options.judgeProvider),
    appSetting: { model: setup.appSetting.model, setting: setup.appSetting.effortOrThinkingLevel },
    summaries,
    recommendation,
    notes: setup.notes,
  });

  if (options.dryRun) {
    console.log(document);
    return;
  }
  const documentPath = join(
    import.meta.dirname,
    '..',
    '..',
    'docs',
    `${options.provider}-models.md`,
  );
  await writeFile(documentPath, document);
  progress(`Wrote ${documentPath}`);
}

await main();
