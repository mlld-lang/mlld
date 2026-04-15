# Input Records and Tool Catalog Redesign

**Status**: Draft v2, 2026-04-15
**Related**: `spec-display-labels-and-handle-accessors.md` (output records + role labels), `spec-thin-arrow-llm-return.md` (`->` returns), `docs/src/atoms/core/31-records--basics.md`, `docs/src/atoms/config/07b-policy--authorizations.md`, `docs/src/atoms/mcp/03-mcp--tool-collections.md`, `docs/src/atoms/core/14-exe--metadata.md`
**Decisions locked**: records used as input schemas (validation-only); built-in security concerns (`exact`, `update`, `allowlist`, `blocklist`, `optional_benign`) are first-class **top-level record sections**, not per-field attribute bags; `supply:` as role-keyed contributor schema; dual-shape validator during migration; `description`/`instructions` split; `can_authorize: "role:*" | false | [roles]` shorthand that compiles into policy; `correlate` as record-level property defaulting true for multi-fact records; `handle` as a field type (not an attribute).
**Changed since v1**: (1) The v1 spec introduced a per-field attribute bag grammar (`name: type { exact: true, update: true, ... }`) with a plan to extend to user-defined attributes via `attr @name` in v3. That design was reversed in v2: the built-ins are promoted to top-level record sections (peers of `key:`, `correlate:`, `supply:`, `validate:`), the per-field attribute bag is removed entirely from the grammar, and any future user-extension mechanism is itself deferred as a section-shaped primitive rather than a field-attribute primitive. See §2 for the new shape and §15 for migration impact. (2) `blocklist` is added as the natural peer of `allowlist`. (3) The catalog field `authorizable:` and its policy-side peer `policy.authorizations.authorizable` are renamed to `can_authorize:` / `policy.authorizations.can_authorize` — `authorizable` reads in English as "this role can be authorized," which is the opposite of the intent ("this role can authorize this tool"). `can_authorize` is active-voice and unambiguous.

## Motivation

Tool output has one coherent primitive: **records**. A record unifies shape, fact/data classification, trust refinement, instance identity (`key:` → `instanceKey`), optional fields, named display projections, schema validation, and role-based access — all authored in one place, imported and reused, consumed by `=> record` coercion and display projection.

Tool input is scattered across at least six fields that each express a slice of the same idea:

| Current field | What it expresses |
|---|---|
| `controlArgs` | args that need fact proof |
| `sourceArgs` | args that identify a read source (need proof) |
| `payloadArgs` (implicit) | everything not a control arg |
| `updateArgs` | payload args, at least one non-null required |
| `exactPayloadArgs` | payload args that must appear in task text |
| `correlateControlArgs` | control args must share source-record instance |

Tool-collection layer adds `expose`, `bind`, `optional`, `labels`, overrides of `controlArgs`. The planner sees input shape derived heuristically by `@toolDocs` / `<tool_notes>` from this scatter.

All of this is the same concept: the structural security contract of data entering a tool. Records already express it for data exiting a tool. This spec factors tool input through records, collapses the scatter into one primitive, and makes the planner-visible tool shape derivable from a single declaration.

**Primary wins**

- Optional control args work naturally via `?` (resolves the user_task_12 class of bugs structurally).
- Payload trust refinement via `data: { trusted, untrusted }` on input records — mlld can distinguish template-derived payload from llm-drafted payload and apply `no-untrusted-destructive` scoping correctly.
- Read and write tools share vocabulary: `facts:` on input = args requiring proof, regardless of whether the positive check is `no-send-to-unknown` or `no-unknown-extraction-sources`.
- Input shape, optionality, control/payload split, exact-text requirements, and update-mutation groups all declared in one place, imported and reused across tools.
- Third-party / MCP tool wrapping becomes purely additive: the suite authors an input record, the catalog composes that with the unchanged third-party exe.

## Goals

- Make records the single structural contract for both tool inputs and tool outputs.
- Collapse `controlArgs`, `sourceArgs`, `payloadArgs`, `updateArgs`, `exactPayloadArgs`, `correlateControlArgs`, `expose`, `optional` into the input record (as `facts:` / `data:` sections, optional `?` markers, and top-level policy sections) wherever they belong structurally.
- Simplify tool catalog entries to a small, fixed set of fields.
- Keep existing exe labels working. Catalog augments, does not replace, exe-level declarations.
- Preserve policy as the source of truth for `authorizations`; catalog `can_authorize` compiles into a policy fragment.
- Provide a migration path: the validator accepts both old and new shapes during v2.

## Non-goals

- User-defined policy sections (`attr @name = ...` or similar). The v2 built-ins are fully grammar-native; no extension mechanism ships. If a concrete need emerges, the extension primitive is expected to register a top-level section, not a per-field attribute.
- Per-field attribute bag grammar. Removed from the spec. The v2 grammar at the field level is exactly `name: type[?]` — no trailing `{ ... }`.
- Record extension / inheritance. Not in this spec.
- Record field-level annotations on **output** records. This spec only extends the grammar for input-side use; output-record field behavior is unchanged.
- Input-side role-based visibility gating. `supply:` declares who contributes a value, not who sees it.
- A new partial-call handle primitive ("mad-lib invocation"). `supply:` is forward-compatible with it; the primitive itself is out of scope here.

---

## 1. Input records

### 1.1 Symmetry and asymmetry with output records

Input records and output records share syntax, field classification vocabulary, optional-field marking, instance identity via `key:`, and the facts/data trust model. One directional asymmetry is load-bearing:

| | Output record | Input record |
|---|---|---|
| Primary action | **Mint** labels (coerce raw → labeled) | **Require** labels (validate that incoming values already carry them) |
| Trigger | `=> record @R`, `as record @R`, `@cast(v, @R)` | Tool dispatch bound via `inputs: @R` on the tool catalog entry |
| On failure | Demote / strict / drop per `validate:` mode | Dispatch denied with compile-time or runtime issue |

An input record never mints a `fact:*` label. If the agent passes a bare literal `"mark@example.com"` for a field declared in `facts:`, the dispatch is denied because the value does not already carry the required fact proof. Input records are **validation schemas** that happen to share syntax with output records; they are not coercion schemas.

The grammar is one grammar. The runtime role differs by context. Documentation and error messages must be explicit about which direction a record is being used in at a given call site.

### 1.2 Grammar

Input records use the same grammar as today's records, with new **top-level sections** that carry policy/provenance rules. Field-level syntax is unchanged — no per-field attribute bag.

```mlld
record @send_email_inputs = {
  facts: [recipients: array, cc: array?, bcc: array?],
  data: {
    trusted:   [subject: string],
    untrusted: [body: string, attachments: array?]
  },

  exact:           [subject],
  allowlist:       { recipients: @internal_domains, cc: @internal_domains, bcc: @internal_domains },
  blocklist:       { recipients: @known_phish_domains },
  optional_benign: [cc, bcc, attachments],

  supply: {
    role:planner: [recipients, subject, cc, bcc],
    role:worker:  [body, attachments]
  },

  key: recipients,
  correlate: true,
  validate: "strict"
}
```

**Field-shape sections** (inline annotations change the field's shape or type):

- `facts: [...]` — fields that must carry fact proof or `known` attestation at dispatch time. Unchanged semantics from output records' `facts:`, except: no minting. Each entry is `name: type[?]`.
- `data: [...]` or `data: { trusted: [...], untrusted: [...] }` — payload fields. Trusted payload entries cannot carry the `untrusted` label at dispatch (validation failure). Untrusted payload entries are expected to carry `untrusted` and are not blocked by `no-untrusted-destructive` when control-arg scoping is active.

**Cross-field policy sections** (apply to one or more named fields; see §2):

- `exact: [field, ...]` — payload fields whose values must appear verbatim in the task text. Replaces legacy `exactPayloadArgs`.
- `update: [field, ...]` — payload fields forming the mutation set. At least one must be non-null on an update dispatch. Replaces legacy `updateArgs`. Requires the tool's labels to include `update:w`.
- `allowlist: { field: <set>, ... }` — each named field's value must be contained in the given set. Replaces ad-hoc per-tool validation code.
- `blocklist: { field: <set>, ... }` — peer of `allowlist`: each named field's value must NOT be contained in the given set. Allowlist and blocklist may coexist on the same field; both must pass.
- `optional_benign: [field, ...]` — acknowledges that each listed optional fact's omission is benign at the backend (§1.2 trailing rule). Suppresses the `optional_fact_declared` advisory.

**Provenance and identity sections**:

- `supply: { role:X: [field, ...], ... }` — declares which role is the authoritative source for a field's value. See §3. (Phase 3.)
- `key: <field>` — identifies the instance-key field for correlation. Same semantics as output records.
- `correlate: true | false` — overrides the default correlation behavior. See §4.
- `validate: "strict" | "drop"` — inherits record semantics; on input records `demote` is rejected because demotion has no meaning without minting.

**Field syntax**:

```
<name>: <type>[?]
```

- `?` after the type marks the field optional (e.g. `notes: string?`, `cc: array?`). Same convention used by output records today — see `docs/src/atoms/core/31-records--basics.md`.
- Supported types: `string`, `number`, `boolean`, `array`, `object`, `handle`.
- No per-field attribute bag. Previously-proposed `{ exact: true }` / `{ update: true }` / `{ allowlist: @x }` field-level syntax is not part of the v2 grammar; the same semantics are expressed via the top-level sections above.

Fields declared in `facts:` or `data:` must match a parameter name on the bound exe. The validator enforces this (see §6.2). Field names referenced by top-level sections (`exact`, `update`, `allowlist`, `blocklist`, `optional_benign`, `supply`, `key`) must all be declared in `facts:` or `data:`.

**Optional facts — the benign-omission rule.** Marking a field in `facts:` as optional (`?`) is an assertion by the record author that *omitting this field produces a benign default at the tool's backend*. The runtime cannot verify this claim — it is a semantic property of the downstream operation.

Do not mark a fact optional if the tool, when the arg is absent, falls back to an implicit default that is sensitive (send to all contacts; delete everything matching; fetch from a default URL). An optional fact must mean: absent arg = no effect scoped to that arg. If omission would change the operation's blast radius, declare the field required and have the planner authorize an empty value explicitly.

The validator emits `optional_fact_declared` as an advisory on every optional fact, asking the record author to confirm benign omission. The acknowledgement is the top-level `optional_benign: [field, ...]` section — listing the field there silences the advisory and records the assertion in source. Absence of the acknowledgement is not an error in v2 but will be elevated to an error in v3 so the assertion is always explicit in source.

### 1.3 Semantics at dispatch

The input record is **unordered metadata**. Parameter spread order at dispatch is the exe's declared parameter order, unchanged from today. The record declares *which* checks apply to *which* named field; it does not reorder arguments.

At **builder time**, `@policy.build(..., @tools, { task })` validates the planner's proposed values against the input record before compiling a runtime policy fragment. The builder walks the same structural checks the dispatcher will later enforce, plus any section that can be evaluated without live runtime provenance:

1. **Arity / presence.** Required constrained fields must be present when the planner names the tool.
2. **Type check.** Proposed values must match the declared field types.
3. **`facts:` proof check.** Proposed fact fields must already carry fact proof or `known`.
4. **`data.trusted` label check.** Trusted payload fields must not carry `untrusted`.
5. **Builder-phase policy checks.** Run `allowlist`, `blocklist`, `exact`, then `update`. `exact` is builder-only because it needs `{ task }`. `optional_benign` is validator-only. `correlate` and `supply` are skipped here because they need runtime provenance.

For checks that exist at both phases, the builder and dispatcher emit the **same issue code** and differ only by `phase: "build"` vs `phase: "dispatch"`.

When a tool declared with `inputs: @R` is dispatched, the runtime walks `@R`'s sections against the incoming argument map in this order:

1. **Arity / presence.** Required fields must be present. Optional fields (`?`) may be absent. Any incoming arg not in the record is compared against `bind` (§5) and rejected if unmatched.
2. **Type check.** Each value is checked against the declared field type. Mismatches emit `type_mismatch` and dispatch is denied.
3. **`facts:` proof check.** Each non-absent fact field must carry `fact:*` proof OR a compiled `known` attestation from the active policy fragment. Bare literals are rejected as `proofless_control_arg` (write tools) or `proofless_source_arg` (read tools) depending on the tool's labels.
4. **`data.trusted` label check.** Each non-absent trusted-payload field must not carry `untrusted`. Emits `trusted_payload_tainted` on failure.
5. **Cross-field policy section checks.** Run each dispatch-phase section (§2) in the order: `allowlist`, `blocklist`, `update`. Each section walks its named fields against the incoming arg values and produces a section-scoped issue on failure (`allowlist_mismatch`, `blocklist_match`, `no_update_fields`). `exact` does **not** run here; it is builder-only. `optional_benign` is a declarative annotation, not a runtime check — it's consumed by the validator in step 5 of §6.2, not at dispatch.
6. **Record-level `correlate` check.** If correlate is active (§4), all non-absent `facts:` field values must trace to the same source record instance via `factsources.instanceKey` (preferred) or `(coercionId, position)`. Cross-source denies emit `correlate_mismatch`.
7. **`supply:` contributor check.** Each non-absent field's provenance must match an allowed contributor role per the record's `supply:` (§3). Emits `supply_role_mismatch`.

Steps 3–7 each produce a structured issue. The dispatch is denied if any step produces issues at error severity. `@policy.build` reports builder-phase issues in `report` / `issues` and drops the affected entries from the compiled policy; dispatch-phase failures surface as denials. Hand-built `with { policy: ... }` fragments fail closed.

### 1.4 Input records do not participate in `=> record` or `as record`

Input records are only consumed through `inputs: @R` on a tool catalog entry. Writing `=> record @send_email_inputs` or `@value as record @send_email_inputs` is a compile-time error (`input_record_coercion_attempt`). This prevents accidental label minting through an input record and keeps the input/output direction explicit.

A record's intended direction is determined at declaration by its sections:

- A record with any **input-only section** — `supply:`, `correlate:`, `exact:`, `update:`, `allowlist:`, `blocklist:`, `optional_benign:` — is an **input record**.
- A record with `display:` (single-list or named) is an **output record**.
- A record with neither may be used in both directions.

Records used in both directions (no input-only sections, no `display:`) are legal — this is the case today for simple `@contact` records that happen to serve as both output shapes and input-arg constraints.

Declaring both an input-only section and `display:` on the same record is a `mixed_record_direction` error (§14.3). Split into two records.

### 1.5 Error-message discipline for direction

Because one grammar serves two runtime roles, error messages must name the direction explicitly. Every issue emitted from the input-validation path and every issue emitted from the coercion path must include a `direction: "input" | "output"` field and must render with the verb that applies:

- Input-direction issues use verbs like *"required to carry"*, *"must already have"*, *"validated against"*.
- Output-direction issues use verbs like *"coerced into"*, *"minted"*, *"projected"*.

No generic "record @X failed" error text. The direction prefix is mandatory. The same record used in both directions can fail in two different ways on the same field; the runtime must always tell the reader which direction it was walking when the failure occurred. The `.mx.schema` accessor gains a sibling `.mx.validated` accessor on input-direction values so the two paths are queryable separately.

Documentation must similarly be direction-explicit. Any example in a docs atom that shows `=> record @X` or `as record @X` is an **output-direction** example and should be labeled so. Any example showing `inputs: @X` on a catalog entry is an **input-direction** example. Atoms that introduce records for the first time should lead with the direction they are describing, not leave it to inference.

---

## 2. Top-level policy sections

The five built-in policy concerns — `exact`, `update`, `allowlist`, `blocklist`, `optional_benign` — are first-class top-level record sections. They sit alongside `key:`, `correlate:`, `supply:`, and `validate:` as peers. There is no per-field attribute bag in v2; the grammar at the field level is exactly `name: type[?]`.

**Why top-level and not per-field.** Every section listed here expresses a cross-field rule (applies to a named subset of fields) or a provenance/policy assertion. That category of declaration already has precedent as top-level record sections (`key:`, `correlate:`, `supply:`, `validate:` are all top-level and all name fields). The v1 draft put these in a per-field attribute bag; v2 reverses that because (1) these concerns are mlld built-ins, not pluggable decorators, and (2) a shared grammar with a future user-extension mechanism (`attr @name`) created naming-collision hazards before any concrete extension requirement was established. Built-ins are grammar-native; the extension question stays deferred.

### 2.1 `exact: [field, ...]`

Lists payload fields whose values must appear verbatim in the task text provided to `@policy.build(..., { task })`. Case-insensitive, trimmed, substring match. Multiple entries compose: all must match.

**Allowed on**: fields in `data:` (trusted or untrusted buckets).
**Disallowed on**: fields in `facts:`. Fact proof is a different mechanism; use `allowlist:` or `known` attestation for fact constraints.
**Requires**: caller passes `{ task: @query }` to `@policy.build`. If task text is not provided, `exact:` sections are skipped with an `exact_check_skipped_no_task` advisory rather than silently passing.
**Check phase**: builder only.
**On failure**: `exact_not_in_task`.

```mlld
record @update_password_inputs = {
  facts: [],
  data: [new_password: string],
  exact: [new_password]
}
```

Supersedes legacy `exactPayloadArgs: [...]` on the exe `with { ... }` clause.

### 2.2 `update: [field, ...]`

Lists payload fields forming the **mutation set** for an update tool. A dispatch requires at least one named field to have a non-null value; otherwise the intent is rejected and (through `@policy.build`) the entry is dropped.

**Allowed on**: fields in `data:`.
**Disallowed on**: fields in `facts:`. Facts identify the target; updates mutate it. These roles are structurally separate.
**Requires**: the tool's `labels:` must include `update:w`. This is the one label string the attribute runtime interprets directly (§5.3).
**Check phase**: builder and dispatch.
**On failure**: `no_update_fields`.

```mlld
record @update_scheduled_transaction_inputs = {
  facts: [id: string, recipient: string],
  data: [amount: number?, subject: string?, date: string?, recurring: boolean?],
  update: [amount, subject, date, recurring],
  exact: [subject],
  key: id,
  correlate: true
}
```

Supersedes legacy `updateArgs: [...]` on the exe `with { ... }` clause.

### 2.3 `allowlist: { field: <set>, ... }`

A map keyed by field name. Each entry's value is the set the field's value must be contained in. Supersedes ad-hoc per-tool validation helpers that walked approved lists in js/mlld code.

**Allowed on**: fields in `facts:` or `data:`.
**Set shape (v2)**:

- **Record reference** (`@approved_counterparties`): the runtime uses the referenced record's fact-field values as the membership set at check time. If the referenced record isn't an output record with a single fact field, it's a validation error.
- **Array literal or variable** (`["wire", "ach", "check"]`, `@valid_types`): direct membership check.

Exe-valued sets (`allowlist: { recipient: @my_check_exe }`) are not supported in v2. They were proposed for the `attr @name` extension mechanism; deferred with that mechanism.

**On array-typed fields**: the allowlist is applied per element. Proofless/disallowed elements are dropped individually, same as today's array control arg handling.

**Check phase**: builder and dispatch.
**On failure**: `allowlist_mismatch`.

```mlld
record @send_email_inputs = {
  facts: [recipients: array],
  data: [subject: string, body: string],
  allowlist: { recipients: @internal_domains }
}
```

### 2.4 `blocklist: { field: <set>, ... }`

Peer of `allowlist`. Same grammar, inverse semantics: the field's value must NOT be contained in the given set.

**Composition with `allowlist`**: both may appear on the same field. Both checks must pass (i.e., value must be in `allowlist` AND NOT in `blocklist`). Useful for "approved set minus carve-outs" patterns.

**Check phase**: builder and dispatch.
**On failure**: `blocklist_match`.

```mlld
record @fetch_webpage_inputs = {
  facts: [url: string],
  data: [],
  allowlist: { url: @approved_domains },
  blocklist: { url: @known_phish_hosts }
}
```

### 2.5 `optional_benign: [field, ...]`

Declarative annotation acknowledging that each listed **optional fact**'s omission is benign at the tool's backend (§1.2). Suppresses the `optional_fact_declared` advisory for listed fields.

**Allowed on**: optional fields (`?`) in `facts:`. Listing a required fact or a data field is a validation error (`optional_benign_invalid_field`).
**Runtime behavior**: none. This section is consumed at validate time only; it does not fire a dispatch-time check.
**Check phase**: validate only.
**v3**: the advisory becomes an error; `optional_benign:` is no longer optional for optional facts.

```mlld
record @create_calendar_event_inputs = {
  facts: [participants: array?],
  data: [title: string, start_time: string, end_time: string, description: string?, location: string?],
  optional_benign: [participants]
}
```

### 2.6 `handle` — a field type, not a section

To require a field value to arrive as a handle-bearing reference, declare the field's type as `handle`:

```mlld
facts: [
  recipient: handle,           // must be a handle; plain strings fail
  cc: handle?                  // optional; if present, must be a handle
]
```

This is the same `handle` type that output records already use on worker-return fields (`docs/src/atoms/core/31-records--basics.md` §"Supported field types"). One story: `handle` is a field type. On input records it validates; on output records it validates the value produced by coercion.

Fields typed `handle` in input records are implicitly in `facts:` (handles are proof carriers). Declaring `name: handle` in `data:` is a validation error (`handle_on_data`).

### 2.7 Section taxonomy

For reference, grouping all top-level input-record sections by their value shape:

| Section | Value shape |
|---|---|
| `facts`, `data` | Field declaration list (or `data: { trusted, untrusted }` split object) |
| `exact`, `update`, `optional_benign` | Array of field names |
| `allowlist`, `blocklist` | Object keyed by field name, values are sets (record/array) |
| `supply` | Object keyed by role label, values are arrays of field names |
| `key` | Scalar: single field name |
| `correlate` | Scalar: boolean |
| `validate` | Scalar: `"strict"` or `"drop"` |

### 2.8 Why no user-extension mechanism yet

The v1 draft proposed a per-field attribute bag to leave room for a future `attr @name` extension — so user-defined attributes could sit next to built-ins without grammar churn. The v2 design decision: if the five built-ins (plus `handle` as a type) cover every concern we can concretely name, designing a user-extension mechanism for hypothetical future concerns is premature. If an extension primitive ships later, its shape is expected to register a new **top-level section** (not a field attribute), following the established pattern. Concretely: `attr @validator` would register a section name that the runtime dispatches to the named exe. That design is deferred until a specific need surfaces.

---

## 3. `supply:` — role-keyed contributor schema

**Rollout note.** `supply:` is the subtlest part of this spec. Provenance-by-role is correct as a concept but gets edge-case-heavy fast: re-contributed values, `known`-bucket authorship, multi-hop exe chains, imported tools whose inner dispatches carry their own role labels. `supply:` ships in Phase 3 (§13), separately from the core input-record work, with its own test surface and trace events. Suites that migrate to the new shape during Phases 1–2 inherit today's coarse provenance rule (default: facts come from `role:planner`, data may come from any role) until they opt into `supply:` explicitly.

### 3.1 Purpose

`supply:` declares which role is the authoritative source of a field's value at dispatch time. It replaces two current implicit rules:

- "Bucketed intent from influenced sources is rejected" — currently a blanket invariant on the whole intent.
- "Values in `known` must come from the clean planner" — currently enforced by provenance walking inside `@policy.build`.

With `supply:`, the invariant becomes per-field and declarative: *for this field, the contributor must carry one of these role labels.* Fields not listed in any role's supply set inherit the default: `role:planner` for `facts:`, any role for `data:` (effectively today's behavior).

### 3.2 Grammar

```
supply: {
  "role:planner": [recipients, subject],
  "role:worker":  [body, attachments]
}
```

Keys are bare `role:*` label identifiers (unquoted) matching the same namespace used for output records' `display:` and for exe role labels (`spec-display-labels-and-handle-accessors.md` §1). The quoted form (`"role:planner"`) is accepted for parity with object-literal syntax but not idiomatic. Values are arrays of field names declared in `facts:` or `data:`. A field may appear under multiple roles (any listed role can supply it).

### 3.3 Semantics

At dispatch, each non-absent field's value is examined for its **source role** — determined by which role-labeled exe produced or declared it. The runtime walks the value's provenance chain:

- Values carrying `fact:*` proof from a tool result are attributed to the role that dispatched that tool.
- Values in the `known` bucket are attributed to the role that authored the bucketed intent (the planner).
- Values produced directly by a role-labeled llm exe carry that exe's role in their provenance.

If the examined role is not in the field's `supply:` entry, dispatch is denied with `supply_role_mismatch`. The issue includes the actual contributor role and the list of permitted roles.

### 3.4 Forward compatibility with partial-call handles

`supply:` is the declarative surface that a v3 "partial-call handle" primitive would consume: each field gets a slot, each slot is fillable only by a role on the allow list, and the dispatch fires when the slot frame is complete. v2 does not ship partial-call handles; `supply:` in v2 is a dispatch-time validator over the fully-assembled arg frame. Authoring `supply:` in v2 is forward-compatible — no v3 schema change is anticipated.

### 3.5 Interaction with bucketed intent

The planner's bucketed intent (`resolved` / `known` / `allow`) continues to be the authorization emitter. `supply:` narrows it per-field. Today's coarse rule ("entire bucketed intent must be uninfluenced") becomes: each bucket entry is checked against the target field's `supply:` allow list. A tool catalog whose input record omits `supply:` inherits the current coarse behavior (default: `role:planner` supplies facts, any role supplies data).

---

## 4. `correlate:` default behavior

### 4.1 Default

If an input record has more than one field in `facts:` and does not declare `correlate:`, the runtime defaults to `correlate: true`. Multi-fact tools are the canonical cross-record-mixing attack surface; defaulting correlation on matches the secure-by-default stance documented at `docs/src/atoms/config/07b-policy--authorizations.md` §Cross-Arg Correlation.

Single-fact records default to `correlate: false` (there is nothing to correlate against).

### 4.2 Explicit overrides

- `correlate: true` — all non-absent fact fields must share `instanceKey`. Declaring this on a single-fact record is a validator warning, not an error.
- `correlate: false` — no cross-fact correlation check. The tool has multiple independent facts by design.

### 4.3 Field selection

The v1 spec correlates over **all** fact fields. A future revision may allow `correlate: ["recipients", "id"]` to correlate over a subset (for tools with 3+ facts where only 2 must share a source). v2 does not support subset correlation; authoring it should use two separate input records if partial correlation is needed.

### 4.4 Identity resolution

Unchanged from current `correlateControlArgs` semantics: prefer `factsources.instanceKey`, fall back to `(coercionId, position)` for keyless records. Re-fetches of the same logical record (different `coercionId`, same `instanceKey`) correlate correctly.

---

## 5. Tool catalog shape

**The tool catalog is realized as a `var tools` collection.** "Catalog" and "collection" refer to the **same object** throughout this spec — "catalog" names the authoring-facing role (metadata the planner and runtime both read), and "collection" names the runtime primitive (`var tools @x = {...}`) that carries it. There is no separate catalog primitive; a tool's declaration is its `var tools` entry. One declaration, one source of truth, read by planner prompt assembly and runtime dispatch alike. Any pattern that parallels a plain `var @x = {...}` catalog alongside a `var tools @y = {...}` collection for the same tools is a workaround, not the design.

### 5.1 New catalog entry

```mlld
send_email: {
  mlld: @send_email,
  inputs: @send_email_inputs,
  labels: ["execute:w", "exfil:send", "comm:w"],
  can_authorize: "role:planner",
  description: "Send an email message to one or more recipients.",
  instructions: "Prefer update_draft for in-progress composition.",
  bind: { api_key: @internal_api_key }
}
```

Fields:

| Field | Required | Purpose |
|---|---|---|
| `mlld` | yes | Exe reference. Third-party / MCP-imported exes are acceptable; they do not need to carry framework-specific labels. |
| `inputs` | yes for security-relevant tools | Input record describing shape, fact/data split, optional fields, and top-level policy sections (`exact`, `update`, `allowlist`, `blocklist`, `optional_benign`, `correlate`, `supply`). |
| `labels` | yes | Label strings stamped onto the dispatched call at runtime (see §5.3). Augments any labels carried by the `mlld:` exe. |
| `can_authorize` | no (default: `false`) | `"role:X"` or array of role strings, or `false`. Compiles into policy (see §5.4). |
| `description` | recommended | Operation-intrinsic description. Fed to `<tool_notes>` and `@toolDocs`. MCP imports map `mcp.description → description`. |
| `instructions` | no | Context-specific usage guidance. Rendered alongside `description` in tool docs. Kept separate to prevent workflow drift into description. |
| `bind` | no | Map of field name → value. Pre-fills hidden parameters. Bound fields must not appear in the exe's visible parameter list from the LLM's view; the input record must not declare bound fields. |

Removed from the v2 catalog shape: `operation:`, `controlArgs:`, `payloadArgs:`, `exactPayloadArgs:`, `correlateControlArgs:`, `sourceArgs:`, `updateArgs:`, `expose:`, `optional:`, `payloadRecord:`, `kind:`, `risk:`, `semantics:`, and the legacy `authorizable:` field (renamed to `can_authorize:`; boolean form deprecated — see §5.4).

### 5.2 `var tools` collection identity

`var tools @agentTools = { ... }` continues to produce a `ToolCollection` value. Collection identity (preserved through exe params, imports, spread-rejection, etc.) is unchanged. What changes is the shape of each entry.

### 5.3 Labels augmentation

Current behavior (`mcp-tool-gateway`): labels on a collection entry augment labels on the underlying exe. This is preserved.

New: the `labels:` field on a catalog entry is the **canonical** place for framework-specific labels. For exes authored by suite developers, those labels may be declared on the exe directly or on the catalog entry — the effective label set is the union. For third-party / MCP-imported exes, the catalog is the only place labels can be declared; the exe contributes nothing.

Label resolution at dispatch time is **catalog-first**: `@mx.op.labels` is the union of exe labels and catalog entry labels. Guards that fire on `@mx.op.labels.includes("exfil:send")` work against either source transparently.

### 5.3.1 Label vocabulary is a framework concern, not an mlld concern

mlld treats labels as opaque strings with one exception: the `role:*` namespace, which it interprets as display-mode and authorization-identity keys (`spec-display-labels-and-handle-accessors.md` §1), and `update:w`, which it interprets to activate `update:` field-attribute enforcement (§2.2). Every other label — routing, risk, domain — is a **framework convention** over strings.

This spec removes `kind:` and `risk:` as first-class catalog fields because they are framework-specific. mlld core should not enumerate risk categories or dispatch phases; those belong to whatever framework is consuming labels as schema. Different frameworks built on mlld declare different label vocabularies.

**What a framework owes when it uses labels as schema:** treating labels as arbitrary strings destroys review quality. Any framework that derives behavior from labels must:

1. **Declare its label vocabulary** in a loadable schema — namespaces, allowed members per namespace, how many labels per tool are expected in each namespace. Illustrative namespaces a framework might define: routing (`resolve:r`, `extract:r`, `execute:w`, ...), risk (`exfil`, `exfil:send`, `destructive`, `privileged`, ...), domain (`comm:w`, `calendar:w`, `finance:w`, ...). These are examples, not mlld-blessed namespaces — each framework chooses its own.
2. **Validate catalog entries against that vocabulary** at the framework's build entrypoint. Unknown labels in a governed namespace → error. Missing required namespace (e.g., no routing label on a write tool) → error. Conflicting labels within a single-value namespace on the same tool → error.
3. **Render labels as structured fields in generated docs and tool notes.** The planner-facing `<tool_notes>` must not show `labels: ["execute:w", "exfil:send", "comm:w"]` as a raw string array; it must render something like *Routing: execute (write). Risk: exfil (send). Domain: communication (write).* so a reviewer reading the tool notes sees namespaces, not strings.
4. **Derive behavior from the validated namespaces only**, not from ad hoc string matching spread across framework code. If the risk namespace is the mapping surface to `policy.operations`, compute that mapping once from the declared vocabulary — do not `.includes("exfil:send")` in six different places.

This spec documents the contract any such framework must satisfy. It does not name specific frameworks or ship their schemas; those live outside mlld core.

mlld's role is passive: it accepts labels, exposes them through `@mx.op.labels`, and lets guards / policy reference them by string. The `role:*` and `update:w` interpretations are the complete list of label-string meanings mlld itself assigns.

### 5.4 `can_authorize` compiles into policy

`can_authorize: "role:planner"` on a catalog entry does **not** become the source of truth for authorization. It compiles into a `policy.authorizations.can_authorize` fragment that the host (or a framework on top of mlld) contributes to the active policy.

- Catalog `can_authorize: "role:planner"` → `policy.authorizations.can_authorize: { "role:planner": [<tool_name>] }`.
- Catalog `can_authorize: ["role:planner", "role:auditor"]` → multi-role entry.
- Catalog `can_authorize: false` → tool is added to `policy.authorizations.deny`.
- Catalog omits `can_authorize` → no contribution; the tool is denied by default (today's `can_authorize` semantics).

Policy composition (`union`, `replace: true`, locked policies) is unchanged. A policy layer can still restrict or deny a tool that the catalog declared `can_authorize: "role:planner"` — policy wins. The catalog is a default, not an override.

### 5.5 `bind` semantics (unchanged)

`bind: { param_name: value }` pre-fills an exe parameter. The bound parameter must not appear in the input record (which describes only the LLM-facing contract). If the bound value carries labels, those labels flow through the call normally.

Bound values may be `known`-attested, fact-bearing, or plain literals. Plain literal binds do not receive fact labels at bind time — this is deliberate; catalog-author-provided constants are not authoritative tool-result values.

### 5.6 Dynamic dispatch from tool collections

Unchanged: `@agentTools["send_email"](@args) with { policy: @auth.policy }` still dispatches by collection key and spreads `@args` to named params using the catalog entry's input record field order (replacing today's `expose` order).

---

## 6. Validator and runtime changes

### 6.1 Dual-shape acceptance

Throughout v2, `mlld validate` and the runtime accept **both** the current shape (with `controlArgs`, `sourceArgs`, `payloadArgs`, `updateArgs`, `exactPayloadArgs`, `correlateControlArgs`, `expose`, `optional`) **and** the new shape (with `inputs: @R`). Mixing the two on a single catalog entry is rejected with `mixed_tool_shape`.

A migration linter warning (`legacy_tool_shape`) is emitted for entries using the old shape, suppressible via `--allow-legacy-tool-shape` for suites not yet migrated. v3 removes old-shape acceptance.

### 6.2 Validation rules (new shape)

At validate time:

**Field / exe parameter correspondence**:

- Every field in the input record's `facts:` / `data:` must correspond to an exe parameter name on the `mlld:` exe, **or** be explicitly bound via `bind:`.
- Every exe parameter must appear in the input record or in `bind:`. Orphan parameters (not in the record, not bound) are `orphan_exe_param` errors — the tool's contract is incomplete.

**Top-level policy sections — field references**:

- Every field name referenced by `exact`, `update`, `allowlist`, `blocklist`, `optional_benign`, `supply`, or `key` must be declared in `facts:` or `data:`. Undeclared field references emit section-specific errors: `exact_field_undefined`, `update_field_undefined`, `allowlist_field_undefined`, `blocklist_field_undefined`, `optional_benign_field_undefined`, `supply_field_undefined`, `key_field_undefined`.

**`exact:` — constraints**:

- Every field in `exact:` must be in `data:` (trusted or untrusted). Fact fields → `exact_field_not_in_data` error.

**`update:` — constraints**:

- Every field in `update:` must be in `data:`. Fact fields → `update_field_not_in_data` error.
- `update:` fields must be disjoint from `facts:`.
- The tool's `labels:` must contain `update:w` when `update:` is declared non-empty. Missing label → `update_without_label` error.

**`allowlist:` / `blocklist:` — constraints**:

- Each value in the map must resolve to a record reference (with a single fact field) or an array literal / array-valued variable. Other shapes → `allowlist_invalid_target` / `blocklist_invalid_target`.
- Record-reference targets must be output records (have `display:` or be neutral); referencing an input record is `allowlist_target_is_input_record` / `blocklist_target_is_input_record`.
- A field may appear in both `allowlist:` and `blocklist:` simultaneously (intersection semantics).

**`optional_benign:` — constraints**:

- Every field in `optional_benign:` must be an **optional fact** (`?` marker in `facts:`). Listing a required fact, a required data field, or any data field → `optional_benign_invalid_field`.

**`supply:` — constraints**:

- Every `supply:` role key must match the regex `^role:[a-z][a-z0-9_-]*$`.
- Every field in `supply:[role]` must be declared in `facts:` or `data:`.

**Field type and identity constraints**:

- Fields typed `handle` must be declared in `facts:`. On `data:` → `handle_on_data` error (§2.6).
- `key:` must reference a fact field.
- `correlate: true` on a single-fact record emits `correlate_single_fact` warning.

**Direction constraints**:

- Input records may not declare `display:`.
- Output records may not declare any input-only section (`supply:`, `correlate:`, `exact:`, `update:`, `allowlist:`, `blocklist:`, `optional_benign:`).
- Mixing is `mixed_record_direction` error.

At runtime, validation issues are surfaced through the standard denial pipeline (`report`, `issues`, `denied =>` arm handling).

### 6.3 Deprecations and removals

Summary only. The full supersession table, timeline, and removal plan live in §15.

### 6.4 Auto-generated tool docs

`@toolDocs` and `<tool_notes>` / `<authorization_notes>` derive their rendered shape from the input record:

- Control args section: fields in `facts:`, with optional (`?`) flagged, `handle` type noted, `allowlist:`/`blocklist:` set names shown.
- Payload args section: fields in `data:`, split into "trusted payload" and "untrusted payload" subsections when the record uses the object-form `data:`.
- Update args section: fields listed in the record's `update:` section.
- Exact-text args section: fields listed in the record's `exact:` section.
- Supply section: rendered when the active display mode's role is in `supply:`, showing which fields this role authors.

`<tool_notes>` rendering continues to be role-aware per the active `role:*` display mode (`spec-display-labels-and-handle-accessors.md` §1). The planner's view and the worker's view of the same tool differ by which rows appear in the supply section.

---

## 7. Interactions with existing specs

### 7.1 Output records (`docs/src/atoms/core/31-records--basics.md`)

Unchanged. Output records continue to mint labels, coerce via `=> record` / `as record` / `@cast`, project via `display:`. The v2 grammar does not add any per-field syntax on output records (the previously-proposed attribute bag is removed everywhere). Records that declare neither `display:` nor any input-only section (`supply:`, `correlate:`, `exact:`, `update:`, `allowlist:`, `blocklist:`, `optional_benign:`) may continue to serve both roles.

### 7.2 `role:*` labels and display (`spec-display-labels-and-handle-accessors.md`)

The `supply:` schema keys are the same `role:*` strings used for output `display:` and for exe role labels. No additional conventions. The runtime uses one label-string match across all three uses.

### 7.3 `->` / `=->` tool returns (`spec-thin-arrow-llm-return.md`)

Unchanged. `->` values bypass producer-side projection; this spec does not change that. A worker whose `->` expression is constructed from handles and literals stays clean regardless of input-record declarations.

### 7.4 `@policy.build`

The builder's bucketed intent shape (`resolved` / `known` / `allow`) is unchanged. What changes is per-field validation:

- For each entry, look up the target tool's input record.
- For each constrained arg, run the builder-phase checks from §1.3 against the provided value.
- Emit issues in the existing `issues` array with the new issue codes: `proofless_source_arg`, `trusted_payload_tainted`, `supply_role_mismatch`, `orphan_exe_param`, `handle_expected_plain_string`, `correlate_mismatch` (renamed from current correlate-rule issue).

`can_authorize` fields on runtime intent are rejected as before.

### 7.5 Guards

Guard inspection via `@mx.args.<name>` continues to work. `@mx.op.labels` reflects catalog-augmented labels. A new accessor `@mx.op.inputs` returns a structural descriptor of the tool's input record (field list, optionality, attribute summary) for guards that need to reason about tool shape without hardcoding tool-specific knowledge.

---

## 8. Migration guide

1. For each tool in a suite, write or import an input record:
   - Port `controlArgs` entries → `facts:` fields.
   - Port remaining exe params → `data:` fields; split into `trusted` / `untrusted` if the suite is modeling payload trust.
   - Port `sourceArgs` → `facts:` fields (same section; semantics differ by tool labels).
   - Port `updateArgs` → top-level `update: [field, ...]`, and add `update:w` to the tool's labels.
   - Port `exactPayloadArgs` → top-level `exact: [field, ...]`.
   - Port `correlateControlArgs: true` → `correlate: true` on the record (or omit if the default applies).
   - Mark optional params with `?`.
2. Replace the catalog entry's `operation: { ... }` / scattered fields with `inputs: @<tool>_inputs`, keep or move `labels:`, `description:` / `instructions:`, and rename any `authorizable:` entry to `can_authorize:`.
3. Remove `expose:` and `optional:` from the catalog entry; they're now implied by the input record.
4. Remove `with { controlArgs: [...] }` from the exe declaration.
5. Run `mlld validate`; resolve field-name / orphan-param errors.
6. If the suite uses multiple roles and wants declarative provenance, add `supply:` to input records.

Suites may migrate tool by tool. Mixed-shape catalogs are fine; mixed-shape entries are not.

---

## 9. What this spec does not add

- No user-defined policy section mechanism. The v2 top-level sections (§2) are a fixed set. Any future extension primitive (`attr @name` or similar) is expected to register a new top-level section, not a per-field attribute; see §2.8.
- No per-field attribute bag. Removed from the v2 grammar entirely. The field-level syntax is exactly `name: type[?]`.
- No input-side role-based visibility. `supply:` declares contributors, not readers. (Tools expose themselves to whichever role can call them; that is a collection-membership question, not a record question.)
- No partial-call handle primitive.
- No automatic derivation of input records from MCP JSON Schema. Suites hand-author input records for imported MCP tools. A separate tool can generate a scaffold from `mcp.inputSchema` in a future revision.
- No changes to the bucketed-intent shape on `@policy.build`. Only the per-field checks inside the builder change.
- No changes to output records' runtime behavior.

---

## 10. Open questions

1. ~~Attribute-bag grammar on output records in v2~~ — **resolved by v2 spec revision**: the per-field attribute bag is removed from the grammar entirely. There is no "parse and ignore on output records" question because there is no attribute-bag grammar at all.

2. **Default `supply:` for missing records**: today's "bucketed intent from influenced sources is rejected" is blanket. With `supply:` absent, should the runtime emulate the blanket rule (default: facts → `role:planner`, data → any), or require explicit `supply:` for any security-relevant tool? Draft stance: **default to the blanket rule when `supply:` is absent; emit `supply_implicit` advisory in `--trace verbose`.**

3. **`allowlist:` / `blocklist:` value semantics when the target is a record**: does "contained in" walk the record's own fact-bearing values at check time, or does it snapshot at record declaration? Draft stance: **walk at check time** — keeps the list live against runtime additions to the referenced record.

4. **`handle` type on optional facts**: if the value is absent, the handle check does not fire. If the value is present as a bare string, it fails. That's the obvious semantic; confirm no edge case with the runtime's handle-resolution path.

5. **Subset correlation**: should v2 accept `correlate: ["a", "b"]` (correlate over a subset of facts)? Draft stance: **no**; enforce the simple rule, require two records for partial-correlation tools. Revisit if evidence accumulates.

6. **`role:*` label validation**: should the runtime reject `supply:` role names that don't correspond to any known exe role label in the program? Would catch typos (`role:plannner`) statically. Draft stance: **warn, don't error** — some role labels are declared in imported modules and static analysis may miss them.

7. ~~Exe parameter order vs input-record field order~~ — **resolved in §1.3**: exe parameter order is canonical at dispatch; the input record is unordered metadata. §6.4 specifies rendering order for tool-doc sections (control/payload/update/exact/supply), which is a docs concern, not a dispatch concern.

8. **`allowlist` / `blocklist` set types beyond record and array**: a future extension might accept exe-valued sets (`allowlist: { recipient: @my_check_exe }`) for dynamic membership. Draft stance: **deferred to any future `attr @name` extension** — v2 supports record and array only. Calling this out now so the deferral is explicit.

---

## 11. Test coverage targets

- Port the existing `controlArgs` / `correlateControlArgs` / `exactPayloadArgs` test matrix to the new shape; verify behavioral parity.
- Add coverage for `data: { trusted, untrusted }` on input records: trusted entry carrying `untrusted` is denied; untrusted entry carrying `untrusted` is accepted.
- Add `supply:` coverage: fact contributed by `role:worker` is denied when `supply` declares `role:planner`; same fact contributed by `role:planner` is allowed; fields not in any `supply:` entry default per §3.1.
- Optional-control-arg coverage: absent → no proof check; present bare literal → denied; present with proof → allowed. (Direct regression against the user_task_12 class.)
- Bound-param validation: bound field declared in input record → `bound_in_record` error.
- Orphan-param validation: exe has param X not in record and not in bind → `orphan_exe_param` error.
- Dual-shape acceptance: legacy catalog entry + new-shape catalog entry in the same `var tools` → both dispatch correctly; mixed-shape single entry is rejected.
- `can_authorize: "role:planner"` on catalog + `authorizations.deny: [tool]` on policy → tool denied (policy wins).
- MCP import path: `mcp: @gmailMcp.sendEmail` + suite-authored input record → dispatch works, labels are catalog-only, no changes required to the third-party exe.

---

## 12. Verified assumptions

| Assumption | Status | Reference |
|---|---|---|
| Records support `?` optional fields | Verified | `docs/src/atoms/core/31-records--basics.md` §"Supported field types" |
| `key:` minted into `factsources.instanceKey` and used by correlate | Verified | `docs/src/atoms/config/07b-policy--authorizations.md` §Cross-Arg Correlation |
| `data: { trusted, untrusted }` is existing syntax | Verified | `records-basics` §"Data fields can be classified as trusted or untrusted" |
| Tool collection labels augment exe labels | Verified | `docs/src/atoms/mcp/03-mcp--tool-collections.md` §Guard on labels |
| `@mx.op.labels` reads the union of exe + collection labels | Verified | `mcp-tool-gateway` + label-flow implementation |
| Policy composition preserves `authorizations.can_authorize` additively | Verified | `docs/src/atoms/config/07b-policy--authorizations.md` §Composition |
| `@policy.build` accepts bucketed intent and reports `issues` / `report` | Verified | `policy-authorizations` §"Policy builder" |
| Role labels on exes select display mode by default | Verified | `spec-display-labels-and-handle-accessors.md` §1 |

---

## 13. Rollout

The spec ships in four separable phases. `supply:` is deferred behind the core input-record work because provenance-by-role is the subtlest part of the design and benefits from a dedicated rollout with its own test surface.

- **Phase 1 — Input records, catalog shape, `correlate:`, labels handoff.** Record grammar accepts `correlate:` as a top-level section. `mlld validate` handles the new catalog shape with dual-shape acceptance. Runtime honors `inputs:` on catalog entries. `kind:` and `risk:` removed; the framework-label-schema contract (§5.3.1) becomes the extension point for any consuming framework. `@toolDocs` / `<tool_notes>` render the new shape, including the structured label-namespace rendering required by §5.3.1. Benign-omission advisory on optional facts (§1.2 trailing). **Shipped.**
- **Phase 2 — Built-in policy sections.** Record grammar accepts `exact:`, `update:`, `allowlist:`, `blocklist:`, `optional_benign:` as top-level sections. `handle` as a field type (already in output-record grammar; extended to input records). Each section ships with its own test matrix ported from the corresponding legacy field (`exactPayloadArgs`, `updateArgs`) or wired fresh (`allowlist`, `blocklist`, `optional_benign`). Exe-valued `allowlist`/`blocklist` sets remain deferred — record/array only. **Shipped.**
- **Phase 3 — `supply:` and provenance-by-role enforcement.** `supply:` grammar, dispatch-time contributor check, `supply_role_mismatch` issue code. Ships only after Phase 1+2 are stable in consuming suites, and with a dedicated test surface that covers: single-role facts, cross-role data, absence of `supply:` (default behavior parity), re-contributed values (same value supplied by a different role on a subsequent call), `known`-bucket provenance tagging, and interactions with `denied =>` arms on role-mismatched dispatches. The phase includes a trace event (`supply.check`) so rollout debugging has first-class observability.
- **Phase 4 — Legacy removal.** v3 removes legacy-shape acceptance from the validator and runtime. User-extension primitive for top-level sections (if any concrete need has emerged) opens for design. Open-question draft stances (§10) are revisited with data from shipped suites.

Between Phase 1 and Phase 2, catalog authors migrate to `inputs: @R` using only the Phase 1 subset (no `exact`, `update`, `allowlist`, `blocklist`, `optional_benign`); legacy `exactPayloadArgs` / `updateArgs` on the exe `with { ... }` clause continue to work for tools whose contracts require them. Phase 2 lets suites delete the legacy fields. Phase 3 is additive: adopting `supply:` tightens the per-field contract a suite had already authored.

---

## 14. Error catalog

Every error in this catalog is carried on the existing issue/report surfaces (`@policy.build` result `issues`, `mlld validate` output, dispatch-time denial reason, parse/compile failures). Each one is stable-coded so tooling can route on it, tests can assert against it, and documentation can link to it.

### 14.1 Required fields on every issue

Every issue emitted by a runtime or validator path introduced by this spec carries these fields:

| Field | Type | Purpose |
|---|---|---|
| `code` | string | Stable identifier (`proofless_control_arg`). Never reuse; new variants get new codes. |
| `severity` | `"error" \| "warning" \| "advisory"` | Errors fail dispatch / validation. Warnings pass but surface. Advisories inform only. |
| `phase` | `"parse" \| "declare" \| "catalog" \| "framework" \| "build" \| "dispatch" \| "render"` | When the issue fired. Lets tooling filter (e.g., IDE shows only `parse`+`declare` in the editor gutter). |
| `direction` | `"input" \| "output" \| "schema" \| "catalog" \| "framework"` | Which side of the record contract this issue is about. Absent only for shape errors that have no direction (e.g., catalog-level fields). |
| `tool` | string | Tool/collection-key name if applicable. |
| `field` | string | Field/arg name if applicable. |
| `record` | string | Record name if the issue is about a specific record. |
| `expected` / `actual` | any | Structured expected/actual values. Rendered to text by the formatter but kept structured for programmatic use. |
| `hint` | string | One-sentence remediation pointer. Always present on errors; optional on warnings/advisories. |
| `see` | string | Spec / atom reference (`policy-authorizations §Cross-Arg Correlation`). |

The message formatter must not produce generic text. `"record @X failed"` is not a permitted message; the code plus direction plus field must always narrate the specific failure.

### 14.2 Confusable scenarios

Four scenarios where confusable errors are easy to produce and the UX depends on keeping them crisp. The first two are pairs of concrete codes. The third is a cross-cutting distinction carried on every issue by the `direction` field, not a single-code pair. The fourth is a framework/core boundary where mlld-core has no equivalent code at all.

**Scenario 1 — "missing arg" vs "missing proof" (code pair).**

Codes: `missing_required_field` (§14.7) vs `proofless_control_arg` / `proofless_source_arg` (§14.7).

Distinction: missing arg = the key isn't in the arg object at all. Missing proof = the key is there, value is present, but carries no `fact:*` / `known` / handle.

Disambiguation rule: check presence first. If `field in args == false` and the record field isn't optional → `missing_required_field`. If present and value lacks proof → the proofless variant. Never conflate.

**Scenario 2 — "optional fact omitted" vs "optional fact proofless" (code pair).**

Codes: `optional_fact_omitted` (advisory, §14.7) vs `optional_fact_proofless` (error, §14.7).

Distinction: optional fact absent = fine, runtime emits nothing or an advisory in `--trace verbose`. Optional fact present but bare = error.

Disambiguation rule: `field in args == false && optional` → at most the advisory. `field in args == true && optional && no_proof` → `optional_fact_proofless`.

**Scenario 3 — input-direction vs output-direction failure (error class, carried on `direction`).**

Not a single-code pair. Every runtime and validator issue introduced by this spec carries `direction: "input" | "output" | "schema" | "catalog" | "framework"`. The same record type can fail in two different ways on the same field depending on which direction it was being used in, and the `direction` field is what tells them apart.

Formatter rule: direction-appropriate verbs. Input-direction issues use *"required to carry"*, *"validated against"*, *"must already have"*. Output-direction issues use *"coerced into"*, *"minted"*, *"projected"*. No generic *"record @X failed"* text.

**Scenario 4 — framework label rejection vs mlld-core (framework/core boundary, no mlld-core code).**

Codes: `framework_label_unknown` (§14.6) — emitted by a framework, carries `framework` and `schema_version`. mlld-core has no corresponding code. mlld-core never rejects a label by value; it treats labels as opaque except `role:*` (display mode / authorization identity) and `update:w` (§2.2 attribute activation).

Disambiguation rule: if an issue about a label value appears without `framework:`, it is a bug — mlld-core is pretending to own a taxonomy it does not own. Tooling should treat missing `framework` on any label-rejection issue as a test failure.

### 14.3 Parse / grammar errors

Emitted at `phase: "parse"`. Direction `schema`.

| Code | Severity | Trigger | Hint |
|---|---|---|---|
| `unknown_record_section` | error | Unknown top-level section name on a record (neither a builtin shape section nor an input-only policy section nor `display:`) | Check spelling. The v2 section list is closed: `facts`, `data`, `key`, `correlate`, `validate`, `display`, `exact`, `update`, `allowlist`, `blocklist`, `optional_benign`, `supply`. |
| `field_attribute_bag_used` | error | Per-field `{ ... }` trailing bag present after a field type | Removed in v2. Move the concern to the appropriate top-level section: `{ exact: true }` → top-level `exact: [field]`; `{ update: true }` → `update: [field]`; `{ allowlist: @x }` → `allowlist: { field: @x }`; `{ optional_benign: true }` → `optional_benign: [field]`; `{ handle: true }` → change the field's type to `handle`. |
| `supply_key_invalid_format` | error | `supply:` key doesn't match `role:[a-z][a-z0-9_-]*` | Supply keys must be `role:*` identifiers. |
| `mixed_record_direction` | error | Record declares both `display:` and one or more input-only sections (`supply:`, `correlate:`, `exact:`, `update:`, `allowlist:`, `blocklist:`, `optional_benign:`) | Split into two records: one for output (has `display:`), one for input. |
| `input_record_coercion_attempt` | error | `=> record @R`, `as record @R`, or `@cast(v, @R)` where `@R` is input-directed | Input records validate, they don't coerce. Declare a separate output record for minting. |
| `invalid_field_type` | error | Type keyword not in `{string, number, boolean, array, object, handle}` | Use one of the supported field types. |

### 14.4 Declaration / static validation errors

Emitted at `phase: "declare"`. Direction varies.

| Code | Severity | Direction | Trigger | Hint |
|---|---|---|---|---|
| `param_not_in_exe` | error | schema | Input record declares a field that isn't a parameter on the bound exe | Field names must match exe params or appear in `bind:`. |
| `orphan_exe_param` | error | catalog | Exe has a parameter not in the input record and not in `bind:` | Every exe parameter must be covered by the record or explicitly bound. |
| `bound_in_record` | error | catalog | Catalog `bind:` names a field also declared in the input record | A bound param is hidden from the LLM; it cannot appear in the record. |
| `handle_on_data` | error | input | A `handle`-typed field is declared in `data:` | Handles are proof carriers; move to `facts:`. |
| `exact_field_undefined` | error | input | `exact:` references a field not declared in `facts:` or `data:` | Add the field or fix the name. |
| `exact_field_not_in_data` | error | input | `exact:` references a field declared in `facts:` | `exact:` is for payload. Move the field to `data:`, or use `allowlist` for fact constraints. |
| `update_field_undefined` | error | input | `update:` references a field not declared in the record | Add the field or fix the name. |
| `update_field_not_in_data` | error | input | `update:` references a fact field | Mutations are payload, not identifiers. Move the field to `data:`. |
| `update_without_label` | error | catalog | Input record has a non-empty `update:` section but the tool's labels don't include `update:w` | Add `update:w` to the catalog `labels:`. |
| `allowlist_field_undefined` | error | input | `allowlist:` key references a field not declared in the record | Add the field or fix the key. |
| `allowlist_invalid_target` | error | input | `allowlist:` value is not a record reference, array literal, or array-valued variable | v2 allowlist targets: record (with a single fact field) or array. Exe targets are deferred (§10.8). |
| `allowlist_target_is_input_record` | error | input | `allowlist:` references a record that is itself input-directed | Allowlist targets must be output records (their fact values are the membership set). |
| `blocklist_field_undefined` | error | input | `blocklist:` key references a field not declared in the record | Add the field or fix the key. |
| `blocklist_invalid_target` | error | input | `blocklist:` value is not a record reference, array literal, or array-valued variable | Same target shapes as `allowlist:` (§2.4). |
| `blocklist_target_is_input_record` | error | input | `blocklist:` references a record that is itself input-directed | Blocklist targets must be output records. |
| `optional_benign_field_undefined` | error | input | `optional_benign:` references a field not declared in the record | Add the field or fix the name. |
| `optional_benign_invalid_field` | error | input | `optional_benign:` references a required field, a data field, or a required-fact field (not marked `?`) | This section acknowledges optional-fact benign omission only. Remove the entry, or make the field an optional fact. |
| `key_field_undefined` | error | input | `key:` references a field not declared in the record | Add the field or fix the name. |
| `key_not_in_facts` | error | input | `key:` references a field declared in `data:` | Keys identify instances; they must be facts. |
| `correlate_single_fact` | warning | input | `correlate: true` on a record with only one fact | Single-fact records have nothing to correlate. Remove the directive or add facts. |
| `validate_demote_on_input` | error | input | `validate: "demote"` on an input record | Demotion has no meaning without minting. Use `strict` or `drop`. |
| `optional_fact_declared` | advisory | input | Optional fact field not listed in the record's `optional_benign:` section | Confirm that omitting this field produces a benign default. List the field in `optional_benign:` to acknowledge, or make the field required. |
| `supply_field_undefined` | error | input | `supply:` references a field not in `facts:` or `data:` | Remove the reference or add the field. |

### 14.5 Catalog shape errors

Emitted at `phase: "catalog"`. Direction `catalog`.

| Code | Severity | Trigger | Hint |
|---|---|---|---|
| `mixed_tool_shape` | error | Single catalog entry mixes `inputs: @R` with legacy (`controlArgs`, `expose`, etc.) | Use one shape per entry. Mixed shapes will drift. |
| `legacy_tool_shape` | warning | Entry uses only legacy fields | Migrate to `inputs: @R`; legacy acceptance is removed in v3. Suppressible with `--allow-legacy-tool-shape`. |
| `operation_field_deprecated` | error | `operation: {...}` on a catalog entry | Move contents to top-level fields (`inputs`, `labels`, `can_authorize`, `description`, `instructions`). |
| `semantics_renamed` | warning | `semantics:` field used | Rename to `description:`. MCP parity. |
| `can_authorize_invalid` | error | `can_authorize:` value isn't `"role:*"`, an array of those, or `false` | See §5.4. No boolean `true` in v2. |
| `legacy_authorizable_field` | warning | Catalog uses the v1 field name `authorizable:` | Rename to `can_authorize:`. v2 rename; semantics unchanged. |
| `unknown_tool_in_catalog` | error | `mlld:` reference doesn't resolve | Import or declare the exe before referencing it. |
| `expose_with_inputs` | error | `expose:` present alongside `inputs:` | `expose:` is implicit in `inputs:`. Remove it. |
| `optional_with_inputs` | error | `optional:` present alongside `inputs:` | Optionality is declared via `?` on record fields. Remove it. |
| `bind_shadow_warning` | advisory | `bind:` value carries no label but the exe param is security-relevant | Framework-specific lint. Bound constants don't receive fact labels at bind time (§5.5). |

### 14.6 Framework-label-schema errors

Emitted at `phase: "framework"`. Direction `framework`. Every issue carries `framework: "<name>"` and `schema_version: "<version>"`.

mlld-core never emits these. A framework using labels as schema (§5.3.1) must implement these.

| Code | Severity | Trigger | Hint |
|---|---|---|---|
| `framework_label_schema_missing` | error | Framework entrypoint invoked, but no label vocabulary has been declared | The framework owes a loadable label schema. See `<framework>` docs. |
| `framework_label_unknown` | error | Catalog entry declares a label not in any namespace of the framework's schema | Label strings must be vetted before use. Typos land here. |
| `framework_label_missing_required_namespace` | error | Tool's labels don't include a member of a required namespace (e.g., no routing label on a tool the framework needs to route) | Add a routing label (e.g., `execute:w`). |
| `framework_label_namespace_conflict` | error | Multiple labels in a single-value namespace on the same tool | A tool cannot be both `execute:w` and `extract:r`. |

Render-lint for unstructured label presentation in tool docs lives at §14.10 (`tool_notes_label_unstructured`) — it is a docs-generation issue, not a framework-schema validation issue, and the two should not both fire for the same defect.

### 14.7 `@policy.build` / intent validation

Direction `input` (almost always — these are input-side contract checks against the planner's intent). The `Phase` column below records whether a code can fire at builder time, dispatch time, or both.

Existing codes (behavior unchanged but listed for completeness):

- `proofless_control_arg`
- `proofless_resolved_value`
- `known_from_influenced_source`
- `known_not_in_task` *(renamed from `payload_not_in_task` to match its semantic scope — value expected to appear in task text and didn't)*
- `known_contains_handle`
- `superseded_by_resolved`
- `denied_by_policy`
- `unknown_tool`
- `invalid_authorization`
- `requires_control_args`
- `bucketed_intent_from_influenced_source`

New codes introduced by this spec:

| Code | Severity | Phase | Trigger | Hint |
|---|---|---|---|---|
| `proofless_source_arg` | error | `build, dispatch` | Read tool fact-arg (intended as source identity) lacks `fact:*` or `known` | Source args require proof, same as control args. Declare the field in `facts:` and pass a fact-bearing value. |
| `missing_required_field` | error | `build, dispatch` | Required field absent from the dispatched arg object | Add the field to the intent. Check whether you meant it to be optional. |
| `optional_fact_omitted` | advisory | `dispatch` | Optional fact absent — emitted only with `--trace verbose` | Informational. Confirms the optional-benign contract was exercised. |
| `optional_fact_proofless` | error | `build, dispatch` | Optional fact is present but the value carries no proof | Either remove the field from the intent (absence is fine) or provide a proof-carrying value. |
| `trusted_payload_tainted` | error | `build, dispatch` | `data.trusted` field's value carries `untrusted` | Promote the field to `data.untrusted` if taint is expected, or ensure the upstream path clears taint (trust-refining record, privileged guard). |
| `no_update_fields` | error | `build, dispatch` | Tool whose input record declares a non-empty `update:` section was dispatched with all listed fields null/absent | Include at least one mutation. An update with no changes is rejected. |
| `exact_not_in_task` | error | `build` | Value of a field listed in `exact:` not found in the provided task text | Verify the value came from the user's task text. LLM paraphrase or summarization will trip this. |
| `exact_check_skipped_no_task` | advisory | `build` | `exact:` section present but `@policy.build` was not passed `{ task: @query }` | `exact:` requires task text to verify against. Pass `task` to the builder, or remove the section. |
| `handle_expected_plain_string` | error | `build, dispatch` | Field typed `handle` received a bare string | The planner must pass the handle (or handle wrapper) from the prior tool result, not a retyped value. |
| `type_mismatch` | error | `build, dispatch` | Incoming value doesn't match declared field type | Check the intent shape against the input record's type declarations. |
| `extraneous_field` | error | `build, dispatch` | Arg object contains a key not declared in the record or `bind:` | Remove the field, or add it to the record. |
| `allowlist_mismatch` | error | `build, dispatch` | Value not contained in the named field's `allowlist:` set | Use a value from the declared allowlist, or update the allowlist. |
| `blocklist_match` | error | `build, dispatch` | Value contained in the named field's `blocklist:` set | The value is explicitly denied by the record's blocklist. Check whether the value was sourced from an untrusted surface. |
| `correlate_mismatch` *(renamed from the current correlate-rule issue)* | error | `dispatch` | Multiple fact-arg values on the same dispatch trace to different source record instances | All fact args must come from the same source record. Check that the planner is pairing identifiers and payloads from one record. |
| `missing_factsource_for_correlate` | error | `dispatch` | Correlate active, but one of the fact-arg values has no `factsources` metadata (constructed without record coercion) | Values participating in correlation must have passed through `=> record` coercion. |

### 14.8 Dispatch-time errors (hand-built `with { policy: ... }`)

Any code above whose `Phase` column includes `dispatch` can fire here when a hand-built policy fragment bypasses `@policy.build`. Builder-only checks such as `exact_not_in_task` stay builder-only. Additional dispatch-only codes:

| Code | Severity | Phase | Direction | Trigger | Hint |
|---|---|---|---|---|---|
| `policy_dispatch_proofless` | error | dispatch | input | Dispatched arg value lacks required proof and the fragment was hand-built | Run the intent through `@policy.build` — it soft-drops proofless values instead of failing closed. Hand-built fragments require proof already attached. |
| `dispatch_arg_absent_required` | error | dispatch | input | Required field not on the dispatched arg object | Fill in the field or mark it optional in the record (only if omission is benign). |

### 14.9 `supply:` — Phase 3

All at `phase: "dispatch"` (build-phase `supply:` checks happen when the planner's intent is bucketed; dispatch-phase checks happen on any path that bypasses `@policy.build`).

| Code | Severity | Direction | Trigger | Hint |
|---|---|---|---|---|
| `supply_role_mismatch` | error | input | Value's contributor role not in the field's `supply:` allow list | Check which role produced this value. If the field should be supplied by this role, update `supply:` on the record. |
| `supply_role_untraceable` | error | input | Value has no role-attributable provenance (constructed in raw mlld code outside any role-labeled scope) | Pass the value through a role-labeled exe, or widen `supply:` to accept unlabeled contributors (deliberate opt-in). |
| `supply_known_provenance_ambiguous` | warning | input | `known` bucket value whose role-of-authorship can't be inferred from context | Tag `known` entries with their originating role, or structure the bucketed intent so the planner is the unambiguous author. |

### 14.10 Render-time / documentation

Emitted at `phase: "render"`. Direction `framework` (these are lint errors about docs generation).

| Code | Severity | Trigger | Hint |
|---|---|---|---|
| `tool_notes_label_unstructured` | advisory | `<tool_notes>` emitted raw label-string array | §5.3.1 requires structured namespace rendering. Update the renderer. |
| `tool_notes_missing_description` | warning | Tool has no `description:` (and no MCP-imported description) | Add a description; the planner gets less context without it. |
| `tool_notes_missing_supply_section` | advisory | Input record has `supply:` but tool notes don't render the supply section for the active role | Update the renderer to surface per-role supply so the planner sees who's expected to provide what. |

### 14.11 Cross-cutting message discipline

- **Every error message states the direction in its first clause.** *"Input-direction validation: field `recipients` on tool `send_email` …"* or *"Output-direction coercion: field `email` on record `@contact` …"*.
- **"Missing arg" and "missing proof" are never merged.** The formatter checks presence first; a missing-proof message never shadows a missing-arg message.
- **Optional-fact advisories never render as errors.** The advisory stream is distinct; a UI surfacing advisories as errors is a UX bug.
- **Framework label errors always name the framework and the schema version.** *"<framework> label schema v1.3: label `exfli:send` not in `risk` namespace. Did you mean `exfil:send`?"* — not *"unknown label"*.
- **Hints are imperative and specific.** *"Add `update:w` to the catalog `labels:`"* — not *"check your configuration"*.
- **Every hint that points to a spec or atom uses a stable link form.** `see: "spec-input-records-and-tool-catalog §14.4"` is parseable; free-form prose isn't.

### 14.12 Test surface

Every error in the catalog requires at least one test that:

1. Triggers the error.
2. Asserts on `code`, `severity`, `phase`, `direction`.
3. Verifies the hint text is non-empty and points to a resolution.
4. For confusable pairs (§14.2), verifies the other member of the pair is NOT emitted in the triggering scenario.

The test suite under `tests/cases/errors/input-records/` mirrors this catalog. Each error code has a fixture that produces it; the fixture's `error.md` asserts the exact issue object (not just the error code) so regressions in `direction`, `phase`, or `hint` presence are caught.

---

## 15. Supersession and removal

This spec supersedes the scattered tool-input metadata surface that accumulated on exes, tool collections, and policy. Every legacy surface has a named replacement and a scheduled removal. Nothing is left dual-purpose.

### 15.1 Supersession table

One row per legacy surface. The "Replacement" column is the sole mechanism that takes over after Phase 4. "Legacy behavior" describes what the surface did; "Status in Phase N" gives the per-phase lifecycle.

| Legacy surface | Location | Legacy behavior | Replacement | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---|---|---|---|---|---|---|---|
| `with { controlArgs: [...] }` | exe declaration | Marks security-relevant params | `facts: [...]` in input record on catalog | warn (`legacy_tool_metadata`) | warn | warn | **removed** — grammar rejects the clause |
| `with { sourceArgs: [...] }` | exe declaration | Marks read-source identity params | `facts: [...]` on input record of a read-tool catalog entry | warn | warn | warn | **removed** |
| `with { updateArgs: [...] }` | exe declaration | Mutation-set fields | Top-level `update: [field, ...]` on input record + `update:w` label | warn | warn | warn | **removed** |
| `with { exactPayloadArgs: [...] }` | exe declaration | Must-appear-in-task fields | Top-level `exact: [field, ...]` on input record | warn | warn | warn | **removed** |
| `with { correlateControlArgs: true }` | exe declaration | Correlate control args across instance | `correlate:` on input record (default `true` for multi-fact) | warn | warn | warn | **removed** |
| `with { taintFacts: true }` | exe declaration | Override taint scoping | Explicit `data: { untrusted: [...] }` on input record | warn | warn | warn | **removed** |
| `operation: { ... }` | catalog entry | Grouped op-level metadata | Top-level catalog fields (`inputs`, `labels`, `can_authorize`, `description`, `instructions`) | error (`operation_field_deprecated`) | error | error | error (always was) |
| `controlArgs:` | catalog entry | Re-declared control args per exposure | `facts:` in bound input record | error if paired with `inputs:` | error if paired with `inputs:` | error if paired with `inputs:` | **removed** entirely |
| `payloadArgs:` | catalog entry | Explicit payload list | `data:` in input record | error if paired with `inputs:` | error if paired with `inputs:` | error if paired with `inputs:` | **removed** |
| `payloadRecord:` | catalog entry | Separate payload schema | Unified into the single `inputs:` record (`data:` section) | error if paired with `inputs:` | error | error | **removed** |
| `expose: [...]` | catalog entry | Visible parameter list | Union of facts + data in input record | error if paired with `inputs:` | error | error | **removed** |
| `optional: [...]` | catalog entry | Which exposed params are optional | `?` marker on input record fields | error if paired with `inputs:` | error | error | **removed** |
| `kind: "read" \| "write"` | catalog entry | Read/write routing | Framework routing label (`resolve:r`, `execute:w`, etc.) in `labels:` | error if paired with `inputs:` | error | error | **removed** |
| `risk: [...]` | catalog entry | Risk category labels | Framework risk labels in `labels:` (mapped via policy `operations:`) | error if paired with `inputs:` | error | error | **removed** |
| `semantics: "..."` | catalog entry | Tool description | `description:` | warn (`semantics_renamed`) | warn | warn | **removed** |
| `authorizable:` (field name itself, v1 draft spelling) | catalog entry | Ambiguous; see §5.4 rename rationale | `can_authorize:` | warn (`legacy_authorizable_field`) | warn | warn | **removed** |
| `authorizable: true \| false` (boolean form) | catalog entry | Shorthand for planner authorization | `can_authorize: "role:*"` or `false` (no boolean `true`) | error (`can_authorize_invalid`) | error | error | error |
| `contractDescriptions` or equivalent planner-coaching fields | catalog / policy | Free-form planner coaching | `instructions:` (separated from `description:`) | warn | warn | warn | **removed** |
| `bucketed intent from influenced sources` blanket check | `@policy.build` | Coarse "whole intent must be uninfluenced" rule | Per-field `supply:` on input record (Phase 3) | unchanged | unchanged | superseded by `supply:` when declared; coarse check remains as default when `supply:` absent | coarse check remains as default-fallback; suites are encouraged to declare `supply:` |
| `exactPayloadArgs` check keyed off exe metadata | `@policy.build` | Validate `exact` fields against task text | Check driven by top-level `exact:` section on input record | both sources honored | both sources honored | both sources honored | input-record is the only source |
| `correlateControlArgs` check keyed off exe metadata | dispatch runtime | Enforce same-instance correlation | Check driven by `correlate:` on input record (with default) | both sources honored | both sources honored | both sources honored | input-record is the only source |

### 15.2 What is **not** superseded

These surfaces are kept as-is. No deprecation.

- `labels:` on catalog entries and on exe declarations. This spec expands the `labels:` role (collapsing `kind`/`risk`/`domain` into it) but does not remove it.
- `bind:` on catalog entries. Pre-fills hidden params; orthogonal to input-record validation.
- `mlld:` on catalog entries. Names the exe implementation.
- `description:` on catalog entries. Kept — this is what `semantics:` renames to.
- `can_authorize: "role:*" | false | [roles]` on catalog entries. Kept in the new form (renamed from v1 draft's `authorizable:`).
- `policy.authorizations.can_authorize: { "role:*": [@tool, ...] }` on policy. Remains the **source of truth** for role→tool authorization; catalog `can_authorize` compiles into it additively. Policy wins on conflict.
- `policy.authorizations.deny: [tool]`. Unchanged.
- `policy.authorizations.allow: { tool: {...} }` runtime shape. Unchanged — `@policy.build` still emits it.
- `policy.operations: { exfil: [labels], ... }`. Unchanged. Maps framework risk labels to rule-check categories.
- `policy.defaults.rules`. Unchanged. The built-in rules (`no-send-to-unknown`, `no-destroy-unknown`, `no-untrusted-destructive`, `no-untrusted-privileged`, `no-secret-exfil`, `no-sensitive-exfil`, `no-unknown-extraction-sources`, `untrusted-llms-get-influenced`, `no-novel-urls`) continue to exist. Their per-rule scoping (control-args-only vs all-args, etc.) now reads fact vs data from the input record instead of from `controlArgs` / `sourceArgs` lists.
- Record grammar features on output records: `display:`, `when:`, `key:`, `validate:`, trust refinement, root adapters, field remapping, computed fields, array fact fields, schema metadata, import/export, dynamic coercion (`=> record @R`, `as record @R`, `@cast`). All kept, unchanged.
- `->` / `=->` / `=>` tool-return sigils and strict mode. Unchanged.
- `role:*` label namespace and its three uses (display mode, authorization identity, `supply:` keys). Unchanged; this spec reuses the namespace.
- Shelf slots, handles, `@mx.*` accessors, runtime tracing, `denied =>` arms, `resume`/`retry` guards, JS/Python interop rules. Unchanged.

### 15.3 Grammar changes

**Record grammar** — extended (additive, backward-compatible). The field-level syntax is **unchanged**: `name: type[?]`. All new concerns land as top-level sections:

- Top-level `exact: [field, ...]`. Phase 2. Replaces legacy `exactPayloadArgs`.
- Top-level `update: [field, ...]`. Phase 2. Replaces legacy `updateArgs`.
- Top-level `allowlist: { field: <set>, ... }`. Phase 2. Replaces ad-hoc per-tool validation helpers.
- Top-level `blocklist: { field: <set>, ... }`. Phase 2. Peer of `allowlist`.
- Top-level `optional_benign: [field, ...]`. Phase 2. Suppresses `optional_fact_declared` advisory.
- Top-level `correlate: true | false`. Phase 1. See §4.
- Top-level `supply: { role:X: [fields...], ... }`. Phase 3. See §3.

Note: the v1 draft proposed a per-field attribute bag `name: type { attr: value }`. That grammar was removed in v2; the field line is exactly `name: type[?]` with no trailing `{...}`. Parsers and validators must emit `field_attribute_bag_used` (§14.3) on any trailing bag seen in source, pointing the author to the corresponding top-level section.

**Exe `with { ... }` grammar** — removed in Phase 4:

The parser accepts the keys `controlArgs`, `sourceArgs`, `updateArgs`, `exactPayloadArgs`, `correlateControlArgs`, `taintFacts` on the `with` clause through Phase 3 with a warning. In Phase 4, the parser rejects them with a suggested-replacement diagnostic:

```
Error: `with { controlArgs: [...] }` is no longer supported.
Move control-arg declarations to the input record on the tool catalog:

  record @tool_inputs = { facts: [<args>: type] }

  <tool>: { mlld: @exe, inputs: @tool_inputs, ... }

See spec-input-records-and-tool-catalog §15.
```

**Catalog entry grammar** — locked in Phase 4:

After Phase 4, a catalog entry accepts exactly these keys: `mlld`, `inputs`, `labels`, `can_authorize`, `description`, `instructions`, `bind`. Any other key is a parse-time error (`unknown_catalog_field`). No silent ignore.

### 15.4 Documentation supersession

The following atoms require rewrites in Phase 1 to reflect the new surface. Legacy atoms move to `docs/src/atoms-legacy/` with a deprecation notice pointing to the replacement.

| Atom | Change |
|---|---|
| `core/14-exe--metadata.md` | Strip `controlArgs` and `sourceArgs` sections. Remove all `with { controlArgs: [...] }` examples. Add a pointer to the input-record section on catalog entries. |
| `core/31-records--basics.md` | Add §"Input records" describing direction semantics (§1.1, §1.4, §1.5 of this spec), the top-level input-only policy sections (§2: `exact`, `update`, `allowlist`, `blocklist`, `optional_benign`), and the `supply:` / `correlate:` sections (§3, §4; `supply:` flagged Phase 3). |
| `config/07b-policy--authorizations.md` | Rewrite the "Control-Arg Enforcement", "Update and Payload Arg Enforcement", and "Cross-Arg Correlation" sections to read the contract from the input record rather than from exe-level fields. |
| `mcp/03-mcp--tool-collections.md` | Replace `expose`, `optional`, and the flat `controlArgs` re-declaration examples with `inputs: @R` examples. Keep `bind:`, `labels:`, `mlld:`. |
| `security/08-facts-and-handles.md` | Update the full-flow example to show input records on the write tools. |
| `patterns/04-planner.md` | Update the planner-worker examples to the new catalog shape. |
| `patterns/02-guarded-tool-export.md` | Update the guarded export pattern. |

### 15.5 Test supersession

The existing test matrix for `controlArgs`, `correlateControlArgs`, `exactPayloadArgs`, `updateArgs`, `sourceArgs` is **ported**, not duplicated. For each legacy-fixture directory, Phase 1 adds a sibling new-shape fixture with the same expected behavior; Phase 4 removes the legacy fixture.

| Legacy fixture path | New-shape fixture path | Phase 4 action |
|---|---|---|
| `tests/cases/policy/control-args/*` | `tests/cases/policy/input-records/facts/*` | legacy removed |
| `tests/cases/policy/correlate-control-args/*` | `tests/cases/policy/input-records/correlate/*` | legacy removed |
| `tests/cases/policy/exact-payload-args/*` | `tests/cases/policy/input-records/exact-attr/*` | legacy removed |
| `tests/cases/policy/update-args/*` | `tests/cases/policy/input-records/update-attr/*` | legacy removed |
| `tests/cases/policy/source-args/*` | `tests/cases/policy/input-records/source-facts/*` | legacy removed |

Behavioral parity is the acceptance criterion for Phase 1 completion: every legacy fixture produces the same outcome when ported to the new shape. Divergence is a spec bug to be resolved before Phase 2 begins.

### 15.6 Removal gate

Phase 4 removal is gated on:

1. Every known consuming suite migrated to the new shape. No `--allow-legacy-tool-shape` suppressions in tree.
2. Every docs atom in §15.4 rewritten. Legacy atoms relocated.
3. Every legacy fixture in §15.5 has a passing new-shape sibling.
4. The error catalog in §14 has full fixture coverage per §14.12.
5. At least one framework has declared its label schema per §5.3.1 and landed it through the §14.6 error path — this verifies the framework contract is usable in anger, not just designed in isolation.

If any of (1)-(4) is outstanding, Phase 4 does not fire; the legacy surfaces stay warn-level. Gate (5) is waivable with a brief rationale if no consuming framework has exercised the label-schema contract by the time Phase 4 is otherwise ready.
