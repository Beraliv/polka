# Model experiment

A script that compares the AI models for Explain on a fixed set of passages, scores the answers, and rewrites the provider's decision record with a recommendation. It is a maintainer tool: nothing in it runs in the app.

## Where it lives

| File                                                                                                     | Role                                                                                  |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`scripts/model-experiment/index.ts`](../scripts/model-experiment/index.ts)                              | Command line: arguments, orchestration, writing the doc                               |
| [`scripts/model-experiment/passages.ts`](../scripts/model-experiment/passages.ts)                        | The ten Anna Karenina passages and their fact keys                                    |
| [`scripts/model-experiment/candidates.ts`](../scripts/model-experiment/candidates.ts)                    | Models under test, prices, the judge, the setting the app uses, notes kept in the doc |
| [`scripts/model-experiment/run-explanation.ts`](../scripts/model-experiment/run-explanation.ts)          | One Explain call and its measurements                                                 |
| [`scripts/model-experiment/judge.ts`](../scripts/model-experiment/judge.ts)                              | Blind scoring of one passage's answers                                                |
| [`scripts/model-experiment/analyse.ts`](../scripts/model-experiment/analyse.ts)                          | Means, ranges, cost per explanation, the recommendation                               |
| [`scripts/model-experiment/report.ts`](../scripts/model-experiment/report.ts)                            | The markdown document                                                                 |
| [`apps/server/src/lib/explain-settings.ts`](../apps/server/src/lib/explain-settings.ts)                  | The Explain prompt, token cap and per-provider setup, shared with the app             |
| [`docs/claude-models.md`](../docs/claude-models.md), [`docs/gemini-models.md`](../docs/gemini-models.md) | The documents the script writes                                                       |

## Behaviour

- **Command:** `pnpm model-experiment claude` or `pnpm model-experiment gemini`. Options:
  - `--dry-run`: runs the whole experiment and prints the document to the terminal, without writing either file.
  - `--passages <n>`: uses the first `n` passages, for a cheap check. It only works with `--dry-run`, because the document needs all ten passages.
  - `--judge claude|gemini`: overrides the judge provider. The default is the other provider.
- **Keys:** the script needs the key of the provider under test and of the judge's provider. A missing key stops the run before any call, with the same message the server gives (`ANTHROPIC_API_KEY is not configured on the server`).
- **Workload:** each call is what Explain sends: the same system prompt, prompt format, 4,000-token cap, effort or thinking level, and (for Claude) server-side refusal fallbacks. The book is _Анна Каренина_ by Лев Толстой, answers in English.
- **Measured per call:** total latency, time to first text, input, output and thinking tokens, and the stop reason. A call that errors, is cut off at the cap, or is declined counts as failed.
- **Scoring:** one judge call per passage. The three answers are shuffled and labelled with letters, and the judge scores each from 0 to 10 against the passage's fact key (speaker, listener, scene, notable words), and says whether it names the wrong speaker or scene. The judge never sees model names.
- **Analysis per model:** mean and range of score; mean and range of latency; mean input, output and thinking tokens; the number of wrong speaker or scene answers; failed calls; and cost per explanation, `input × input price + (output + thinking) × output price`, at today's prices. Claude reports no separate thinking tokens, so its output count already includes them.
- **Recommendation:** a model is eligible when it has no failed call, its mean score is within 0.5 of the best mean, and its wrong speaker or scene count is no higher than the best. The cheapest eligible model is recommended; ties go to the lower mean latency.
- **The document:** the script owns the whole file and rewrites it. Sections, in order: **Decision** (the recommended model, the reason from the data, and whether it matches the setting the app uses), **Models setup** (model, ID, effort or thinking level), **Experiment** (date, passages, settings, judge, method), **Results**, **Cost** (today's prices, and upcoming prices where a model has them), and **Notes** (carried over from `candidates.ts`).
- **Failures:** a failed call stays in the means as a zero score and counts as a failure, so it can't be dropped to improve a model's average. A judge call that fails or returns unparseable JSON stops the run with an error; the script never guesses a score.
- **Cost of one run:** 30 Explain calls and 10 judge calls. At the prices in `candidates.ts`, a full Claude run costs about 20 cents and a full Gemini run under 10 cents.

## Design

### The app's settings are the single source

`apps/server/src/lib/explain-settings.ts` holds the Explain prompt, the cap and the per-provider setup the route uses today. The route and the script both import it, so the experiment cannot drift from the app. Adding a model to the experiment is a line in `candidates.ts`; changing the app's Explain settings is a change in `explain-settings.ts` and shows up in the next run.

### Pure logic apart from I/O

Shuffling, analysis, the recommendation rule and the report are pure functions with unit tests (`node --test scripts/model-experiment/`). Only `run-explanation.ts`, `judge.ts` and `index.ts` call the APIs or write files.

### Adding a model or a passage

- A model: add a `ModelCandidate` to its provider in `candidates.ts` with its price. The price should be the current list price.
- A passage: add an entry to `EXPERIMENT_PASSAGES` with a fact key that names the speaker and scene. Changing passages changes every past result, so re-run both providers afterwards.

## Invariants

- The experiment sends exactly what Explain sends. A change to the app's Explain settings is picked up without editing the script.
- The judge never sees which model wrote an answer, and the label-to-model key is kept only in memory.
- A failed call is never removed from a model's results.
- The script never changes app code or the model the app uses. It only writes the two decision documents.
- The passages stay the same between runs, so the documents compare like with like.
