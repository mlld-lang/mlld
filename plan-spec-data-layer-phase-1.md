# Plan: Data Layer Phase 1 - Rich Records, Opaque Handles, Schema-Aware Guard Retries, and Fact-Based Authorization

## Overview

This plan defines the end-state-oriented phase 1 for the data layer in [spec-data-layer-v3.md](./spec-data-layer-v3.md). The release target is not just “records exist.” It is:

1. a rich but pure `record` DSL for shaping and classifying structured data
2. `exe ... => record` as the primary runtime boundary
3. schema validation metadata on record outputs so guards can deny or retry bad agent output
4. field-level `fact:` labels and normalized `mx.factsources` on live values
5. opaque runtime-issued `handle`s for any LLM boundary that must refer to those live values
6. a narrow `@fyi.facts(...)` surface, configured through `fyi: { facts: [...] }`, that exposes fact candidates with handles
7. a universal canonical operation identity in the form `op:@...` shared by discovery, guard queries, policy, and authorization
8. fact-aware policy and guard checks running on resolved live values
9. removal of the exact-value attestation registry

The key architectural split is:

- `record` / `fact:` / `mx.factsources` answer: “why is this live value trusted?”
- `handle`s answer: “how does an LLM refer to that live value without retyping it?”

This still is not the full data layer. Stores, persistence, signing, shelf, the broader `@fyi` environment model, and store-addressed facts are deferred. Phase 1 focuses on the correct provenance model and the correct LLM-boundary model, with no registry bridge left behind.

## Updated Design Summary

This plan supersedes the earlier “records replace the registry” framing.

### What Changed

- The previous summary treated `record`, `=> record`, schema validation, and `fact:` labels as if they were sufficient to replace the current registry.
- That was incomplete. Those pieces solve provenance on live values, but they do not solve the LLM boundary problem by themselves.
- The updated design now treats `handle`s as a first-class part of phase 1, not an optional migration helper.
- The updated design also treats `@fyi.facts(...)` as the right discovery surface for those handles, while preserving the broader future `@fyi` model from the spec.

### Architectural Split

- `record` / `fact:` / `mx.factsources` are the proof substrate.
  - They answer: “why is this live value trusted?”
- `handle`s are the boundary primitive.
  - They answer: “how does an LLM refer to that live value without retyping it?”

### How This Surpasses The Registry

- The old registry tried to reconnect fresh literals to prior trust by exact string equality.
- Phase 1 instead keeps provenance on live values and gives LLMs a safe way to refer to those live values by opaque handle.
- This means the system authorizes based on lineage and live descriptors, not on “did this string appear before?”
- It also generalizes beyond planner auth. The same boundary model applies to worker-selected tool args and any other LLM-mediated selection path.

### End-State Rule

- records mint provenance
- box or call-site `fyi: { facts: [...] }` defines which roots are eligible for fact discovery
- `@fyi.facts()` can explore all fact-bearing descendants of configured roots without exposing raw values
- `@fyi.facts({ op: "op:@...", arg: ... })` filters those roots to matching fact-bearing descendants and mints opaque handles
- the same canonical `op:@...` identity drives discovery, guard matching, runtime op context, policy, and authorization
- planner/worker output returns handles, not auth-critical literals
- runtime resolution restores the original live value before authorization or tool dispatch
- fresh literals fail closed

## Lifecycle Primer

The phase-1 behavior needs to read as one coherent lifecycle, because otherwise the `@fyi`/handle layer feels magical.

1. `exe ... => record` returns a live value.
2. Record coercion parses, validates, and classifies that value.
3. Fact-bearing fields mint `fact:` labels and normalized `mx.factsources`.
4. A box or specific LLM call declares which live roots are eligible for fact discovery:
   - `box @planner with { fyi: { facts: [@contacts, @task] } } [...]`
   - `@claude(@prompt) with { fyi: { facts: [@contact] } }`
5. The model calls `@fyi.facts({ op: "op:@email.send", arg: "recipient" })` or, for bounded exploration, `@fyi.facts()`.
6. The runtime normalizes that operation through the same canonical `op:@...` identity used everywhere else.
7. The runtime derives the fact requirements for that `(op, arg)` from built-in positive checks plus declarative fact-aware policy surfaces.
8. The runtime does not try to interpret arbitrary user guard code as a discovery source of truth in phase 1.
9. The runtime filters descendants of the configured roots to values whose fact labels satisfy those requirements.
10. The runtime returns matching candidates with opaque handles.
11. The model returns the chosen handle, not the literal value.
12. The runtime resolves the handle back to the original live value before authorization and tool dispatch.

This is why `@fyi.facts({ op: "op:@email.send", arg: "recipient" })` returns email facts rather than phone facts: discovery is driven by the same fact requirements the runtime will later enforce, not by heuristic prompt search.

## Must-Read References

- [spec-data-layer-v3.md](./spec-data-layer-v3.md)
- [docs/dev/TESTS.md](./docs/dev/TESTS.md)
- [docs/dev/DOCS.md](./docs/dev/DOCS.md)
- [docs/dev/GUARD-ARGS.md](./docs/dev/GUARD-ARGS.md)
- [docs/dev/DATA.md](./docs/dev/DATA.md)
- [core/policy/label-flow.ts](./core/policy/label-flow.ts)
- [core/policy/guards.ts](./core/policy/guards.ts)
- [core/policy/authorizations.ts](./core/policy/authorizations.ts)
- [core/policy/operation-labels.ts](./core/policy/operation-labels.ts)
- [core/types/security.ts](./core/types/security.ts)
- [interpreter/utils/field-access.ts](./interpreter/utils/field-access.ts)
- [interpreter/hooks/guard-runtime-evaluator.ts](./interpreter/hooks/guard-runtime-evaluator.ts)
- [interpreter/hooks/guard-candidate-selection.ts](./interpreter/hooks/guard-candidate-selection.ts)
- [interpreter/hooks/guard-post-orchestrator.ts](./interpreter/hooks/guard-post-orchestrator.ts)
- [interpreter/hooks/guard-post-retry.ts](./interpreter/hooks/guard-post-retry.ts)
- [interpreter/guards/GuardRegistry.ts](./interpreter/guards/GuardRegistry.ts)
- [interpreter/eval/exe.ts](./interpreter/eval/exe.ts)
- [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts)
- [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts)
- [interpreter/env/Environment.ts](./interpreter/env/Environment.ts)
- [interpreter/utils/attested-values.ts](./interpreter/utils/attested-values.ts)
- [docs/src/atoms/effects/07b-labels--attestations.md](./docs/src/atoms/effects/07b-labels--attestations.md)
- [docs/src/atoms/effects/13-guards--basics.md](./docs/src/atoms/effects/13-guards--basics.md)

## Current State

### The Current Registry Is A Stopgap

- Runtime trust for positive checks still has an execution-wide exact-value rebinding path.
- [Environment.recordAttestedValues()](./interpreter/env/Environment.ts#L1216) and [Environment.lookupRecordedAttestations()](./interpreter/env/Environment.ts#L1221) wrap an execution-wide attestation index.
- Every executable invocation records its raw result into that index in [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts#L1980).
- Planner authorization still falls back to that exact-value lookup in [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts#L138).
- The index implementation in [interpreter/utils/attested-values.ts](./interpreter/utils/attested-values.ts) is intentionally value-equality based. It does not model field-level structured trust and it should not be extended to do so.

Phase 1 should treat this registry as removable debt, not as an API contract to preserve.

### Guard, Policy, And Provenance Plumbing Already Exists

- Named-arg descriptors already exist and are exposed through `@mx.args.*`; see [docs/dev/GUARD-ARGS.md](./docs/dev/GUARD-ARGS.md).
- Policy runtime snapshots already preserve arg labels, taint, attestations, and sources in [interpreter/hooks/guard-runtime-evaluator.ts](./interpreter/hooks/guard-runtime-evaluator.ts#L135).
- After-guards already support retry signaling and enforcement through:
  - [interpreter/hooks/guard-post-orchestrator.ts](./interpreter/hooks/guard-post-orchestrator.ts)
  - [interpreter/hooks/guard-post-retry.ts](./interpreter/hooks/guard-post-retry.ts)
- Field access already merges parent provenance with field-specific metadata in [interpreter/utils/field-access.ts](./interpreter/utils/field-access.ts#L1068).

The missing pieces are records, schema metadata, field facts, normalized fact sources, and a real LLM-boundary reference mechanism.

### Records, Schema Metadata, And Handles Do Not Exist Yet

- `record` is not a directive kind in [grammar/deps/grammar-core.ts](./grammar/deps/grammar-core.ts#L32) or [core/types/primitives.ts](./core/types/primitives.ts#L247).
- Executables do not carry output record metadata today; [core/types/executable.ts](./core/types/executable.ts#L18) and [interpreter/eval/exe.ts](./interpreter/eval/exe.ts#L90) only materialize params, control args, and description.
- The exe grammar in [grammar/directives/exe.peggy](./grammar/directives/exe.peggy#L25) has no output coercion annotation.
- There is no schema metadata surface like `@output.mx.schema.valid` or `@output.mx.schema.errors`.
- There is no handle registry and no `@fyi.facts(...)` surface for returning live values by opaque reference.

### The Current Label Matcher Is Too Weak For Facts

- Both [core/policy/label-flow.ts](./core/policy/label-flow.ts#L62) and [core/policy/guards.ts](./core/policy/guards.ts#L1006) use a simple prefix matcher.
- That works for `known` and `known:internal`.
- It does not work for record facts such as `fact:internal:@contact.email` when the rule wants to match `fact:@contact.email`, `fact:*.email`, or `fact:internal:*.email`.

## Goals

1. Ship a rich record DSL for shaping and classifying data at trust boundaries.
2. Make `exe ... => record` part of the first shippable slice, not a follow-on feature.
3. Surface validation results on outputs so guards can `deny` or `retry` on schema mismatch.
4. Mint field-level `fact:` labels and normalized `mx.factsources` on live values.
5. Introduce opaque runtime-issued `handle`s as the general LLM-boundary primitive.
6. Introduce canonical named-operation identity in the form `op:@...` and reuse it across discovery, guard matching/querying, policy, authorization, and runtime op context.
7. Expose contextual fact candidates through a narrow `@fyi.facts(...)` surface.
8. Make built-in policy checks and user guards fact-aware.
9. Remove the exact-value attestation registry and the fallback behaviors that depend on it.

## Non-Goals

- Implementing stores, event logs, state snapshots, signing, or persistence from later sections of the spec.
- Implementing store-addressed facts such as `fact:@contacts.email`.
- Implementing the full `@fyi` environment-awareness model from sections 7-8. Phase 1 only adds the narrow `@fyi.facts(...)` fact-discovery surface.
- Implementing universal `=> record` everywhere a value is produced. Phase 1 keeps the operator scoped to executable output.
- Using records as a side-effectful mini-language. Record evaluation must remain pure and deterministic.
- Implementing persistence/identity features such as `key` and dedup semantics before stores exist.
- Letting planners or workers invent paths, expressions, or raw refs to live values.
- Using arbitrary imperative guard code as the discovery source of truth in phase 1.

## First-Release Contract

Phase 1 should ship a full record shaping/classification feature with explicit LLM-boundary semantics.

### In Scope

- `record @name = { ... }` as a first-class directive
- `facts: [...]` and `data: [...]`
- scalar field types: `string`, `number`, `boolean`, plus optional `?`
- field remapping from `@input.foo as bar`
- computed/composable fields such as `{ name: \`...\` }`
- record-level `when` classification, including `=> data`
- validation modes from the spec:
  - `demote`
  - `strict`
  - `drop`
- `exe ... = ... => recordName`
- object results, top-level arrays of objects, and string outputs intended to contain structured data
- minimal LLM-output parsing:
  - strip prose and markdown fences
  - parse JSON
  - parse YAML if practical within the same implementation pass
- record output schema metadata:
  - `@output.mx.schema.valid`
  - `@output.mx.schema.errors`
- after-guard deny/retry based on schema results
- record-addressed fact labels in the form `fact[:tier...]:@record.field`
- normalized `@value.mx.factsources` metadata on record-derived values
- opaque runtime-issued `handle`s for LLM-boundary references
- a narrow `@fyi.facts(...)` surface, configured through `fyi: { facts: [...] }`, that returns contextual fact candidates with handles
- call-site `with { fyi: { facts: [...] } }` overrides box-level `fyi.facts` roots for that call
- `@fyi.facts()` supports bounded no-arg exploration of all fact-bearing descendants from configured roots
- `@fyi.facts(...)` uses canonical `op:@...` operation identity plus `(arg)` fact requirements to filter configured roots
- canonical `op:@...` identity is shared across discovery, guard queries, policy, authorization, and guard/runtime operation context
- handle resolution before authorization compilation and tool dispatch
- fact-aware built-in positive checks for recipient/target rules
- a fact-aware guard helper such as `@mx.args.to.mx.has_label("fact:*.email")`
- exact-operation guard matching via canonical refs, for example `guard before op:@email.send = ...`, with any legacy named-operation guard syntax normalized to the same internal ref
- raw auth-critical literals from planner/worker/LLM output fail closed

### Explicitly Deferred

- `key`
- store integration and store-addressed facts
- signing and persistence
- post-import shorthand like `exe @tool => contact` unless it falls out cheaply from the same parser work
- recursive or nested record references
- records calling tools, mutating env, or depending on non-deterministic runtime state
- public `@value.mx.samesource(@other)` helper unless a concrete first-release guard requires it
- planner-authored refs or expression syntax such as `@contacts[2].email` crossing the LLM boundary

## Design Decisions

### 1. Records Are Pure, Deterministic Data-Shaping Definitions

Phase 1 should support the rich record surface from section 2 of the spec, but only as a pure classification/shaping DSL.

Allowed inside records:

- `@input` field reads
- type annotations
- templates and pure expressions for computed fields
- `when` conditions over raw input values

Not allowed inside records:

- tool calls
- env mutation
- filesystem/network access
- non-deterministic helpers

This keeps records predictable, testable, and security-reviewable.

### 2. `=> record` Is Part Of The First Delivery Slice

`record` without `=> record` is not useful enough to replace the registry or to improve LLM output handling. Phase 1 should therefore treat these as one product feature:

- record definition
- executable output coercion
- validation metadata
- fact labeling
- fact-source metadata

They may be implemented in sequence, but they should not be scoped as separate releases.

### 3. Remove The Exact-Value Attestation Registry

The execution-wide exact-value attestation registry should be removed in phase 1.

Implications:

- delete or retire the code paths in:
  - [interpreter/utils/attested-values.ts](./interpreter/utils/attested-values.ts)
  - [interpreter/env/Environment.ts](./interpreter/env/Environment.ts)
  - [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts)
  - [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts)
- keep the direct attestation channel only for values that already explicitly carry `known` in their live descriptor
- do not try to map `fact:` into `attestations`

After this change:

- record-backed trust comes from `fact:` labels
- explicit manual/trusted approvals, if still needed, remain direct `known` attestations
- there is no ambient same-execution string registry fallback

### 4. Schema Status Must Be First-Class Output Metadata

Record coercion should attach a stable schema status contract to outputs, for example:

- `@output.mx.schema.valid`
- `@output.mx.schema.errors`
- `@output.mx.schema.mode`

This should be available to:

- after guards
- denied handlers
- tests
- docs/examples

The repo already has retry plumbing. The missing work is attaching schema results early enough that post guards can use them.

### 5. Reuse `namespaceMetadata` For Field Facts

The existing field-access pipeline is already the right transport. Record coercion should decorate the materialized object with:

- top-level labels for whole-record provenance if useful
- `namespaceMetadata[field]` entries for fact-bearing fields

That lets field access, interpolation, and expression provenance do most of the propagation work automatically.

### 6. Phase 1 Carries Normalized `factsources` Metadata

Phase 1 should carry structured provenance handles alongside `fact:` labels. The purpose is not to replace fact-label policy matching in phase 1; it is to preserve a stronger lineage model that later features can build on.

Recommended phase-1 shape:

- internal normalized `factsources` on record-derived values
- raw read access via `@value.mx.factsources`
- no requirement yet to ship `@value.mx.samesource(@other)`

Each fact-source handle should be order-independent and normalized enough for future set-based comparison. A minimal phase-1 handle can be record-addressed and field-oriented. Future versions can strengthen it with store/entity identity.

### 7. Phase 1 Uses Record-Addressed Facts

Because stores are deferred, phase 1 should emit `fact:@contact.email` and `fact:internal:@contact.email`, not store-addressed labels.

Implications:

- user-authored guards/policies in phase 1 should reference record-addressed facts
- built-in generic rules should match by fact shape and field suffix, not by a specific store name

### 8. Introduce A Real Fact Matcher

Phase 1 needs a structured matcher that can reason about fact labels as:

- namespace prefix: `fact`
- optional classification segments: `internal`, `external`, `customer`, and similar
- terminal field address: `@record.field`

Required match capabilities:

- exact fact label: `fact:internal:@contact.email`
- exact record field ignoring tier: `fact:@contact.email`
- field suffix wildcard: `fact:*.email`
- tier + field wildcard: `fact:internal:*.email`

This matcher should be implemented once and reused by:

- built-in positive policy checks
- policy `allow/deny when [...]` evaluation
- guard helper APIs

### 9. Handles Are A General LLM-Boundary Primitive

Handles are not planner-only. They should be used anywhere an LLM needs to choose or return an authorization-critical live value:

- planner authorization output
- worker-selected tool args
- any later LLM-mediated selection path

Handles should be:

- opaque
- runtime-issued
- execution-scoped
- boundary-facing references to live values

Handles should not be:

- copied literals
- planner-authored paths
- expression strings
- intrinsic permanent IDs on record values

### 10. Handles Are Minted At Fact Discovery Time

Record-derived values do not automatically receive permanent public IDs at creation time.

The correct lifecycle is:

1. records mint provenance on live values
2. box or call-site `fyi: { facts: [...] }` config declares which roots are eligible for fact discovery
3. the runtime evaluates `@fyi.facts(...)` against those roots
4. only the matching returned values receive opaque handles
5. the LLM returns handles
6. the runtime resolves handles back to the original live values

This keeps the public handle surface narrow and contextual.

### 11. `@fyi.facts(...)` Is The Phase-1 Fact Discovery Surface

Phase 1 should not dump all handles into ambient context. It should expose a narrow `@fyi.facts(...)` surface that returns fact candidates with handles.

This should behave like other `@fyi` capabilities: a tool/query surface the agent can call to explore relevant context, not a giant prompt-time handle map.

The glue is explicit at the box or LLM call site:

- `box @planner with { fyi: { facts: [@contacts, @task] } } [...]`
- `@claude(@prompt) with { fyi: { facts: [@contact] } }`

Rules:

- `fyi: { ... }` implicitly enables the `@fyi` tool
- box `fyi.facts` provides default roots
- call-site `with { fyi: { facts: [...] } }` overrides box `fyi.facts` roots for that call
- the explicit-root rule applies only to `fyi.facts` in phase 1; future `fyi` keys (`context`, `stores`, `ask`) and broader ambient `@fyi` sections (files, shelf) keep their own semantics

Good shape:

- `@claude(@prompt) with { fyi: { facts: [@contact] } }`
- `@fyi.facts()`
- `@fyi.facts({ op: "op:@email.send", arg: "recipient" })`

Bad shape:

- `@fyi.facts(...)` walking all runtime scope without explicit roots
- planner-authored refs like `@contacts[2].email`

The fact-discovery surface should return planner/worker-usable structured candidates, not raw provenance internals.

### 12. Phase-1 Discovery Is Declarative, Not Arbitrary

`@fyi.facts(...)` should not guess what looks relevant from the prompt. It should derive required fact patterns for the requested `(op, arg)` and filter configured roots accordingly.

Example:

- `@fyi.facts({ op: "op:@email.send", arg: "recipient" })`

The runtime should:

- look up the fact requirements for `recipient` on `op:@email.send`
- use built-in positive-check knowledge plus declarative fact-aware policy surfaces
- reuse the same fact matcher later used at enforcement time
- return `.email` fact candidates, not `.phone` fact candidates

Phase 1 should explicitly not attempt to infer discovery requirements from arbitrary user guard code. User guards still enforce at runtime; they just do not drive discovery in the first implementation.

This is essential for clarity: discovery and enforcement must agree on the fact shapes that make a call valid.

### 13. Canonical Operation Identity Is `op:@...`

Phase 1 should use a single canonical operation identity across discovery, guard matching/querying, policy, authorization, and runtime op context.

Recommended contract:

- canonical user-facing ref for a named operation is `op:@email.send`
- namespaced tools/exes use the same shape, for example `op:@crm.deals.get`
- `@fyi.facts({ op, arg })` uses that canonical ref
- policy/authorization matching normalizes through the same canonical ref
- guard registration and guard candidate selection normalize through the same canonical ref
- guard queries should be able to target that exact identity directly, for example `guard before op:@email.send = ...`
- any legacy named-operation guard syntax should desugar to the same canonical ref
- guard/runtime context should expose the same canonical identity, ideally at `@mx.op.ref` alongside any legacy name fields

This avoids carrying separate concepts for discovery queries, function-name guards, policy operation keys, and runtime operation names.

### 14. Raw Literals Fail Closed At LLM Boundaries

If an auth-critical value crosses an LLM boundary, the accepted forms should be:

- a handle that resolves to a live value
- possibly a direct live same-session value in non-LLM paths where no text boundary exists

Fresh literals returned by the LLM should not be “rescued” by equality lookup. They should fail closed and, if the path is retryable, cause retry with an explicit hint.

### 15. Trusted Task/Config Values Use The Same Boundary Model

Not all approved values come from tools. Some come from structured task input or config.

Phase 1 should treat these the same way:

- if a task/config value is structured and trusted, lift it into a live provenance-bearing value
- if an LLM needs to choose or return it, expose it through the same handle mechanism
- free-form user prose is not automatically authorization-grade just because the user typed it

## Fact Source Variants

Phase 1 should explicitly distinguish the variants so implementation does not drift:

1. **Baseline**: internal `factsources` only
   - Runtime and provenance plumbing carry normalized source handles.
   - No user-visible surface required beyond tests/debugging.

2. **Recommended phase-1 surface**: internal `factsources` plus raw `@value.mx.factsources`
   - This is the preferred target.
   - It gives introspection and future-proofing without committing to a higher-level matching API too early.

3. **Optional follow-on**: `@value.mx.samesource(@other)`
   - Sugar over set intersection on normalized source handles.
   - Useful if a concrete first-release guard needs same-source integrity.
   - Not a blocker for shipping records, handles, `=> record`, schema retry, and fact-based policy.

## Handle Variants

Phase 1 should also be explicit about handle scope:

1. **Bad variant**: planner-authored refs or paths
   - rejected
   - too large a validation surface

2. **Required phase-1 surface**: runtime-issued opaque handles
   - `{"recipient": {"handle": "h_17"}}`
   - resolved by the runtime before authorization/tool dispatch
   - recognized only when the wrapper object contains exactly the single key `handle`

3. **Future strengthening**: richer handle-backed integrity helpers
   - same-source checks
   - store/entity-aware source handles
   - stronger source identity semantics

## Implementation Phases

## Phase 0 - Shared Primitives, Handle Contract, And Registry Removal (≈1 day)

**Goal**: remove the stopgap registry and establish the shared fact/schema/handle contracts before parser/runtime work fans out.

### Tasks

1. **Delete the exact-value registry path**
   - Remove result recording from [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts#L1980)
   - Remove environment helpers from [interpreter/env/Environment.ts](./interpreter/env/Environment.ts#L1216)
   - Remove planner fallback lookup from [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts#L138)
   - Delete [interpreter/utils/attested-values.ts](./interpreter/utils/attested-values.ts) if no remaining caller needs it

2. **Add shared record/fact/handle types**
   - Add `core/types/record.ts`
   - Add a new handle type module, recommended `core/types/handle.ts`
   - Define:
     - record definition
     - field entry kinds
     - validation result shape
     - schema metadata payload shape
     - normalized `factsources` handle shape
     - opaque `handle` entry shape

3. **Add a fact label helper module**
   - New file recommended: `core/policy/fact-labels.ts`
   - Implement:
     - `parseFactLabel(label)`
     - `matchesFactPattern(pattern, label)`
     - `collectFactLabels(values)`
     - helper(s) for positive proof checks

4. **Add canonical op-ref helper(s)**
   - Extend [core/policy/operation-labels.ts](./core/policy/operation-labels.ts) or add a focused module for canonical refs
   - Normalize named operations to `op:@...`
   - Reuse that helper in discovery, guard registration/candidate selection, runtime op context, and enforcement

5. **Define the schema metadata contract**
   - Decide the exact shape exposed under `.mx.schema`
   - Keep it serializable, stable, and simple enough for docs/examples

6. **Define the `factsources` metadata contract**
   - Decide the normalized handle shape exposed under `.mx.factsources`
   - Keep it order-independent and suitable for set-based comparison later
   - Prefer a shape that can later grow store/entity identity without breaking the raw surface

7. **Define the handle contract**
   - Opaque ID format
   - runtime ownership and lifetime
   - resolution failure behavior
   - canonical JSON shape: `{ "handle": "h_17" }`
   - resolver treats an object as a handle wrapper only when it has exactly that single key

8. **Define canonical operation identity**
   - Canonical form for named operations is `op:@name` or `op:@namespace.name`
   - `@fyi.facts({ op, arg })` uses that canonical form
   - Discovery, guard queries, policy/authorization, and runtime op context normalize through the same operation identity contract

### Tests To Add

1. `core/policy/fact-labels.test.ts`
   - exact match
   - tier-insensitive field match
   - wildcard field suffix match
   - non-match across unrelated fields and records

2. Focused op-ref tests
   - canonical `op:@...` normalization for named operations
   - discovery and enforcement use the same normalized op ref
   - `guard before op:@email.send` and any legacy named-operation form resolve to the same canonical op ref

3. `interpreter/eval/exec/policy-fragment.test.ts` or equivalent
   - confirm there is no exact-value fallback

4. Focused metadata-shape tests
   - assert `.mx.factsources` is serializable and stable
   - assert handle objects serialize in the expected wire shape
   - assert only exact single-key `{ "handle": "..." }` is recognized as a handle wrapper

5. Remove or rewrite tests that depended on exact-value registry rebinding

### Testing

- Run `core/policy/fact-labels.test.ts`
- Run [core/policy/authorizations.test.ts](./core/policy/authorizations.test.ts)
- Run the suites previously covering same-session registry behavior and update them as needed

### Exit Criteria

- [ ] The exact-value attestation registry is removed.
- [ ] Shared fact matching semantics are implemented once.
- [ ] Schema metadata shape, canonical op identity, and handle shape are defined before runtime work begins.
- [ ] Canonical `op:@...` identity is defined once and reused by discovery, guard matching, and enforcement.

**Deliverable**: phase 1 starts from a clean provenance model with explicit handle semantics.

## Phase 1 - Rich Record DSL Parsing, Types, And Registration (≈1.5 days)

**Goal**: parse and register the full pure record shaping/classification DSL needed for the first release.

### Tasks

1. **Add `record` to grammar and directive kinds**
   - Update [grammar/deps/grammar-core.ts](./grammar/deps/grammar-core.ts#L32)
   - Update [core/types/primitives.ts](./core/types/primitives.ts#L247)
   - Add `grammar/directives/record.peggy`
   - Ensure grammar build/test infrastructure includes it

2. **Support the full phase-1 record surface**
   - facts/data field declarations
   - typed scalar fields and optional fields
   - `@input.foo as alias`
   - computed/composable fields such as `{ alias: template }`
   - record-level `when`
   - validation mode declaration

3. **Add record AST/runtime types**
   - Use [core/types/record.ts](./core/types/record.ts)
   - Keep field definitions explicit enough that runtime coercion is straightforward

4. **Teach directive evaluation to register records**
   - Update [interpreter/eval/directive.ts](./interpreter/eval/directive.ts)
   - Add `interpreter/eval/record.ts`
   - Add environment storage and lookup methods in [interpreter/env/Environment.ts](./interpreter/env/Environment.ts)

5. **Reject out-of-phase syntax explicitly**
   - `key`
   - nested/recursive record references
   - side-effectful expressions

### Tests To Add

1. Grammar tests
   - update `tests/grammar/expected-ast-structure.test.ts`
   - add invalid fixtures under `tests/cases/invalid/records/`

2. Runtime tests
   - add `interpreter/eval/record.test.ts`
   - cover record definition registration and lookup

3. Feature fixtures
   - `tests/cases/feat/records/records-basics/`
   - `tests/cases/feat/records/records-remap/`
   - `tests/cases/feat/records/records-computed/`
   - `tests/cases/feat/records/records-when-basic/`

### Testing

- Run grammar tests for new directive coverage
- Run `interpreter/eval/record.test.ts`
- Run the new `tests/cases/feat/records/*` fixtures

### Exit Criteria

- [ ] `record` parses and registers as a first-class directive.
- [ ] The full phase-1 record DSL is represented in runtime types.
- [ ] Out-of-phase record features fail explicitly.

**Deliverable**: the runtime can store and resolve rich record definitions safely.

## Phase 2 - `exe ... => record`, Coercion, Validation, And Fact Source Emission (≈2 days)

**Goal**: make executable output classification the primary boundary for live provenance-bearing values.

### Tasks

1. **Extend executable syntax and metadata**
   - Update [grammar/directives/exe.peggy](./grammar/directives/exe.peggy#L25) to parse a trailing output record annotation
   - Extend [core/types/executable.ts](./core/types/executable.ts#L18) with `outputRecord` or equivalent
   - Materialize it in [interpreter/eval/exe.ts](./interpreter/eval/exe.ts#L90) and related builders in [interpreter/eval/exe/core-definition-builders.ts](./interpreter/eval/exe/core-definition-builders.ts)

2. **Implement record coercion**
   - Add a focused runtime helper, recommended `interpreter/eval/records/coerce-record.ts`
   - Support:
     - object input
     - top-level array input
     - string input containing structured data
     - field remapping
     - computed/composable fields
     - scalar coercion for `string`, `number`, `boolean`
     - optional fields
     - validation modes
     - record-level `when`

3. **Implement minimal LLM-output parsing**
   - strip markdown fences and common prose wrappers
   - parse JSON first
   - add YAML parsing if it can be done in the same pass without destabilizing the implementation

4. **Attach schema metadata to outputs**
   - expose `.mx.schema.valid`
   - expose `.mx.schema.errors`
   - expose mode/status details if useful
   - ensure the metadata survives post-guard materialization cleanly

5. **Attach normalized `factsources` metadata to outputs**
   - record-derived fields should carry normalized source handles as well as `fact:` labels
   - raw `@value.mx.factsources` should be readable in phase 1 if it falls out cleanly from the same metadata work

6. **Integrate with after-guard retry**
   - run coercion/validation before post-guards so after-guards see schema status
   - ensure retryable exe contexts can honor `retry` when schema validation fails on agent output
   - add examples/tests for:
     - `deny` on invalid schema
     - `retry` on invalid schema with corrective hint

### Tests To Add

1. Extend [interpreter/eval/exe.characterization.test.ts](./interpreter/eval/exe.characterization.test.ts)
   - executable definition stores output record metadata

2. New coercion/validation tests
   - object coercion
   - array coercion
   - JSON string parsing
   - remap
   - computed/composable field evaluation
   - `when` classification
   - `validate: demote`
   - `validate: strict`
   - `validate: drop`
   - `.mx.factsources` emitted on record-derived values

3. Extend post-guard tests
   - [tests/interpreter/hooks/guard-post-hook.test.ts](./tests/interpreter/hooks/guard-post-hook.test.ts)
   - add after-guard `retry` on schema failure
   - add after-guard `deny` on schema failure

4. Feature fixtures
   - `tests/cases/feat/records/exe-output-record-object/`
   - `tests/cases/feat/records/exe-output-record-array/`
   - `tests/cases/feat/records/exe-output-record-remap-computed/`
   - `tests/cases/feat/records/exe-output-record-schema-retry/`

### Testing

- Run the new coercion/validation tests
- Run [interpreter/eval/exe.characterization.test.ts](./interpreter/eval/exe.characterization.test.ts)
- Run [tests/interpreter/hooks/guard-post-hook.test.ts](./tests/interpreter/hooks/guard-post-hook.test.ts)
- Run the new record feature fixtures

### Exit Criteria

- [ ] Executables can declare an output record.
- [ ] Structured outputs are parsed, coerced, validated, and classified at execution time.
- [ ] Schema results are visible on `.mx.schema`.
- [ ] Record-derived values carry stable `fact:` and `factsources` metadata.
- [ ] After guards can deny or retry based on schema results.

**Deliverable**: `=> record` is a real runtime boundary for live provenance-bearing values.

## Phase 3 - Opaque Handle Registry, `fyi.facts` Config, And `@fyi.facts(...)` (≈1.5 days)

**Goal**: make LLM-boundary references explicit and safe.

### Tasks

1. **Add a root execution handle registry**
   - Add a new runtime component, recommended `interpreter/env/ValueHandleRegistry.ts`
   - Store:
     - opaque handle
     - live value reference
     - optional preview metadata
     - scope/lifetime metadata
   - Add environment methods in [interpreter/env/Environment.ts](./interpreter/env/Environment.ts):
     - `issueHandle(...)`
     - `resolveHandle(...)`

2. **Plumb `fyi.facts` config into boxes and LLM call sites**
   - Add box-level `fyi: { facts: [...] }` defaults
   - Add call-site `with { fyi: { facts: [...] } }`
   - Make call-site `fyi.facts` override box `fyi.facts` roots for that call
   - Keep broader future `fyi` keys compatible with the same object shape
   - Preserve the broader future ambient `@fyi` sections from the spec; the explicit-root rule only applies to `fyi.facts`
   - Make `fyi: { ... }` implicitly enable the `@fyi` tool

3. **Mint handles during fact discovery**
   - Do not assign permanent public IDs to all record values
   - Mint handles only for values returned from `@fyi.facts(...)`
   - Keep the handle surface contextual and minimal

4. **Add a narrow `@fyi.facts(...)` surface**
   - API shape:
     - `@fyi.facts()`
     - `@fyi.facts({ op: "op:@email.send", arg: "recipient" })`
     - `@fyi.facts({ op: "op:@crm.delete", arg: "id" })`
   - Derive fact requirements for `(op, arg)` from built-ins plus declarative fact-aware policy surfaces
   - Filter descendants of configured roots to matching fact-bearing leaves
   - Return structured candidates with:
     - handle
     - display label
     - field
     - fact
   - Do not include raw `value` in phase-1 responses
   - Do not expose a giant ambient candidate dump

5. **Support structured task/config candidates**
   - Lift trusted structured task/config values into live provenance-bearing values where needed
   - Allow the same `@fyi.facts(...)` flow to expose them by handle if an LLM must choose them

### Tests To Add

1. New handle registry tests
   - issue/resolve success
   - unknown handle failure
   - scope/lifetime behavior if implemented in phase 1

2. New `@fyi.facts` tests
   - contextual candidate list includes opaque handles
   - no-arg `@fyi.facts()` returns bounded fact candidates from configured roots
   - box defaults work
   - call-site `fyi.facts` overrides box defaults
   - canonical `op:@...` identity resolves consistently
   - discovery requirements come from built-ins plus declarative fact-aware policy surfaces, not arbitrary user guard code
   - `recipient` returns email fact candidates, not phone fact candidates
   - response shape includes `fact` and excludes raw `value`
   - prompt text does not change the candidate universe
   - no ambient dump of unrelated values

3. Feature fixtures
   - `tests/cases/feat/records/fyi-facts-recipient-handle/`
   - `tests/cases/feat/records/fyi-facts-task-value-handle/`

### Testing

- Run the new handle registry tests
- Run the new `@fyi.facts` tests
- Run the new feature fixtures

### Exit Criteria

- [ ] The runtime can issue and resolve opaque handles.
- [ ] `@fyi.facts(...)` can expose contextual fact candidates with opaque handles to LLM callers.
- [ ] Structured task/config values can use the same boundary model when needed.

**Deliverable**: live provenance-bearing values can cross LLM boundaries without being retyped.

## Phase 4 - Handle Resolution, Tool Dispatch, And Fact-Aware Policy Checks (≈1.5 days)

**Goal**: ensure authorization-critical paths consume resolved live values, not planner/worker literals.

### Tasks

1. **Resolve handle objects before authorization compilation**
   - Update [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts)
   - Detect `{ handle: "h_17" }` objects
   - Resolve them recursively inside arrays/objects before proof compilation
   - Resolve against the root execution handle registry even when running through child environments
   - Treat an object as a handle wrapper only when it has exactly the single key `handle`

2. **Resolve handle objects before tool dispatch**
   - Update [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts)
   - Ensure args passed into guard/policy/tool paths are resolved live values

3. **Make built-in policy checks fact-aware**
   - Update [core/policy/label-flow.ts](./core/policy/label-flow.ts#L258)
   - Update [core/policy/guards.ts](./core/policy/guards.ts#L231)
   - Update [interpreter/hooks/guard-candidate-selection.ts](./interpreter/hooks/guard-candidate-selection.ts)
   - Update [interpreter/guards/GuardRegistry.ts](./interpreter/guards/GuardRegistry.ts)
   - Use the shared proof matcher for:
     - direct `known`
     - direct `known:internal`
     - fact selectors
   - Keep discovery and enforcement aligned by reusing the same fact matcher/proof semantics that power `@fyi.facts(...)`
   - Normalize named operations through the canonical `op:@...` identity path used by `@fyi.facts(...)`
   - Make exact-operation guard targeting use the same canonical ref, including `guard before op:@email.send = ...`

4. **Expose raw `@value.mx.factsources`**
   - Make the metadata readable in guard/runtime contexts if phase-2 metadata work did not already do so

5. **Add a guard helper for fact matching**
   - Expose something like:
     - `@mx.args.to.mx.has_label("fact:*.email")`
     - `@mx.args.id.mx.has_label("fact:*.id")`
   - Keep raw `.mx.labels`, `.mx.attestations`, and `.mx.factsources` intact

6. **Optional: add `@value.mx.samesource(@other)`**
   - Only if a concrete first-release guard needs same-source integrity
   - Implement as set intersection over normalized `factsources`, not array-position comparison

7. **Fail closed on fresh literals**
   - unknown handle -> deny
   - raw auth-critical literal from LLM output -> deny or retry
   - no equality-based rescue path

### Tests To Add

1. Extend [core/policy/label-flow.test.ts](./core/policy/label-flow.test.ts)
   - send to record-backed email fact passes
   - send to internal record-backed email fact satisfies the stronger rule
   - destructive target with fact-backed `id` passes
   - unrelated fact field does not satisfy `.email` or `.id`

2. Extend [core/policy/guards-defaults.test.ts](./core/policy/guards-defaults.test.ts)
   - named-arg guards honor facts on `recipient` and `id`
   - exact-operation guards normalize through canonical `op:@...`

3. Extend [tests/interpreter/hooks/guard-runtime-evaluator.test.ts](./tests/interpreter/hooks/guard-runtime-evaluator.test.ts)
   - raw `@value.mx.factsources` is readable in guard/runtime context
   - the new fact helper works on named args
   - guard/runtime context exposes canonical op identity for named operations

4. New handle-resolution tests
   - planner/worker handle objects resolve before authorization evaluation
   - recursive resolution inside arrays/objects works
   - objects with extra keys are not treated as handle wrappers
   - raw literal fails closed
   - unknown handle fails closed

5. Optional helper tests
   - if `mx.samesource(@other)` lands, add focused tests for set-based matching

### Testing

- Run [core/policy/label-flow.test.ts](./core/policy/label-flow.test.ts)
- Run [core/policy/guards-defaults.test.ts](./core/policy/guards-defaults.test.ts)
- Run [tests/interpreter/hooks/guard-runtime-evaluator.test.ts](./tests/interpreter/hooks/guard-runtime-evaluator.test.ts)
- Run the new handle-resolution tests

### Exit Criteria

- [ ] Authorization-critical paths resolve handles back to live values before evaluation.
- [ ] Built-in positive checks pass on fact-backed recipient/target values.
- [ ] Exact-operation guard matching uses the canonical `op:@...` identity path.
- [ ] There is no registry fallback anywhere in the positive-check path.
- [ ] Fresh literals from LLM output fail closed.

**Deliverable**: planner/worker boundaries consume live provenance-bearing values, not copied strings.

## Phase 5 - Docs, Fixtures, And Cleanup (≈1 day)

**Goal**: document the new mental model clearly and remove stale registry-era descriptions.

### Tasks

1. **Update user docs**
   - Add a new atom, recommended `docs/src/atoms/core/31-records--basics.md`
   - Add a new atom, recommended `docs/src/atoms/effects/07c-labels--facts.md`
   - Add a new atom or update docs for `@fyi.facts(...)` / handle discovery under `docs/src/atoms/effects/` or future `docs/src/atoms/agents/`
   - Update [docs/src/atoms/effects/07b-labels--attestations.md](./docs/src/atoms/effects/07b-labels--attestations.md) to remove registry-first explanations
   - Update [docs/src/atoms/effects/13-guards--basics.md](./docs/src/atoms/effects/13-guards--basics.md) with schema retry, fact-query examples, and canonical `op:@...` guard examples

2. **Update dev docs**
   - Update [docs/dev/DATA.md](./docs/dev/DATA.md) with record coercion, schema metadata, fact propagation, and `factsources`
   - Update [docs/dev/GUARD-ARGS.md](./docs/dev/GUARD-ARGS.md) with fact-query examples and helper semantics

3. **Update changelog**
   - Update [CHANGELOG.md](./CHANGELOG.md)

4. **Regenerate documentation-derived fixtures**
   - Run `npm run build:fixtures`
   - Fix any extracted doc tests that break because of syntax or output changes

### Tests To Add

1. Documentation-derived tests from the new and updated atoms
2. Any remaining migration tests needed to ensure stale registry docs/examples are gone

### Testing

- Run `npm run build:fixtures`
- Run `npm test`
- Run `npm run build`

### Exit Criteria

- [ ] User docs describe records as the primary shaping/trust primitive.
- [ ] User docs describe handles as the correct LLM-boundary primitive.
- [ ] Dev docs explain schema metadata, fact propagation, and handle resolution accurately.
- [ ] Registry-era attestation docs are updated or removed.
- [ ] Docs, tests, and build all pass.

**Deliverable**: the feature is documented as a coherent system, not a collection of internals.

## Testing Requirements

Per [docs/dev/TESTS.md](./docs/dev/TESTS.md), this work needs all three layers of coverage:

1. **Unit tests**
   - `core/policy/fact-labels.test.ts`
   - `core/policy/label-flow.test.ts`
   - `core/policy/guards-defaults.test.ts`
   - record parsing/coercion/validation unit tests
   - handle registry unit tests

2. **Interpreter/runtime tests**
   - [interpreter/eval/record.test.ts](./interpreter/eval/record.test.ts) or equivalent
   - [interpreter/eval/exe.characterization.test.ts](./interpreter/eval/exe.characterization.test.ts)
   - [tests/interpreter/hooks/guard-post-hook.test.ts](./tests/interpreter/hooks/guard-post-hook.test.ts)
   - [tests/interpreter/hooks/guard-runtime-evaluator.test.ts](./tests/interpreter/hooks/guard-runtime-evaluator.test.ts)
   - new `@fyi.facts` and handle-resolution tests

3. **Fixture coverage**
   - `tests/cases/feat/records/...`
   - `tests/cases/feat/policy/...`
   - `tests/cases/exceptions/security/...`
   - `tests/cases/invalid/records/...`

Required manual validation scenarios:

- a contact record with `when [ internal => :internal ]` yields `fact:internal:@contact.email`
- a record-derived scalar exposes stable `@value.mx.factsources`
- a record demoted via `=> data` mints no facts
- a computed field still carries its declared fact/data classification correctly
- an invalid LLM response surfaces `.mx.schema.errors`
- an after guard can retry an LLM exe based on `.mx.schema.errors`
- `@fyi.facts()` returns bounded fact candidates from configured roots
- `@fyi.facts(...)` returns contextual fact candidates with opaque handles
- call-site `fyi.facts` overrides box-level `fyi.facts`
- `@fyi.facts({ op: "op:@email.send", arg: "recipient" })` returns email fact candidates rather than phone fact candidates
- discovery in phase 1 is driven by built-ins plus declarative fact-aware policy surfaces, not arbitrary user guard code
- canonical `op:@...` identity is shared across discovery, guard queries, runtime op context, and enforcement
- `guard before op:@email.send = ...` and legacy named-operation targeting resolve to the same canonical operation identity
- a planner/worker can return a handle instead of a literal value
- a raw auth-critical literal from LLM output fails closed
- a record-backed email or id satisfies positive checks without any exact-value rebinding

## Documentation Requirements

Per [docs/dev/DOCS.md](./docs/dev/DOCS.md), this change is both an architecture change and a user-facing feature.

### Dev Docs

- [docs/dev/DATA.md](./docs/dev/DATA.md)
- [docs/dev/GUARD-ARGS.md](./docs/dev/GUARD-ARGS.md)

### User Docs

- new records atom under `docs/src/atoms/core/`
- new facts atom under `docs/src/atoms/effects/`
- new or updated `@fyi.facts` / handle-discovery docs
- updates to guard and attestation atoms

### LLM / Generated Docs

- run `npm run build:fixtures`
- rebuild any generated doc outputs required by the repo’s normal doc flow

## Sequencing And Dependencies

These phases are implementation sequencing on one feature line, not independently shippable releases.

- Phase 0 should land first so the rest of the work is not forced to preserve the registry.
- Phase 1 must land before Phase 2.
- Phase 2 must land before Phase 3 because `@fyi.facts(...)` depends on live record-derived values existing.
- Phase 3 must land before Phase 4 because policy/tool paths need real handles to resolve.
- Phase 4 should stabilize before the final docs/examples are written.

Recommended implementation order:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5

## Overall Exit Criteria

**Test Status**:

- [ ] New unit coverage exists for fact parsing/matching, record coercion, validation, and handles
- [ ] New runtime coverage exists for `=> record`, schema metadata, post-guard retry, `factsources`, `@fyi.facts`, and handle resolution
- [ ] New fixture coverage exists for valid, invalid, denied, retry, and handle-based record scenarios
- [ ] Full test suite passes: `npm test`

**Documentation**:

- [ ] Dev docs updated
- [ ] User docs updated
- [ ] Documentation fixtures rebuilt
- [ ] `CHANGELOG.md` updated

**Code Quality**:

- [ ] Build succeeds: `npm run build`
- [ ] Record evaluation remains pure and deterministic
- [ ] Handles are opaque runtime-issued references, not planner-authored refs
- [ ] The exact-value attestation registry and its fallbacks are gone

**Validation**:

- [ ] `exe ... => record` is the primary boundary for structured trust and shaping
- [ ] Schema-invalid agent output can be denied or retried by guards
- [ ] Fact labels survive field access and common transformations
- [ ] `@fyi.facts(...)` can expose contextual live values with opaque handles
- [ ] Planner/worker LLM output can refer to auth-critical values by handle rather than literal
- [ ] Record-backed send and destroy flows work without registry rebinding
- [ ] `when => data` prevents authorization-grade facts from being minted
- [ ] Raw auth-critical literals from LLM output fail closed

**Deliverable**: mlld ships a rich pure record system that can shape executable output, validate it, expose schema status to guards, mint field-level facts and `factsources`, expose contextual fact candidates by opaque handle through `@fyi.facts(...)`, and authorize recipient/target flows without the current exact-value attestation registry.
