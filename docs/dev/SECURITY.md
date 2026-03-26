---
updated: 2026-03-26
tags: #security, #policy, #guards, #records, #handles, #environments
related-docs: docs/dev/DATA.md, docs/dev/GUARD-ARGS.md, docs/user/security.md
related-code: core/types/security.ts, core/types/handle.ts, core/policy/*.ts, interpreter/policy/*.ts, interpreter/eval/records/*.ts, interpreter/fyi/*.ts, interpreter/utils/handle-resolution.ts, interpreter/eval/exec/*.ts, interpreter/hooks/*-hook.ts
related-types: core/types/security.ts { SecurityDescriptor, DataLabel }, core/types/handle.ts { FactSourceHandle, HandleWrapper }
---

# Security Model

## tldr

mlld prevents prompt-injection consequences with a layered model:

- `SecurityDescriptor` carries `labels`, `taint`, `attestations`, and `sources`
- policy is the non-bypassable enforcement layer
- guards add contextual checks, deny/retry flow, and environment selection
- records classify structured outputs and mint field-level `fact:` proof
- handles preserve trust across LLM boundaries by referring back to live values
- environments, credentials, and filesystem integrity remain orthogonal security layers

The important architectural split is between contamination and proof. Negative rules consume taint. Positive rules consume attestations and `fact:` proof on live values.

## Principles

- Separate contamination from proof.
- Attach trust to live values, not copied literals.
- Run policy before execution.
- Keep policy non-bypassable.
- Use records as the structured shaping and classification boundary.
- Cross LLM boundaries with opaque handles and boundary-only display projections.
- Canonicalize named operations before discovery or fact-aware policy checks.
- Fail closed when discovery lacks operation identity or required control-arg metadata.

## Details

### Core Security State

[`SecurityDescriptor`](/Users/adam/mlld/mlld/core/types/security.ts) is the common runtime carrier for security state.

- `labels`
  value properties and classifications, including ordinary user labels and `fact:` labels
- `taint`
  contamination and risk labels used by negative flow checks
- `attestations`
  explicit positive proof, including `known` and authorization-carried proof
- `sources`
  provenance trail for execution history and origin tracking
- `tools`, `capability`, `policyContext`
  execution metadata used by policy, auditing, and runtime decisions

The runtime treats `taint` and `attestations` as different channels. They do not imply each other.

### Label Classes

The security model uses several label classes:

- user-declared data labels such as `secret`, `pii`, `public`
- taint labels such as `untrusted` and `influenced`
- attestation labels such as `known` and `known:*`
- fact labels such as `fact:@contact.email` and `fact:internal:@contact.email`
- source labels and provenance entries such as `src:mcp`, `src:file`, and operation/tool sources
- operation labels such as `exfil:send`, `destructive:targeted`, `tool:w`, `privileged`

Operation labels drive policy evaluation and tool metadata. They are not data labels.

### Policy

Policy is the non-bypassable enforcement layer.

The main policy surfaces live in [`union.ts`](/Users/adam/mlld/mlld/core/policy/union.ts), [`label-flow.ts`](/Users/adam/mlld/mlld/core/policy/label-flow.ts), [`guards.ts`](/Users/adam/mlld/mlld/core/policy/guards.ts), and [`authorizations.ts`](/Users/adam/mlld/mlld/core/policy/authorizations.ts).

Important policy features:

- defaults and built-in rules
- label-flow rules through `policy.labels`
- operation semantic expansion through `policy.operations`
- authorizations
- capabilities, danger rules, filesystem rules, and environment policy
- signer-to-label mapping and filesystem integrity policy

Policy merging remains architecture-critical:

- deny-like constraints merge conservatively
- allow-like constraints narrow capability
- operation mappings and label rules merge into a single effective policy summary

### Enforcement Order

The security model has two enforcement stages around execution:

1. policy preflight
2. guards

The effective flow is:

- resolve handles and live values where required
- evaluate non-bypassable policy checks
- run guard pre-hooks
- execute
- run guard post-hooks

Policy runs before guards in the evaluators. Guards add context and control flow, but they do not replace policy.

### Negative And Positive Checks

Negative checks use taint and label flow.

- implemented primarily in [`label-flow.ts`](/Users/adam/mlld/mlld/core/policy/label-flow.ts)
- examples: `no-secret-exfil`, `no-sensitive-exfil`, `no-untrusted-destructive`, `no-untrusted-privileged`

Positive checks require proof on specific args.

- implemented primarily in [`guards.ts`](/Users/adam/mlld/mlld/core/policy/guards.ts)
- examples: `no-send-to-unknown`, `no-send-to-external`, `no-destroy-unknown`

Positive checks use named-arg descriptors plus operation metadata. They accept:

- generic attestation such as `known` or `known:internal`
- matching `fact:` proof such as `fact:*.email`, `fact:internal:*.email`, or `fact:*.id`

### Records And Structured Trust Boundaries

Records are the structured trust boundary for executable output.

The record path lives in [`coerce-record.ts`](/Users/adam/mlld/mlld/interpreter/eval/records/coerce-record.ts).

Responsibilities of record coercion:

- parse structured outputs from objects, arrays, JSON strings, fenced payloads, and YAML strings
- shape data according to the record definition
- validate required fields and scalar types
- apply `when` classification
- attach schema metadata
- mint field-level proof through `fact:` labels and `mx.factsources`

Schema metadata is exposed on structured values:

- `@value.mx.schema.valid`
- `@value.mx.schema.errors`
- `@value.mx.schema.mode`

Post-guards use that metadata for deny and retry behavior.

### Facts And Fact Sources

Fact-bearing record fields carry two forms of proof:

- `fact:` labels
- normalized [`FactSourceHandle`](/Users/adam/mlld/mlld/core/types/handle.ts) entries in `mx.factsources`

Field access preserves field-level security metadata in [`field-access.ts`](/Users/adam/mlld/mlld/interpreter/utils/field-access.ts).

This gives the runtime a field-granular proof model:

- a record field can be authoritative while sibling fields are not
- trust is attached to the accessed live value, not to a serialized parent blob

### Display Projections

Record display projections are the primary LLM-facing handle path.

Projection rendering lives in [`display-projection.ts`](/Users/adam/mlld/mlld/interpreter/eval/records/display-projection.ts).

Important properties:

- projection is an LLM/MCP-boundary renderer, not a mutation of `StructuredValue.text`
- fact fields can render as bare values, masked previews plus handles, or handle-only wrappers
- when a record declares `display: [...]`, omitted fact fields default to handle-only projection
- data fields remain bare
- scoped `display: "strict"` forces all fact fields to handle-only projection

Projected handle payloads use nested compatibility wrappers such as `{ preview, handle: { handle: "..." } }`. The inner single-key wrapper is the actual handle wrapper consumed by recursive handle resolution.
Projected previews and bare literals are also recorded as session-local aliases for the emitted live value. That aliasing lives only at the LLM boundary. It is not a mutation of the stored value or its labels.

### Handles

Handles are the boundary primitive for LLM-mediated selection.

Properties of handles:

- opaque
- execution-scoped
- runtime-issued
- resolved back to the original live value

The public wrapper shape is exactly `{ handle: "..." }`. Extra-key objects are plain objects, not handle wrappers. Projection payloads therefore nest the wrapper under a descriptive field such as `handle: { handle: "..." }`. Handle types live in [`handle.ts`](/Users/adam/mlld/mlld/core/types/handle.ts). Resolution lives in [`handle-resolution.ts`](/Users/adam/mlld/mlld/interpreter/utils/handle-resolution.ts).

Handle resolution is recursive across:

- variables
- structured values
- arrays
- plain objects

This is the mechanism that preserves proof across LLM boundaries without trusting copied literals.

### Boundary Input Canonicalization

Security-relevant runtime inputs are canonicalized before authorization checks, inherited positive checks, guards, and tool dispatch.

The resolution order is:

1. explicit handle wrapper
2. exact emitted preview string from the active LLM tool session
3. exact emitted bare literal from the active LLM tool session
4. no match, so the value remains fresh and unproven

Important constraints:

- runtime preview and literal matching is session-local
- handle resolution remains root-scoped
- only security-relevant positions are canonicalized
- freeform payload args are not rewritten
- handle-only projections create no preview or literal alias

Ambiguous preview or literal matches fail closed and direct the model to use the handle wrapper. The runtime does not guess.

### Fact Discovery

The primary planner path is projected record results. `@fyi.facts(...)` remains the explicit fact-discovery surface when agents need to search configured roots directly instead of copying handles from projected tool output.

The implementation lives in [`facts-runtime.ts`](/Users/adam/mlld/mlld/interpreter/fyi/facts-runtime.ts).

Discovery uses box or call-site `fyi: { facts: [...] }` roots and returns bounded candidate objects:

- `handle`
- `label`
- `field`
- `fact`

It does not return raw live values or raw authorization-critical literals. `label` is a safe display string derived from sibling record context when possible and otherwise falls back to a masked preview.

`facts: "auto"` remains available as a same-session compatibility path that reuses successful native tool results as discovery roots. It is not required for the primary projection-based planner workflow.

There are two discovery modes:

- no-arg discovery across configured fact-bearing roots
- filtered discovery by `(op, arg)`

`@fyi.facts(...)` is a discovery surface, not a projection alias surface. Its `label` field is safe display text for choosing a candidate, not a tolerant input alias. The reusable value is the returned handle.

### Canonical Operation Identity

Named operations are canonicalized to `op:named:...` in [`operation-labels.ts`](/Users/adam/mlld/mlld/core/policy/operation-labels.ts).

That identity is shared across:

- `@fyi.facts(...)`
- guard filters
- runtime operation metadata lookup
- fact-aware policy checks
- authorization matching

This keeps discovery and enforcement on the same operation namespace.

### Shared Fact-Requirement Resolver

Discovery and fact-aware positive checks share the fact-requirement model in [`fact-requirements.ts`](/Users/adam/mlld/mlld/core/policy/fact-requirements.ts).

The resolver:

- normalizes operation identity to `op:named:...`
- distinguishes `resolved`, `no_requirement`, and `unknown_operation`
- derives requirements from live operation metadata when available
- supports explicit built-in symbolic op specs
- resolves declarative fact-aware policy requirements from `policy.facts.requirements`

Important behavior:

- discovery does not guess from arg names alone
- unknown operations fail closed
- live metadata and declared `controlArgs` are authoritative for nonstandard send/target args
- declarative `(op, arg)` fact requirements compose conjunctively with built-in requirements

This removes the old drift between discovery heuristics and enforcement semantics.

### Tool Metadata And Control Args

Tool and executable metadata are merged in [`tool-metadata.ts`](/Users/adam/mlld/mlld/interpreter/eval/exec/tool-metadata.ts).

That merge supplies:

- effective operation labels
- param names
- `controlArgs`
- whether control-arg metadata was explicitly declared

Security-critical behavior depends on that metadata:

- metadata-driven destination selection for `exfil:send`
- metadata-driven target selection for `destructive:targeted`
- discovery for nonstandard args such as `participants`
- fail-closed behavior for `tool:w` operations without declared control args

### Authorization Compilation

Authorization compilation resolves live values before extracting proof.

The path lives in [`policy-fragment.ts`](/Users/adam/mlld/mlld/interpreter/eval/exec/policy-fragment.ts).

It resolves:

- variable refs
- expression results
- arrays and objects
- handle wrappers
- emitted previews and emitted bare literals for security-relevant authorization args

Compiled authorization proof comes from the resolved live value’s security descriptor, not from a copied literal representation.
For planner-produced authorization bundles, emitted previews and emitted bare literals canonicalize back to live values before normalization. Ambiguous aliases fail closed with handle guidance.

### Dispatch-Time Authorization And Policy Checks

Runtime exec dispatch lives in [`exec-invocation.ts`](/Users/adam/mlld/mlld/interpreter/eval/exec-invocation.ts).

At dispatch time the runtime:

- resolves effective tool metadata
- canonicalizes security-relevant args from emitted handles, previews, or bare literals
- separates policy-guard control args from authorization-validation control args
- validates runtime authorizations
- merges matched authorization proof into named arg descriptors
- runs policy and guard enforcement against those descriptors

This is the path that keeps local exes, imported tools, and MCP-backed tools aligned on the same positive-check semantics.

### Credential Injection And Environments

Credentials and execution environments remain part of the security model.

Important environment-related security surfaces:

- auth injection
- `using`-style credential flows
- provider-backed execution environments
- capability filtering for tools, MCPs, filesystem, and network

These are orthogonal to the record/fact/handle provenance path. They operate through environment config, policy capabilities, and runtime execution boundaries.

### Filesystem Integrity And Signers

Filesystem trust is a separate layer built from:

- signature verification
- signer-to-label mapping
- filesystem integrity policy

That layer determines how file content becomes trusted, untrusted, or unlabeled data on read. It feeds labels into the same policy and guard machinery as other security sources.

## Gotchas

- Fact proof is field-level. A fact-bearing object does not make every descendant authorized.
- Handles are execution-scoped and are not durable ids.
- A copied literal carries no proof by itself.
- `@fyi.facts({ arg: "recipient" })` is intentionally empty.
- Discovery requires either resolvable live metadata, an explicit symbolic op spec, or declarative `policy.facts.requirements`.
- `tool:w` send operations without declared `controlArgs` fail closed for fact discovery.
- Plain non-tool runtime compatibility fallbacks for dispatch are not discovery semantics.
- Record-addressed facts are the shipped proof form. Store-addressed facts are outside this model.

## Debugging

- Security descriptor: [`core/types/security.ts`](/Users/adam/mlld/mlld/core/types/security.ts)
- Handle and fact-source types: [`core/types/handle.ts`](/Users/adam/mlld/mlld/core/types/handle.ts)
- Record coercion and schema metadata: [`interpreter/eval/records/coerce-record.ts`](/Users/adam/mlld/mlld/interpreter/eval/records/coerce-record.ts)
- Field metadata propagation: [`interpreter/utils/field-access.ts`](/Users/adam/mlld/mlld/interpreter/utils/field-access.ts)
- Handle resolution: [`interpreter/utils/handle-resolution.ts`](/Users/adam/mlld/mlld/interpreter/utils/handle-resolution.ts)
- Fact discovery: [`interpreter/fyi/facts-runtime.ts`](/Users/adam/mlld/mlld/interpreter/fyi/facts-runtime.ts)
- Fact requirements: [`core/policy/fact-requirements.ts`](/Users/adam/mlld/mlld/core/policy/fact-requirements.ts)
- Operation normalization: [`core/policy/operation-labels.ts`](/Users/adam/mlld/mlld/core/policy/operation-labels.ts)
- Tool metadata merge: [`interpreter/eval/exec/tool-metadata.ts`](/Users/adam/mlld/mlld/interpreter/eval/exec/tool-metadata.ts)
- Authorization compilation: [`interpreter/eval/exec/policy-fragment.ts`](/Users/adam/mlld/mlld/interpreter/eval/exec/policy-fragment.ts)
- Runtime dispatch path: [`interpreter/eval/exec-invocation.ts`](/Users/adam/mlld/mlld/interpreter/eval/exec-invocation.ts)
- Positive built-in checks: [`core/policy/guards.ts`](/Users/adam/mlld/mlld/core/policy/guards.ts)
- Negative label-flow checks: [`core/policy/label-flow.ts`](/Users/adam/mlld/mlld/core/policy/label-flow.ts)
