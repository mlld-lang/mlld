---
updated: 2026-05-05
tags: #runtime, #performance, #memory, #optimization
related-docs: docs/dev/DOCS-DEV.md, docs/dev/TESTS.md, spec-testing-infra.md, plan-testing-infra.md
related-code: core/types/security.ts, core/types/record.ts, core/types/variable/ArrayHelpers.ts, core/types/variable/VarMxHelpers.ts, core/security/url-provenance.ts, interpreter/env/Environment.ts, interpreter/eval/exec-invocation.ts, interpreter/eval/exe/block-execution.ts, interpreter/session/runtime.ts, interpreter/tracing/RuntimeTraceManager.ts, interpreter/utils/structured-value.ts
related-types: core/types/security { SecurityDescriptor, ToolProvenance }, core/types/variable { Variable }
---

# Optimization

## tldr

- Reproduce first. Prefer deterministic zero-LLM harnesses over live agent runs.
- Preserve the interpreter path in the repro: `exe llm`, sessions, guards, and scoped config matter more than the provider.
- Separate retained heap from RSS peaks. A faster run can briefly use more RSS because it has more useful work in flight.
- Use CPU profiles for speed, heap snapshots for retained memory, and runtime trace only for phase attribution.
- Keep security semantics fixed. Do not strip factsources, proof metadata, labels, tool provenance, or eager URL extraction to win a benchmark.
- Track every optimization in an `OPTZ:*` ticket before changing code.

## Principles

- **Ticket first.** Use `OPTZ:MEM:`, `OPTZ:SPEED:`, or `OPTZ:INFRA:` in the title. Record the repro command, baseline numbers, intended invariant tests, and linked historical tickets.
- **Small evidence, then refactor.** Start with a narrow profile or heap snapshot. A high-impact fix can still be a refactor, but it needs a measured owner.
- **No semantic shortcuts.** If an optimization can change label flow, no-novel-urls enforcement, proof recovery, session state, or factsource preservation, write characterization tests before the refactor.
- **Low-cardinality tracing.** Trace labels should name phases and thresholds. Do not emit large payloads or high-cardinality keys into trace output.
- **Cache immutable things.** Broad caches over mutable runtime objects are suspect. Cache frozen, interned, descriptor-normalized, or string-derived data with explicit invalidation boundaries.

## Current Workflow

When changing mlld runtime optimization code and validating against the clean repo harness:

```bash
cd ~/mlld/mlld
npm run build
```

Then run the deterministic c-8dff/UT19 mock harness from the clean repo:

```bash
cd ~/mlld/clean
MLLD_HEAP=12g MOCK_TIMEOUT_S=240 uv run --project bench python3 scripts/repro_c63fe_mem.py
```

Or run it through the local perf harness:

```bash
cd ~/mlld/mlld
npm run perf:harness -- tests/performance/scenarios/c8dff-ut19-mock.json --mode short
```

The harness files are:

- `~/mlld/clean/rig/test-harness/mock-opencode.mld`
- `~/mlld/clean/rig/test-harness/run-ut19-mock.mld`
- `~/mlld/clean/rig/test-harness/fixtures/ut19-tool-script.json`
- `~/mlld/clean/scripts/repro_c63fe_mem.py`
- `~/mlld/clean/rig/test-harness/README.md`

The mock must be declared as `exe llm`. That is what makes `with { session: @planner }` enter the session path. A plain `exe` mock does not reproduce the hot path.

Use short capped runs while hillclimbing. Use full harness runs only when measuring proof of improvement. The native mlld version of this harness is tracked by `m-5203`; perf gate wiring is tracked by `m-9485`.

## Instruments

- **CPU profile:** use for speed tickets. `--cpu-prof` may not flush when a worker is killed by a timeout; inspector-driven profiles against the live worker are more reliable for c-8dff. Keep exact profiling commands on `m-8f1a`.
- **Heap snapshot:** use for retained memory. Signal-triggered heap snapshots are more useful than heap profiles when the process may not exit cleanly.
- **Runtime trace:** use for phase attribution and thresholds. `m-9712` showed that broad labels like `llm.exec.resolve` can hide caller-side projection and helper churn.
- **Trace-memory summaries:** keep bounded. `m-15d9` owns trace summary hygiene.
- **Perf harness:** use `npm run perf:harness -- <scenario.json> --mode short` for child-process scenarios with wall/RSS/budget output. Harness correctness tests run in the default suite; performance scenarios and benchmarks remain opt-in.

## Perf Scenarios

Perf scenarios live under `tests/performance/scenarios/*.json` and run in isolated child processes:

```bash
npm run perf:harness -- tests/performance/scenarios/sdk-smoke.json --mode short
npm run perf:harness -- tests/performance/scenarios/security-module-smoke.json --mode short --save
npm run perf:harness -- tests/performance/scenarios/c8dff-ut19-mock.json --mode full --artifact-dir /tmp/c8dff-perf
```

Scenario fields:

- `name`: stable scenario id used in output and saved result filenames.
- `target`: `process`, `cli-script`, `sdk-script`, `module`, or `fixture-replay`.
- `cwd`: working directory. Supports `{repoRoot}` and `~`.
- `entry`: target entrypoint. `cli-script`, `sdk-script`, and `module` infer commands from this.
- `command` / `args`: explicit process command. Required for `process` and current `fixture-replay` scenarios.
- `collect`: any of `wall`, `rss`, `trace`, `trace-memory`, `cpu`, `heap`. RSS samples the process tree. Trace collectors set `MLLD_TRACE*`; CPU/heap collectors set Node diagnostic options and write artifacts.
- `modes`: named mode configs such as `short` and `full`. Mode values override root fields.
- `budgets`: hard limits for `exitCode`, `wallMs`, `peakRssMb`, and metric `min`/`max`.
- `regression`: optional baseline comparison thresholds: `wallMsPct`, `peakRssMbPct`, `metricsPct`.
- `preRun`: optional command steps run before the scenario.

Child processes can emit extra metrics as JSON lines:

```json
{"type":"metric","name":"avgMergeUs","value":12.4}
```

Use `--save` to write a timestamped result under `.perf-results/`, `--output result.json` to pick a path, and `--baseline result.json` to enforce the scenario's `regression` thresholds.

## Current Hot Paths

- `core/types/variable/ArrayHelpers.ts`: helper attachment and quantifier projections. `m-9179` fixed eager text projection that retained huge serialized handle strings.
- `core/types/security.ts`: descriptor merge, descriptor identity, and tool provenance canonicalization. Keep audit refs tied to actual audit events; auditless helper provenance creates unbounded histories.
- `core/types/record.ts`: record projection metadata interning. Profiles after the 2026-05 pass still show `stableSerialize` and projection interning as measurable overhead.
- `core/security/url-provenance.ts`: eager URL extraction. Eager extraction is required for no-novel-urls; optimize with object/text caches and boundary scoping, not laziness.
- Guard input materialization: `prepareExecGuardInputs` and `materializeGuardInput` still show up after descriptor fixes. Avoid full Variables when no matching guard or policy can inspect them.
- Captured module scope rehydration: much cheaper after data-slot sealing, but still visible in full zero-LLM profiles.
- Session retention: `sessionWrites`, final session snapshots, `completedSessions`, and `traceValues`. `m-7316`, `m-c902`, and `m-98b7` own the next retained-memory questions.

## Ticket Map

- `m-5203` - `OPTZ:INFRA: Bring deterministic c-8dff-style optimization harness into mlld`
- `m-9485` - `OPTZ:INFRA: Add memory and speed performance gates`
- `m-8f1a` - `OPTZ:SPEED: Profile post-fix c-8dff wall-time bottlenecks`
- `m-79a7` - `OPTZ:SPEED: Cache eager URL extraction for immutable values`
- `m-77e3` - `OPTZ:SPEED: Explore immutable security descriptor merge cache`
- `m-8f79` - `OPTZ:MEM: Re-profile retained heap after c-8dff wins`
- `m-98b7` - `OPTZ:MEM: Audit late real-travel heap jumps`
- `m-7316` - `OPTZ:MEM: Summarize sessionWrites payloads`
- `m-c902` - `OPTZ:MEM: Decouple traceValues from observer snapshots`
- `m-15d9` - `OPTZ:MEM: Keep retained-payload trace summaries bounded`
- `m-0710` - closed cascade umbrella. Kept as the bridge/c-63fe historical reference.

## Optimization Log

Recent items are reverse chronological.

- **2026-05-04, post-regression cleanup: record projection and captured-env memoization.** Zero-LLM UT19 B[all] merge-stop moved from the post-fix native band of ~29.9s reported / ~31.1s wall under profile to 24.4-24.8s reported / 25.6-26.0s wall. Retained changes: `core/types/record.ts` caches record display serialization and builds projection intern keys without `stableSerialize -> JSON.parse -> stableSerialize`; `core/security/url-provenance.ts` walks object keys with per-key descriptor checks instead of allocating full descriptor maps; `CapturedEnvRehydrator` skips captured module `Map`s already rehydrated. Profile deltas: `stableSerialize` ~1937ms self -> below top buckets, `internRecordFieldProjectionMetadata` ~415ms -> ~2ms, `extractUrlsFromValueInternal` ~1939ms -> ~876ms, `rehydrateNestedCapturedModuleScope` ~1071ms -> ~2ms. Rejected by measurement: guard-local structured variable construction (regressed B[all] to 78.6s), descriptor small-array fast paths (regressed to ~28.4s), `://` URL gating and `RegExp.exec()` loop (noise and/or future scheme-less URL tradeoff).
- **2026-05-04, zero-LLM UT19 resolved-family diagnostic: JS fastpath remains a useful control, not the active route.** Swapping `~/mlld/clean/rig/intent.resolved-family-fastpath.experimental.mld` over native `intent.mld` on B[all] improved merge-stop 29.5s -> 20.2s, results-stop 31.7s -> 21.8s, and full B step 31.3s -> 21.6s. A[all] stayed flat at 10.1s. Interpretation: the remaining delta is native helper churn around resolved-family expansion, repeated tolerant field access, `.isDefined()`, projection metadata interning, URL extraction, and guard materialization. Do not move provenance logic into app JS without parity tests; use this file as a control for runtime work or as the shape of a native primitive.
- **2026-05-04, commit `776c0579e`: restore security metadata propagation after the speed pass.** Fixed four regressions from optimization work: condition descriptors isolated in child envs, imported block-style `llm` wrappers returning scalar Variables as JSON, nested exe effects assigned to locals not contaminating block returns, and direct `.mx` access after returning a let-bound variable. Full suite passed: 569 files, 6688 tests. B[all] merge-stop sanity stayed in-band at 29.3s reported / 30.8s wall. Coverage risk: block returns must preserve metadata wrappers for post-invocation field access while LLM result wrapping still normalizes scalar values.
- **2026-05-04, commit `975a0ff76`: reduce security/provenance representation overhead.** The corrected native zero-LLM UT19 route improved A[all] 74.1s -> 11.1s, B[4] merge-stop 87.6s -> 12.9s, and B[all] merge-stop timeout-at-300s -> 29.0s. The key fixes were descriptor pair merge caching, normalized tool-array metadata, `mx -> SecurityDescriptor` identity caches, preserving normalized descriptor arrays on Variables and StructuredValues, avoiding duplicate structured URL extraction, skipping schema-validation arg construction when no schema exists, and attaching tool provenance only when there is an audit boundary. Lesson: security/provenance was not inherently too expensive; repeated cloning and auditless nested helper histories were.
- **2026-05-04, native runtime pre-pass: remove recursive descriptor recording and captured-env churn.** Before `975a0ff76`, the native UT19 route moved from A[0-2] 28.2s -> 17.6s and A[all] 74.1s -> 45.6s by recording parent-scope variable descriptors only once in the requesting env, no-oping empty/identical descriptor records, caching `mx -> SecurityDescriptor`, and making captured module env sealing idempotent data-slot writes. `sealCapturedModuleEnv` dropped from 2.8s self to 0.17s self in the A[0-2] profile.
- **2026-05-04, native B cleanup: guard and URL prechecks.** B[4] dispatch-stop improved 68.9s -> 54.1s and B[4] merge-stop 87.6s -> 67.3s before the deeper descriptor pass. Surviving changes reused already-materialized pre-guard Variables, delayed user-hook error-bucket construction until matching hooks exist, added a conservative URL text prefilter, used Sets for builtin method lookup, skipped object-builtin command-name variable lookup, and skipped post-guard materialization when no after-guard can match. A broader field-access shortcut was reverted because it broke structured arg rebuilds and schema-invalid after-guard behavior.
- **2026-04-27, `m-2883`, commit `6d36f5ad5`: speed up security descriptor canonicalization.** The zero-LLM c-8dff/UT19 harness dropped from 9+ minutes to 158.5s. Clean c-63fe-class rerun improved wall time from ~925s to 327s and average from 787s to 208s; all 6 tasks completed in budget. Coverage risk: descriptor fast paths must preserve tool provenance order, `policyContext` precedence, labels, taint, factsources, and no-novel-urls behavior.
- **2026-04-27, `m-9179`, commit `8a0e3320d`: lazy array helper text projection.** Direct c-8dff worker RSS at ~75s dropped from 2.66-2.71GB to ~840MB. Heap snapshot large serialized handle strings dropped from 9 x ~10.1MB to zero. Coverage risk: text quantifiers now project on demand; metadata aggregates still need eager stable behavior.
- **2026-04-27, `m-9712` and `m-8535`, commit `c698d393d`: threshold exec entry memory attribution.** This separated broad `llm.exec.resolve` memory from caller-side helper/projection churn and led to `m-9179`. Coverage risk: instrumentation must remain bounded and low-cardinality.
- **2026-04-27, `m-0710`: MCP cascade closed as a solved umbrella.** The latest clean run shows c-63fe infrastructure is no longer the blocker. Remaining UT12/UT19 failures are answer quality/eval issues, not timeout cascade.

Older stable lessons:

- **`m-60ed`: child environment release.** Travel OOM dropped from ~4.4GB heap exhaustion to bounded runs. Lesson: scope/session retention can dominate over apparent data size.
- **`m-3b4c`: recursive deep-copy in iterable normalization.** A small script can allocate exponentially when captured environments are serialized recursively. Prefer opaque/runtime references at boundaries that do not need plain data.
- **`m-4b14`: var-bound catalog-shaped object traversal.** Identity memoization matters when catalog walkers repeatedly unwrap proxy-shaped runtime values.
- **`m-e663`: proof-sensitive materialization tracing.** Optimizations around display, helper, or JSON/plain-data projection must preserve proof/factsource metadata or emit a clear trace when recovery is attempted.
- **`m-1841`, `m-2241`, `m-1446`, `m-4193`: long session retention.** Session writes, completed sessions, callback histories, and final snapshots are plausible retained-memory owners. Do not treat them as solved just because the c-63fe cascade is solved.

## Gotchas

- `--trace-memory` can change the memory profile if it records payloads. Use summaries and thresholds.
- RSS is not retained heap. Validate memory wins with heap snapshots when possible.
- Speed wins can raise transient RSS. Judge them by wall time, budget completion, retained heap, and peak duration.
- Eager URL extraction is a security invariant for no-novel-urls. Optimize with safe caches, not delayed extraction.
- Frozen/interned arrays and objects are valid runtime values. Helper decoration must tolerate non-extensible backing values.
- Clean repo harness results require the local mlld build. Rebuild in `~/mlld/mlld` before running clean repros.
