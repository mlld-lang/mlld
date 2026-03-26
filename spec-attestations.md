# Attestations: Value-Scoped Trust Across Native Tool Calling

## Overview

mlld's current security model uses one merged descriptor channel for both contamination signals and trust signals. That is correct for taint-like labels such as `untrusted` and `influenced`, but it is incorrect for positive trust claims such as `known`. The bug is most visible on native tool-calling paths: once a conversation sees a `known` value, later unrelated tool-call args can inherit that `known` label and satisfy positive-check rules they should fail.

This spec introduces a first-class distinction between **taint** and **attestation**. Taint is conservative and conversation-scoped. Attestation is value-scoped and must stay tied to the specific value that was vouched for. The user-facing syntax remains label-based. The reserved namespace `known` / `known:*` becomes the built-in attestation namespace.

The design goal is not a short-term patch. It is a stable long-term model for how mlld answers two different security questions:

- "Has this data been contaminated?" -> taint
- "Was this specific value vouched for by a trusted source?" -> attestation

## Problem

The native tool-calling boundary destroys value identity.

Example:

1. `@get_iban()` returns `"CH9300762011623852957"` and that value is labeled `known`
2. The model sees that value as plain text inside the conversation
3. Later the model emits:

```json
{ "recipient": "CH9300762011623852957", "amount": 100 }
```

At that point the runtime must answer:

- Did this exact recipient value come from a trusted source?
- Or did the model copy it from injected content, prompt text, or unrelated history?

Today the runtime answers a weaker question:

- Did the conversation previously contain something labeled `known`?

That weaker question is wrong for positive checks.

The current conversation-level descriptor merge is correct for taint:

- if the model saw `untrusted` data, later outputs should be treated as influenced by that exposure

It is not correct for attestation:

- if the model saw one `known` value earlier, that does not make later unrelated values `known`

## Goals

1. Separate taint and attestation as different runtime channels.
2. Keep the declaration UX simple and backwards-friendly.
3. Make positive checks evaluate the attestation of the current arg value, not ambient conversation history.
4. Preserve conservative taint behavior across native tool-calling conversations.
5. Make planner-produced authorizations a valid cross-session bridge for attested pinned values.
6. Define a model that scales beyond the immediate bug and does not depend on which policy rules happen to be enabled.

## Non-goals

1. This spec does not add fuzzy or semantic matching for attested values.
2. This spec does not try to preserve trust across arbitrary model transformations.
3. This spec does not introduce a general user-defined attestation declaration syntax.
4. This spec does not replace provenance; it uses provenance as part of attestation.
5. This spec does not solve every future tool-reference UX issue. Reference/handle-based flows are deferred.

## Design Principles

### 1. Propagation semantics belong to the data model, not the active rules

Whether a property is accumulative or value-scoped must not depend on which policy rules are enabled in the current run. If semantics are derived from active rules, the same value can behave differently depending on unrelated policy configuration.

### 2. Taint is the default; attestation is the exception

Most labels in mlld describe risk, contamination, or influence. Those should remain accumulative. Attestation is narrow: it means a source vouched for a specific value.

### 3. Exactness is a security boundary

When a model crosses the native tool boundary, it emits fresh JSON values. If the runtime cannot prove that a value is the same value previously attested, the attestation must not transfer.

### 4. Authorization is the intentional cross-session bridge

A planner authorization is not just another worker-session value. It is a deliberate task-scoped capability. If a planner pinned an attested value, that attestation requirement can be carried into the compiled authorization guard.

## Terms

### Taint

A contamination or risk signal that spreads conservatively.

Examples:

- `untrusted`
- `influenced`
- `secret`
- `sensitive`

### Attestation

A value-scoped claim that a trusted source vouched for a specific value.

Examples:

- `known`
- `known:internal`
- `known:verified`

### Attestation namespace

The reserved label namespace `known` / `known:*`.

For the purposes of this spec:

- bare `known` means "attested by some trusted source"
- `known:*` refines the claim
- any `known:*` satisfies a rule requiring `known`

### Provenance

The derivation history and source metadata for a value. Provenance supports attestation, but is not itself equivalent to attestation.

## User-Facing Model

### Surface syntax

No new declaration syntax is required.

These remain valid:

```mlld
exe known @get_iban() = [...]
exe known:internal @get_user_info() = [...]
exe known:verified @verify_email(address) = [...]

exe untrusted @read_file(path) = [...]
exe influenced @summarize(data) = [...]
```

### Meaning

- Labels in the `known` namespace are interpreted as attestations.
- Other labels continue to behave as taint/label-flow metadata unless separately specified by future work.

### User mental model

- If a trusted tool gives the model a value and the model passes that exact value back unchanged, positive-check rules can accept it.
- If the model emits a fresh value that was never attested, positive-check rules fail.
- If the model saw untrusted data earlier, later outputs are still tainted.

### Introspection

This spec introduces a new user-facing view:

- `@mx.attestations`

It is the authoritative surface for value-scoped trust claims.

Examples:

```mlld
@mx.attestations.includes("known")
@mx.attestations.includes("known:internal")
```

Matching semantics in guards and built-ins use the same prefix behavior mlld already uses elsewhere:

- a requirement for `known` is satisfied by `known` or `known:*`

`@mx.labels` should no longer be treated as the authoritative source for positive trust checks. It may remain as a compatibility mirror during migration, but built-in policy enforcement must read `attestations`, not `labels`.

## Runtime Model

### 1. Split security metadata into distinct channels

The security descriptor model must distinguish:

- `taint`: accumulative contamination/risk labels
- `attestations`: value-scoped trust claims
- `sources`, `tools`, `auditRef`, and related provenance metadata

Conceptually:

```typescript
interface SecurityDescriptor {
  labels: readonly string[];
  taint: readonly string[];
  attestations?: readonly AttestationRecord[];
  sources: readonly string[];
  tools?: readonly ToolProvenance[];
  capability?: CapabilityKind;
  policyContext?: Readonly<Record<string, unknown>>;
}

interface AttestationRecord {
  label: string;              // known, known:internal, known:verified, ...
  issuer?: string;            // tool or source that vouched for the value
  auditRef?: string;          // audit event linking to the attesting operation
  source?: string;            // optional source/path/tool identity
}
```

The `known` namespace is stored in `attestations`, not merely in `labels`.

### 2. Taint accumulator per native tool-calling conversation

Every native tool-calling conversation maintains a conversation-scoped taint accumulator.

It is built from prior tool results and any other conversation-level inputs that should conservatively influence later model output.

This accumulator may include:

- `untrusted`
- `influenced`
- `secret`
- `sensitive`
- other future taint-like labels

It must not include `known` / `known:*`.

### 3. Attestation index per native tool-calling conversation

Every native tool-calling conversation also maintains an attestation index:

- keyed by canonical value
- storing value-scoped attestation records

Conceptually:

```typescript
type CanonicalValueKey = string;

interface AttestationIndexEntry {
  attestations: readonly AttestationRecord[];
}

Map<CanonicalValueKey, AttestationIndexEntry>
```

This index is not a conversation trust summary. It is a lookup table for exact attested values seen during that conversation.

### 4. Canonical value keys

Attestation rebinding is based on exact canonical value matching.

The canonicalization rules are:

- strings: exact string bytes, no trimming, lowercasing, or normalization
- numbers: numeric type preserved
- booleans: exact boolean
- null: exact null
- arrays: exact ordered sequence
- objects: exact structure with stable key ordering

The runtime should use stable JSON-like encoding with type-preserving semantics, not ad hoc stringification.

Examples:

- `"1"` != `1`
- `["a", "b"]` != `["b", "a"]`
- `"Mark@example.com"` != `"mark@example.com"`

This is deliberate. If the model transforms a value, attestation is lost.

## Propagation Semantics

### Normal mlld evaluation

Inside normal mlld evaluation, attestation follows the value the same way other descriptor metadata follows the value:

- variable assignment preserves attestation
- field access preserves attestation when the field value is the attested value
- function calls preserve attestation through direct value passing
- structured values preserve attestation on the relevant subvalues

This is existing value-lineage behavior extended with an explicit attestation channel.

### Native tool boundary: outgoing model args

Before a native tool call is executed, the runtime must build arg descriptors in two steps:

1. Apply conversation-wide taint from the taint accumulator
2. Rebind per-arg attestations by exact canonical-value lookup in the attestation index

These are independent steps.

The current design incorrectly merges them into one descriptor. That must be removed.

### Native tool boundary: incoming tool results

When a tool result returns:

1. Extract taint-like labels and merge them into the conversation taint accumulator
2. Extract attestation-bearing values and register them in the attestation index
3. Preserve full provenance on the returned value itself

Attestation registration must operate on descriptor-bearing values, not arbitrary text fragments.

For structured values:

- index the exact structured value when that structured value itself is attested
- index subvalues only when those subvalues themselves carry attestation metadata

The runtime must not recursively mark every substring of an attested object as attested.

## Rule Semantics

### Negative checks read taint

These rules consume taint/risk metadata:

- `no-untrusted-destructive`
- `no-untrusted-privileged`
- `no-secret-exfil`
- `no-sensitive-exfil`
- `no-influenced-advice`

These continue to behave conservatively and may use the conversation taint accumulator on native tool-calling paths.

### Positive checks read attestation

These rules consume arg-specific attestation:

- `no-send-to-unknown` requires `known`
- `no-send-to-external` requires `known:internal`
- `no-destroy-unknown` requires `known`

These must not be satisfied by conversation history alone.

The question for these rules is:

- does this current arg carry a matching attestation?

not:

- did the conversation ever contain a matching value earlier?

### Prefix matching

Attestation matching follows namespace-prefix semantics:

- requirement `known` matches `known` and any `known:*`
- requirement `known:internal` matches only `known:internal` and its own refinements, if introduced later

## Authorization Semantics

### Problem

Planner-generated authorizations create a separate issue:

- the planner runs in one conversation
- the worker runs in another
- the worker's attestation index starts empty

So a worker emitting `"mark@example.com"` cannot rely on same-session exact-value rebinding if that value was only learned in the planner session.

### Design

`policy.authorizations` becomes the intentional cross-session attestation bridge.

When the planner compiles an authorization for a pinned value:

- the compiler records the attestation requirements satisfied by that pinned value at plan time

Conceptually:

```json
{
  "authorizations": {
    "allow": {
      "send_email": {
        "args": {
          "recipients": ["mark@example.com"]
        },
        "attestations": {
          "recipients": ["known"]
        }
      }
    }
  }
}
```

The exact syntax is an implementation detail. The key point is semantic:

- the compiled privileged guard knows whether the pinned value was planner-attested
- a pinned value that lacked required attestation at plan time cannot override a positive check

### Resulting behavior

### Same-session worker without authorization

- `get_iban()` returns `known` `"acct-1"`
- model later emits `recipient: "acct-1"`
- exact-value rebind attaches `known`
- `no-send-to-unknown` passes

### Same-session worker with injected value

- model emits `recipient: "attacker-iban"`
- no exact-value match in attestation index
- no `known` attestation
- `no-send-to-unknown` fails

### Cross-session planner -> worker authorization

- planner resolves `"mark@example.com"` from an attested source
- authorization compiler records that the pinned value satisfied `known`
- worker later emits the same pinned value
- privileged authorization guard may satisfy the inherited positive check because the capability itself was minted from an attested planner value

This is correct. The authorization is the cross-session trust bridge.

## FunctionRouter Requirements

The current router behavior must be replaced.

Today it effectively keeps one accumulated `conversationDescriptor` and reapplies it to later tool calls. That is the root cause of trust smearing.

The router must instead maintain:

```typescript
class FunctionRouter {
  private conversationTaint?: SecurityDescriptor;
  private attestationIndex: Map<CanonicalValueKey, AttestationIndexEntry>;
}
```

### Required behavior

1. `buildToolCallSecurityDescriptor()` returns taint-only conversation influence, not attestation.
2. Tool-result merging updates:
   - `conversationTaint`
   - `attestationIndex`
3. Arg preparation performs exact-value attestation rebinding before execution.
4. No `known` / `known:*` entry may be copied from one unrelated arg to another merely because both occur in the same conversation.

## Implementation Requirements

### 1. Security descriptor and introspection surfaces

The runtime must gain a first-class attestation channel rather than continuing to overload `labels`.

Required changes:

- `SecurityDescriptor` stores taint and attestations as distinct concepts
- descriptor serialization and deserialization preserve attestation records
- merge logic preserves value-scoped attestations on the value they belong to and does not accidentally widen them
- guard/runtime context exposes `@mx.attestations` for policy and user guard evaluation
- diagnostics and denied messages for positive checks explain missing attestation rather than generic missing labels

Compatibility note:

- `@mx.labels` may temporarily mirror `known` / `known:*` during migration
- built-in rule evaluation must not read that mirror as the source of truth

### 2. Native tool router state and rebinding

The native tool-calling runtime must stop using one merged conversation descriptor for all later tool calls.

Required changes:

- replace the single accumulated trust-bearing descriptor with two runtime structures:
  - conversation taint accumulator
  - attestation index keyed by canonical value
- tool-result processing classifies `known` / `known:*` into the attestation index and taint labels into the conversation accumulator
- arg preparation applies conversation taint first and then exact-value attestation rebinding per arg
- structured values use canonical JSON-like keys so exact arrays/objects can be rebound when unchanged

The router must never infer attestation from partial string overlap, token overlap, semantic similarity, or approximate normalization.

### 3. Built-in policy rule evaluation

Built-in policy rules must consume the correct channel.

Required changes:

- negative/taint rules continue to evaluate taint on current args/inputs and may incorporate conversation-scoped taint from the native tool session
- positive rules evaluate arg-specific attestations only
- positive rules use prefix matching for the `known` namespace:
  - `known` accepts `known` or `known:*`
  - `known:internal` accepts `known:internal` and future refinements under that namespace

The implementation must make this separation explicit in runtime code rather than relying on accidental descriptor contents.

### 4. Authorization compilation and execution

Authorizations are the intentional mechanism for carrying attested trust across planner and worker sessions.

Required changes:

- planner-time authorization compilation records the attestation requirements satisfied by each pinned value
- the compiled authorization representation preserves those requirements per constrained arg
- privileged authorization guards inherit positive-check requirements from the active built-in rules and satisfy them only when the pinned capability was minted from an appropriately attested value
- a pinned value that lacked attestation at plan time must not gain the power to override a positive check at execution time

This keeps worker-session safety aligned with same-session attestation semantics without relying on ambient conversation history.

### 5. Migration behavior

The implementation should preserve existing user syntax while changing runtime semantics.

Required behavior during migration:

- existing `exe known ...` and `exe known:* ...` declarations continue to parse unchanged
- no existing rule names change
- positive-check outcomes may become stricter on native tool paths where trust was previously smeared conversation-wide
- diagnostics should make that change legible by explaining that the current arg value is not attested

## Verification

Implementation is not complete without focused regression coverage.

### Unit tests

Add or update unit tests for:

- canonical value key generation for strings, numbers, booleans, arrays, and objects
- attestation prefix matching (`known` vs `known:*`)
- descriptor merge behavior that preserves value-scoped attestation without widening it
- separation between taint accumulation and attestation indexing

### Native tool runtime tests

Add router/runtime tests covering:

- a `known` tool result reused exactly in a later tool arg passes a positive check
- an unrelated later value does not inherit `known` from earlier conversation history
- taint labels such as `untrusted` continue to affect later tool outputs conversation-wide
- transformed values lose attestation even when they are visually similar to the original value
- exact structured values can rebind when emitted unchanged

### Policy tests

Add policy-focused tests covering:

- `no-send-to-unknown` reads attestation and does not consult ambient conversation trust
- `no-send-to-external` requires `known:internal`
- `no-destroy-unknown` requires `known`
- taint rules such as `no-untrusted-destructive` still trigger from conversation-scoped taint in native tool flows

### Authorization tests

Add authorization tests covering:

- planner-generated pinned values that were attested can satisfy inherited positive checks in the worker
- planner-generated pinned values that were not attested cannot override positive checks
- unconstrained authorization does not bypass attestation-based positive checks
- worker execution does not depend on the worker conversation having independently rebuilt the planner's attestation index

### Regression tests

Include explicit regressions for the original trust-smearing bug:

- one `known` tool result earlier in a conversation must not cause a later unrelated `send_money("attacker-iban")` call to pass
- conversation history containing a `known` value in prompt text or untrusted tool output must not satisfy a positive check

## Built-in Attestation Namespace

For this spec, the built-in attestation namespace is:

- `known`
- `known:*`

This namespace is reserved by the runtime.

### Explicitly in scope

- `known`
- `known:internal`
- `known:verified`
- future `known:*` refinements

### Explicitly not in scope

- treating arbitrary non-`known` labels as attestations
- deriving attestation semantics from active policy rules
- treating `trusted` as a generic attestation without a stricter definition

If mlld later needs user-defined attestation namespaces, that should be added explicitly in a future design. It should not be approximated by guessing from label names or active rules.

## UX Examples

### Trusted value reused exactly

```mlld
exe known @get_iban() = [...]
exe exfil:send, tool:w @send_money(recipient, amount) = [...]

@claude("Find my iban and send $100 to it", { tools: [@get_iban, @send_money] })
```

Expected behavior:

- `get_iban()` returns an attested value
- model copies that exact value into `recipient`
- runtime rebinds `known`
- send passes `no-send-to-unknown`

### Injected value copied from file

```mlld
exe untrusted @read_file(path) = [...]
exe exfil:send, tool:w @send_money(recipient, amount) = [...]

@claude("Read the file and pay the bill it mentions", { tools: [@read_file, @send_money] })
```

Expected behavior:

- file content taints the conversation as `untrusted`
- injected IBAN is not in the attestation index
- `recipient` has no `known`
- send fails `no-send-to-unknown`

### Model transforms the value

If a tool returns:

```text
CH9300762011623852957
```

and the model emits:

```text
ch9300762011623852957
```

or:

```text
CH93 0076 2011 6238 5295 7
```

the attestation does not transfer.

This is correct behavior. If the value cannot be proven identical, it is not trusted.

## Compatibility and Migration

### Compatibility

- Existing declaration syntax for `known` and `known:*` remains valid.
- Existing policies continue to name `known` and `known:internal`.
- Existing taint behavior remains unchanged.

### Migration

The main migration item is introspection:

- built-in rules and policy internals must stop reading `labels` for positive checks
- guards and diagnostics should migrate toward `@mx.attestations`

If a temporary compatibility mirror is retained in `@mx.labels`, it must be treated as transitional only. The source of truth is the attestation channel.

## Deferred Work

### 1. Reference/handle-based attestation transport

Exact-value rebinding is sufficient for the common case, but it does not handle transformed or recomputed values. A future design may let tools return opaque refs and later tools consume refs directly.

That is out of scope here.

### 2. User-defined attestation namespaces

This spec reserves only `known` / `known:*`.

If users later need custom attestation namespaces, mlld should add an explicit declaration mechanism. That future work should build on the same runtime model, not replace it.

### 3. Rich attestation issuers and verification classes

The runtime may eventually distinguish:

- source attestation
- cryptographic verification
- policy-derived approval

Those all fit under the same attestation model, but the initial implementation need not expose them all.

## Security Properties

This design guarantees:

1. A positive trust claim is never satisfied by ambient conversation exposure alone.
2. Taint remains conservative across native tool-calling sessions.
3. Exact trusted values can still flow naturally through tool-calling UX.
4. Cross-session planner authorization can intentionally bridge attested values.
5. The data-model semantics are stable regardless of which policy rules are enabled.

## Summary

The correct long-term fix is not "stop copying `known` in one place." It is:

1. Treat `known` / `known:*` as a built-in attestation namespace
2. Split attestation from taint in the runtime model
3. Keep taint conversation-scoped
4. Keep attestation value-scoped
5. Rebind attestation across native tool calling by exact canonical-value match
6. Carry planner-attested pinned values through compiled authorizations as an intentional cross-session capability

That preserves the current UX, fixes the bridge bug correctly, and gives mlld a principled long-term model for value trust.

---

## Appendix: Current Implementation Note and Data Layer v2 Relationship

This appendix is descriptive, not normative. It explains how the current runtime implementation relates to this spec, and how that implementation compares to the relevant parts of Data Layer v2.

### What the current implementation gets right

The current direction is architecturally correct in one important sense:

- splitting taint from attestation is foundational runtime work
- this is required regardless of whether Data Layer v2 exists
- a richer data layer does not fix trust-smearing by itself

If mlld kept treating positive trust as ambient conversation metadata, then future `fact:` labels from records and stores would smear too. So the runtime split described in this spec is not a workaround for missing data-layer features. It is a prerequisite for using any stronger provenance system safely.

### What the current implementation actually does today

The current implementation has two exact-match lookup paths:

1. **Native tool conversation attestation index**

   The native tool router keeps a conversation-local index of attested values keyed by canonical value. When a tool result carries `known` or `known:*`, the exact returned value can be rebound onto a later tool arg if the model passes that same value back unchanged.

   This is the mechanism that fixes the original native-tool trust-smearing bug:

   - taint remains conversation-scoped
   - attestation is rebound per arg by exact value
   - unrelated later values do not inherit `known`

2. **Execution-wide same-session attestation registry**

   Separately, the runtime now keeps an execution-wide registry on the root environment for same-session authorization compilation.

   This exists because planner/worker flows often look like:

   - planner tool call returns an attested value
   - planner serializes or copies that value into a plain authorization literal
   - `with { policy }` compiles later in the same mlld execution

   At that point the pinned literal may no longer carry a live descriptor. The execution-wide registry lets policy compilation recover the attestation by exact canonical-value lookup, but only within the same execution.

### How same-session authorization compilation works

The current compile-time path is:

1. Resolve the pinned authorization value against the live env.
2. If that resolved value still has a descriptor with `known` / `known:*`, use that directly.
3. If not, fall back to the execution-wide registry and look up the exact value.
4. If there is an exact match, carry the matching attestation into the compiled authorization guard.
5. At worker dispatch time, project that attestation only onto the matched arg for that call.

That last point matters: the authorization does not seed conversation-wide trust. It mints a per-call, per-matched-arg proof.

### Why this is still not the final provenance architecture

The current registry approach is intentionally narrower than Data Layer v2.

It answers:

- "Did this exact value appear earlier in the same trusted execution with a matching attestation?"

It does **not** answer:

- "Which source vouched for this value?"
- "Was this the email field from `@contacts`, or just a generic `known` string?"
- "What trust tier or classification path produced it?"

That is where Data Layer v2 is materially better. Its `record` / `store` / `fact:` model gives mlld a source-addressed trust surface such as:

- `fact:@contacts.email`
- `fact:internal:@contacts.email`
- `fact:customer:@crm.contacts.email`

Those labels are much richer than bare `known`. They encode both trust and provenance.

### So are the current changes architecturally undesirable?

Not as runtime semantics. Yes as a permanent provenance story.

More precisely:

- **Good and necessary:** taint vs attestation split
- **Reasonable bridge:** exact-value attestation rebinding
- **Not ideal as the final model:** relying on generic `known` plus execution-wide value registries as the primary trust substrate

The registry-based implementation is a pragmatic bridge because it preserves current UX and fixes real bugs now. But it should be treated as a compatibility layer and transition mechanism, not the endpoint for trust architecture.

### What Data Layer v2 would improve

The relevant part of Data Layer v2 is not "some other way to do attestation." It is a better answer to where attestation should come from.

Data Layer v2 would provide:

- explicit authoritative facts vs untrusted data
- source-addressed labels tied to records and stores
- field-level provenance suitable for authorization
- a cleaner audit story for why a value is trusted

In that world, positive checks can move from generic `known` toward source-aware facts where appropriate. For example, a send destination could require a store-addressed fact like `fact:internal:@contacts.email` rather than a bare ambient `known`.

### Why Data Layer v2 still does not replace this spec

Even with Data Layer v2, mlld still needs:

- value-scoped positive trust
- taint-scoped contamination
- exact or otherwise principled boundary transport across native tool calling

So the relationship is:

- this spec defines **how trust behaves**
- Data Layer v2 defines **where trusted facts come from**

They are complementary. Data Layer v2 is the better long-term provenance model, but it should be built on top of the attestation semantics in this spec, not instead of them.
