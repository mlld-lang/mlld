# PIPELINE HARNESS

Structured harness runs short pipeline sequences and flags regressions where structured values collapse to plain text or lose metadata.

## RUNNING
- `npm run test:pipeline-harness` runs the harness suite directly.
- `npm test` already includes the harness because the spec file lives under `tests/`.

## STAGE LIBRARY
- Stage helpers live in `stages.ts` with tags that announce capabilities (for example `parallel`, `retry`, `structured`).
- `beforeSequence`, `preservesData`, and `requiresArrayInput` flags guide the harness about retries, metadata assertions, and preconditions.
- Add new building blocks by extending the stage library and tagging expectations; the harness picks them up automatically.

## INPUTS
- Representative seeds live in `inputs.ts` and cover text, JSON, nested arrays, and loader-style structured values.
- Each input builder returns a fresh value so retries and metadata checks stay isolated.

## ASSERTIONS
- The harness compares each stage output against the previous structured value and fails if the type downgrades to `text` without opt-in.
- Metadata keys such as `source`, `loadResult`, `filename`, `relative`, and `absolute` must survive through stages marked `preservesData`.
- Failure messages print the stage pipeline and a per-stage summary from `describeStage()` to speed up diagnosis.
