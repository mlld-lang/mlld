# Advisor Briefing: mlld Security Model and Docs

This document orients a fresh Claude session to serve as Adam's advisor on mlld's security model, documentation, and design. Read this first. Explore the referenced docs when specific topics come up.

## Role and Context

You're advising on mlld's security model, documentation, and architectural design. Adam is the creator of mlld — a scripting language for LLM workflows. He works with multiple LLM agents: GPT (o3/4o) handles most runtime implementation, Claude handles design review, docs authoring, and architectural thinking.

The primary working repos:
- `~/mlld/mlld` — the mlld runtime (TypeScript)
- `~/mlld/benchmarks` — AgentDojo-style security benchmarks testing the security model

The key module direction: `@mlld/agentflow` — a reusable module for defended capability-oriented agents, being extracted from the benchmark's policygen architecture.

## The Security Model in 60 Seconds

You can't stop an LLM from being tricked by prompt injection. You CAN stop the consequences from manifesting. mlld's security model enforces rules at the runtime level regardless of what the LLM decides.

The model has five independent layers. Each catches attacks the others miss:

1. **Taint tracking** — contaminated data can't flow into sensitive operations
2. **Fact-based proof** — authorization-critical values must come from authoritative sources
3. **Display projections** — the LLM can't exfiltrate what it can't see
4. **Authorization** — the planner constrains which tools and values the worker can use
5. **Typed state** — shelf slots validate grounding when values enter shared state

## The Five Layers

### Records classify tool output

Records declare which fields are authoritative (facts) and which are content (data). `exe @tool(...) = ... => record` coerces tool output through the record schema. Fact fields get `fact:` labels and handles. Data fields don't.

`data: { trusted, untrusted }` subdivides content — trusted data clears taint (safe to read) but doesn't carry proof (not authorization-grade). `when` clauses conditionally classify based on input data (maintainer vs external author).

See: `docs/src/atoms/core/31-records--basics.md`, `spec-trusted-data-fields.md`

### Display projections control disclosure

Five visibility modes per field: bare, ref (value + handle), masked (preview + handle), handle-only, omitted. Named display modes let one record serve different agents — workers see content, planners see handles and structured output. `display` is a strict whitelist in all forms.

The runtime automatically injects `<tool_notes>` and `<shelf_notes>` into system messages with compact security tables. No manual prompt assembly.

See: `feat-proof-preserving-return-projections.md`, `spec-tool-table.md`

### Handles preserve identity across LLM boundaries

Opaque, root-scoped, execution-scoped references to live values. Handles survive across planner/worker phases. `ref` display mode gives the LLM both the value and a handle. The runtime resolves handles at dispatch. The builder auto-upgrades `known` values to `resolved` when matching handles exist (Postel's Goldilocks).

Handle format: `h_a7x9k2` (obfuscated, not sequential). Both bare handle strings and `{ handle: "h_x" }` wrappers are accepted in control arg positions.

See: `docs/src/atoms/security/08-facts-and-handles.md`, `spec-fyi-known.md`

### Policy and guards enforce rules

Policy declares rules (`no-send-to-unknown`, `no-untrusted-destructive`, etc.). `authorizations.deny` prevents specific tools from ever being authorized. `@policy.build` validates bucketed intent (`resolved`/`known`/`allow`). Guards add imperative checks with four actions: `allow`, `deny`, `retry`, `resume`.

`resume` continues the LLM conversation without re-executing tools — critical for write workers that called tools successfully but produced malformed final output.

Taint checks scope to `controlArgs` when declared. `updateArgs` declares mutable fields (rejects no-op updates). `exactPayloadArgs` declares fields that must appear in the user's task text.

See: `docs/src/atoms/config/07b-policy--authorizations.md`, `spec-authorizations.md`, `spec-guard-resume.md`, `spec-update-args-and-payload-validation.md`

### Shelf slots provide typed state accumulation

Record-backed slots with merge semantics, cross-slot `from` constraints, and box-scoped access control. Agent writes to fact fields require handles (stricter than tool calls). `known` doesn't persist in slots. Writes are atomic. Agents read via `@fyi.shelf` with display projections.

See: `docs/src/atoms/security/08c-shelf-slots.md`, `spec-shelf-slots.md`

## The Capability Agent Pattern

The recommended secure agent architecture:

| Phase | Purpose | Display mode | Tools |
|---|---|---|---|
| **Resolve** | Find targets, ground metadata | `"planner"` | Search, list, metadata lookup |
| **Extract** | Read grounded content by ID | `"worker"` | Get-by-ID, content read |
| **Execute** | One concrete write | `"worker"` + policy | Single write tool |
| **Compose** | Form the final answer | No tools | Text composition |

The planner is clean (no untrusted content). It produces bucketed intent. `@policy.build` validates per step. Workers call `@fyi.known("toolName")` to discover handles. Collection-key dispatch: `@writeTools[@step.write_tool](@step.args) with { policy: @auth.policy }`.

Phase-shaped tools matter more than orchestration repair. Better tool boundaries beat smarter code.

See: `docs/src/atoms/patterns/04-planner.md`, `plugins/mlld/skills/security/SKILL.md`

## Key Design Principles

**Postel's Goldilocks.** Not too liberal (match everything everywhere), not too strict (handles or die), just right (confirm planner intent against authoritative sources in one well-bounded place — the builder auto-upgrade).

**Developer-declared trust.** The developer knows their domain. Records express which fields are authoritative. The runtime enforces that declaration. CaMeL's automatic provenance is cleaner theoretically but loses domain knowledge.

**Display projections > runtime blocking.** "Can't exfiltrate what you can't see" is structurally stronger than "we'll catch it at the boundary." Defense in depth.

**Handles are the primary proof path.** After the cleanup, session-local canonicalization was narrowed to builder auto-upgrade only. Handles are how proof survives across LLM boundaries. Everything else is a tolerance fallback.

**Selection beats re-derivation.** Preserve structured handle-bearing values in records. Let planners select from grounded values. Don't reconstruct identifiers in JS.

**Phase-shaped tools beat orchestration repair.** When tools mix phases (search + read content in one call), the orchestrator needs repair logic. When tools are phase-shaped, the security boundaries are clean.

**The runtime generates docs from metadata it enforces.** `<tool_notes>`, `<shelf_notes>`, `@toolDocs()` — the LLM sees security annotations derived from the same metadata the runtime checks. No drift.

**If a field contains values a downstream write tool needs as a control arg, it must be a fact.** The most common record modeling mistake. Data fields don't get handles.

**The user is the planner** (in conversational agents). Each user message is a micro-authorization. The agent is the worker. The security model is identical to policygen — the planner is just a human.

## Design Decisions That Matter

**`@fyi.facts()` was replaced by display projections + `@fyi.known()`.** Display projections embed handles in tool results. `@fyi.known()` discovers handles in the registry (including planner-attested `known` values). `@fyi.facts()` was the discovery tool that required an extra LLM call — unnecessary once handles are structural.

**Session-local canonicalization was narrowed.** The ProjectionExposureRegistry, session IDs, preview/literal matching at dispatch — all removed. The only remaining canonicalization is the builder auto-upgrade: `known` values that match an existing handle get upgraded to `resolved`. One place, one input type, one check.

**`known` requires uninfluenced source.** The entire bucketed intent must come from uninfluenced sources. Influenced workers produce data for reasoning, not authorization intent. The context worker does NOT write `resolved`, `known`, or `allow`.

**`resolved` requires handles.** Every non-empty control arg value in `resolved` must be a resolvable handle. Bare literals are rejected. Handles are the only proof that a value came from a tool result.

**Display is a strict whitelist in all forms.** Single-list `display: [name, { ref: "email" }]` and named `display: { worker: [...], planner: [...] }` both omit unlisted fields. No backward-compat split. If you want a field visible, list it.

**`taintFacts: true` is policy-rule only.** Not on exe definitions or invocations. Simpler precedence, one place to configure.

**`resume` exists alongside `retry`.** `retry` re-executes the entire exe (dangerous for write tools). `resume` continues the LLM conversation without re-executing tools. Precedence: `deny > resume > retry > allow`.

**Tool collection overrides are restrict-only.** `controlArgs`, `updateArgs`, `exactPayloadArgs` on collections can tighten but never widen.

## The Evolution Story (Compressed)

Each step solved a real problem but created the next one:

1. **Attestation registry** — exact-value rebinding for planner auth. Killed because it matched ANY value ever seen.
2. **Records + facts** — field-level trust classification. Worked but LLMs wouldn't call `@fyi.facts()` for handles.
3. **Display projections** — handles embedded in tool results. LLMs still copied previews instead of handles.
4. **Boundary canonicalization** — accept any emitted form (Postel's Law). Worked but was complex and session-local.
5. **Handle-first identity** — `ref` mode, `handle` field type. Handles became structural. Canonicalization narrowed.
6. **Postel's Goldilocks** — builder auto-upgrade is the only remaining canonicalization. Scoped to one place.
7. **Bucketed intent** — `resolved`/`known`/`allow`. Clean separation of proof sources.
8. **Shelf slots** — typed state accumulation with grounding. Replaced the bag-shaped `state_patch`.

Why this matters: someone will ask "why not just do X?" The answer is usually "we tried X at step N and it failed because Y."

## What's Shipped

See `spec-data-layer-v3.md` for the full status table (41 items). Highlights:

- Records with facts/data/trusted/display/when/validate/root adapters/array fields/handle type/object type
- Display projections (5 modes, named modes, strict whitelist)
- Handles (root-scoped, obfuscated IDs, auto-upgrade)
- `@policy.build`/`@policy.validate` with bucketed intent, deny list, task validation, compile report
- `@fyi.known()` (registry-backed, implicit injection)
- Shelf slots with grounding, `from` constraints, access control, `<shelf_notes>`
- `resume` guard action
- `updateArgs` and `exactPayloadArgs`
- Collection-key dispatch with arg spreading
- Automatic `<tool_notes>` and `<shelf_notes>` injection
- Trust refinement, taint scoping, URL exfiltration defense
- `@toolDocs()` for non-MCP cases

## What's Specced But Not Implemented

- **`@derive()`** — derived proof-bearing values from trusted inputs. For cases where the output is genuinely new, not just a selected existing value. See `req-derived-proof-bearing-values-from-trusted-sources.md`.
- **Control-flow dependency tracking** — taint through branch conditions (inspired by CaMeL). Deferred because policygen already solves the same problem architecturally. See `feat-cf-dependency-tracking--re-camel.md`.
- **Runtime effect tracing** — structured trace events for every security-relevant effect. See `spec-runtime-effect-tracing.md`.
- **Deterministic replay** — capture external I/O, replay with captured responses. See `spec-deterministic-replay.md`.
- **`@mlld/agentflow` module** — extracting the capability agent pattern into a reusable module. See `../benchmarks/capability-migration-priority-plan.md` Phase 2.
- **Long-running conversational agents** — per-turn authorization with the user as the planner. See `todo-long-running-agents-concept.md`.

## Hard-Won Lessons

**JS interop flattens bare handle wrappers.** `{ handle: "h_x" }` passed through a `js {}` exe got resolved to the underlying value. Fixed, but the boundary is still the most common proof-loss vector. See `docs/src/atoms/intro.md` (JS/Python data boundary section) and `docs/dev/DATA.md`.

**`JSON.stringify` inside JS erases mlld metadata.** Return native objects from JS blocks, not `JSON.stringify(result)`. Callers should NOT need `| @parse` on JS exe output.

**Guard `strict` mode bypasses after-guards.** `validate: "strict"` throws before the guard fires. Use `demote` (default) for LLM output validation with guard retry/resume.

**Guards on inner exe vs outer exe see different `@output`.** A guard on `@callResolveTarget` (the inner `exe llm`) sees raw LLM response. A guard on `@resolveTargetWorker` (the outer exe with `=> record`) sees coerced output. Know which you're guarding.

**`shared_with` must be a fact, not data.** If a field contains values a downstream write tool needs as a control arg, it must be `facts: [...: array]`. The most common record modeling mistake. Data fields don't get handles.

**The benchmark's JS glue was compensating for missing runtime features.** Don't improve it — delete it. Every JS helper that reimplements runtime features (auth normalization, handle validation, tool docs rendering) should be replaced by the runtime primitive, not polished.

**Shelf writes can silently fail** if slot ops aren't validated. Always validate with records + guards before applying. The apply function should trust its input — validation happens in the guard where `resume` can fire.

**Multiple real bugs in different layers create forensic debugging.** The system partially works, masking the real failure. Effect tracing and deterministic replay are the solutions. See `spec-runtime-effect-tracing.md` and `spec-deterministic-replay.md`.

## Working with Adam

- He thinks in concrete examples. Abstract descriptions frustrate him. Show the code.
- He pushes back hard. If he says "is this a bug?" he wants yes or no before the explanation.
- He values deletion over addition. Less code, fewer concepts, simpler API.
- He catches hedging immediately. Don't say "mostly" when you mean "yes."
- He often sees the simpler design before you do. Listen to his naming instincts — `@fyi.known`, Postel's Goldilocks, "the user is the planner", `data: { trusted, untrusted }` were all his framings.
- He works across multiple agents. GPT implements, Claude advises. Don't duplicate GPT's work — review it.
- He uses ticket management via `tk` CLI. Run `tk help` to use it.
- Don't write summary documents at the end of work. Update/close tickets instead.
- Use `tmp/` for temporary scripts, not `/tmp` (paths resolve relative to the repo).

## Navigation Guide

**If you need to understand the full security model:**
→ `plugins/mlld/skills/security/SKILL.md` (comprehensive, with examples and howto references)

**If you need to understand how the benchmark applies the security model:**
→ `../benchmarks/labels-policies-guards.md`

**If you need to know what's shipped vs planned:**
→ `spec-data-layer-v3.md` (status table)

**If you need to understand records:**
→ `docs/src/atoms/core/31-records--basics.md`

**If you need to understand display projections:**
→ `feat-proof-preserving-return-projections.md` (the current design with ref/handle/masked/bare/omitted and named modes)

**If you need to understand handles and facts:**
→ `docs/src/atoms/security/08-facts-and-handles.md`

**If you need to understand the authorization builder:**
→ `docs/src/atoms/config/07b-policy--authorizations.md`, `spec-authorizations.md`

**If you need to understand shelf slots:**
→ `docs/src/atoms/security/08c-shelf-slots.md`, `spec-shelf-slots.md`

**If you need to understand guard resume:**
→ `spec-guard-resume.md`

**If you need to understand the planner-worker pattern:**
→ `docs/src/atoms/patterns/04-planner.md`

**If you need to understand schema validation:**
→ `docs/src/atoms/patterns/05-schema-validation.md`

**If you need to understand JS interop boundaries:**
→ `docs/src/atoms/intro.md` (data boundary section), `docs/dev/DATA.md`

**If you need to understand labels and taint:**
→ `docs/src/atoms/effects/05-labels--basics.md` through `07c-labels--facts.md`

**If you need to understand the benchmark architecture:**
→ `../benchmarks/capability-migration-priority-plan.md`, `../benchmarks/llm-first-capability-policygen-plan.md`

**If you need to compare with CaMeL:**
→ `../benchmarks/camel-security.md`, `feat-cf-dependency-tracking--re-camel.md`

**If you need to understand where we're going with conversational agents:**
→ `todo-long-running-agents-concept.md`

## Active Work

The benchmark is migrating all four suites (workspace, banking, slack, travel) to the capability-oriented waterfall pattern. Phase 0 (complete the migration) is the current priority. Phase 1 (post-migration improvements) and Phase 2 (module extraction as `@mlld/agentflow`) follow.

Active runtime specs that may need implementation: `spec-runtime-effect-tracing.md`, `spec-deterministic-replay.md`.

The `@mlld/agentflow` module extraction is the product direction — the benchmark is pioneering a reusable pattern that becomes a published module.
